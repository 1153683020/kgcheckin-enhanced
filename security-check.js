/**
 * 安全配置自查（手动触发）
 *
 * 面向使用者的一次性"体检"，检查常见错配并给出风险等级：
 *   1. 仓库可见性：Public 仓库日志/artifact 任何人可见（建议 Private）
 *   2. PAT 形状：classic token 全仓库权限风险大；建议 fine-grained + 仅本仓库
 *   3. QR_PASS：未配置则二维码登录被中止
 *   4. 账号 token 健康度：逐账号验证登录态是否有效
 *   5. 通知渠道：已配置几个（无渠道则结果无人知晓）
 *
 * 输出：控制台 + Step Summary + 通知（若配置）。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { printYellow } from './utils/colorOut.js';
import { maskIdentifier, sanitizeForLog } from './utils/safeLog.js';
import { sendNotify } from './utils/notify.js';
import { close_api, send, startService, waitForApi } from './utils/utils.js';

const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY || ''

function appendSummary(md) {
  if (!SUMMARY_FILE) return
  try { fs.appendFileSync(SUMMARY_FILE, md + '\n') } catch { /* 忽略 */ }
}

/** 查询仓库是否私有（需 gh CLI；失败返回 null 表示无法判断） */
function repoIsPrivate() {
  const repo = process.env.GITHUB_REPOSITORY
  if (!repo || !process.env.GH_TOKEN) return null
  try {
    const out = execFileSync('gh', ['api', `repos/${repo}`, '--jq', '.private'], {
      encoding: 'utf8', env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN }, stdio: ['pipe', 'pipe', 'pipe'],
    })
    return String(out).trim() === 'true'
  } catch {
    return null
  }
}

/** 判断 PAT 形状 */
function patShape(pat) {
  if (!pat) return { level: 'info', text: '未配置 PAT（可选；登录后无法自动回写 USERINFO，token 最多两个月过期）' }
  if (pat.startsWith('github_pat_')) return { level: 'ok', text: 'fine-grained PAT（推荐）✓' }
  if (/^(ghp_|gho_)/.test(pat)) return { level: 'warn', text: 'classic PAT：权限覆盖所有仓库，泄露风险大。建议改用 fine-grained（仅授权本仓库、仅 Secrets 读写）' }
  return { level: 'warn', text: '无法识别的 PAT 形状，请确认是否为有效的 GitHub 令牌' }
}

export { patShape }

async function main() {
  const items = []

  // 1. 仓库可见性
  const priv = repoIsPrivate()
  if (priv === true) {
    items.push({ level: 'ok', name: '仓库可见性', text: 'Private ✓ 日志/artifact 不对外公开' })
  } else if (priv === false) {
    items.push({ level: 'warn', name: '仓库可见性', text: '仓库为 Public：Actions 日志/artifact 任何人可见。强烈建议改为 Private（Settings → Danger Zone）' })
  } else {
    items.push({ level: 'info', name: '仓库可见性', text: '无法判断（本地运行或 gh 不可用），如为 Public 请注意日志泄露风险' })
  }

  // 2. PAT 形状
  const pat = process.env.PAT || process.env.GH_TOKEN || ''
  items.push({ level: patShape(pat).level, name: 'PAT 令牌', text: patShape(pat).text })

  // 3. QR_PASS
  items.push(process.env.QR_PASS
    ? { level: 'ok', name: 'QR_PASS', text: '已配置 ✓ 二维码登录加密可用' }
    : { level: 'warn', name: 'QR_PASS', text: '未配置：二维码登录会被中止。请到 Secrets 添加（你自己记得住的口令）' })

  // 4. 账号 token 健康度（需启动 api 服务）
  const USERINFO = process.env.USERINFO
  let accounts = []
  if (USERINFO) {
    try { accounts = JSON.parse(USERINFO) } catch { items.push({ level: 'warn', name: 'USERINFO', text: '格式无法解析，请检查是否为 JSON 数组' }) }
  } else {
    items.push({ level: 'warn', name: 'USERINFO', text: '未配置：尚未登录任何账号，请先完成二维码/手机号登录' })
  }

  if (accounts.length) {
    const api = startService()
    try {
      await waitForApi()
    } catch (e) {
      close_api(api)
      throw e
    }
    let okCount = 0
    const badList = []
    try {
      for (const user of accounts) {
        try {
          const headers = { cookie: `token=${user.token}; userid=${user.userid}${user.dfid ? `; dfid=${user.dfid}` : ''}` }
          const detail = await send(`/user/detail?timestrap=${Date.now()}`, 'GET', headers)
          if (detail?.data?.nickname != null) {
            okCount++
          } else {
            badList.push(maskIdentifier(user.userid))
          }
        } catch {
          badList.push(maskIdentifier(user.userid))
        }
      }
    } finally {
      close_api(api)
    }
    items.push(okCount === accounts.length
      ? { level: 'ok', name: '账号登录态', text: `全部 ${accounts.length} 个账号 token 有效 ✓` }
      : { level: 'warn', name: '账号登录态', text: `${badList.length}/${accounts.length} 个账号 token 失效（${badList.join(', ')}），请重新登录这些账号` })
  }

  // 5. 通知渠道
  const channels = [
    'WECOM_BOT_KEY', 'DINGTALK_BOT_KEY', 'FEISHU_BOT_KEY', 'YUNHU_BOT_KEY',
    'SERVERCHAN_SENDKEY', 'PUSHPLUS_TOKEN', 'TG_BOT_TOKEN', 'BARK_KEY',
    'DISCORD_WEBHOOK', 'MAIL_HOST',
  ].filter(k => process.env[k])
  items.push(channels.length
    ? { level: 'ok', name: '通知渠道', text: `已配置 ${channels.length} 个渠道 ✓` }
    : { level: 'info', name: '通知渠道', text: '未配置任何通知渠道：签到结果只能在 Actions 日志里看' })

  // 输出
  const warnCount = items.filter(i => i.level === 'warn').length
  const icon = warnCount === 0 ? '✅' : '⚠️'
  const title = `${icon} 安全自查：${warnCount === 0 ? '配置良好' : `${warnCount} 项建议改进`}`
  console.log(`\n${title}\n`)
  let content = ''
  let summary = `## ${title}\n\n| 检查项 | 等级 | 说明 |\n|---|---|---|\n`
  for (const i of items) {
    const mark = i.level === 'ok' ? '✅' : i.level === 'warn' ? '⚠️' : 'ℹ️'
    const line = `${mark} 【${i.name}】 ${i.text}`
    console.log(line)
    content += line + '\n'
    summary += `| ${i.name} | ${mark} | ${sanitizeForLog(i.text) || i.text} |\n`
  }
  appendSummary(summary)
  try {
    await sendNotify(title, content)
  } catch (e) {
    printYellow(`通知发送异常: ${e.message}`)
  }

  if (warnCount > 0) {
    // 自查发现建议项不作为失败（不影响任何流程），仅在 Actions 摘要中提示
    printYellow(`\n有 ${warnCount} 项建议改进，详见上方说明（不影响正常使用）`)
  }
}

// 仅作为 CLI 直接运行时执行 main（被测试 import 时不触发）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(async () => { await new Promise(r => setTimeout(r, 300)); process.exit(0) }).catch(e => { console.error(e); process.exit(1) })
}
