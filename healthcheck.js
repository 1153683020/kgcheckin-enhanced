/**
 * 酷狗接口探活哨兵
 *
 * 目的：酷狗改版（签名/URL/风控）后，通常表现为"次日签到失败才发现"。
 * 本脚本每天定时跑一次，用【零副作用】探针走完整链路
 * （本地 api 服务 + 签名/加密 + 真实请求酷狗），提前发现接口异常。
 *
 * 探针：全路由（除 /register/dev——每次调用会注册一个新设备，有真实副作用）。
 * 无登录态调用是零副作用的（服务端先校验登录即拒绝，不会真的执行业务）。
 *
 * 基线：expect 为各接口当前实测的"未登录错误码"。
 * 可通过 Repository Variable `PROBE_BASELINE`（JSON 数组）覆盖内置默认——
 * 酷狗单方面改错误码时更新 variable 即可，无需改代码。
 *
 * 行为：探针正常 → 静默结束（不发通知）；
 *       探针异常（含网络错误/签名失效）→ 推送告警通知并以非零退出。
 */
import { printGreen, printRed, printYellow } from "./utils/colorOut.js";
import { sendNotify } from "./utils/notify.js";
import { describeErr, probePassed } from "./utils/probe.js";
import { close_api, send, startService, waitForApi } from "./utils/utils.js";

const DEFAULT_PROBES = [
  { name: '用户详情 /user/detail', path: '/user/detail', expect: { error_code: 20018 } },
  { name: '听歌领取 /youth/listen/song', path: '/youth/listen/song', expect: { error_code: 20002 } },
  { name: '广告领取 /youth/vip', path: '/youth/vip', expect: { error_code: 20002 } },
  { name: '单日VIP /youth/day/vip', path: '/youth/day/vip', expect: { error_code: 20002 } },
  { name: '升级VIP /youth/day/vip/upgrade', path: '/youth/day/vip/upgrade', expect: { error_code: 20002 } },
  { name: 'VIP明细 /user/vip/detail', path: '/user/vip/detail', expect: { error_code: 20010 } },
  { name: '二维码密钥 /login/qr/key', path: '/login/qr/key', expect: { status: 1 } },
  { name: '二维码校验 /login/qr/check', path: '/login/qr/check?key=probe', expect: { status: 1 } },
  { name: '手机登录 /login/cellphone', path: '/login/cellphone?mobile=100&code=000000', expect: { error_code: 20010 } },
  { name: '发送验证码 /captcha/sent', path: '/captcha/sent?mobile=100', expect: { error_code: 20010 } },
]

/** 读取探针基线：Repository Variable `PROBE_BASELINE`（JSON 数组）优先，缺失/非法时用内置默认 */
function loadProbes() {
  const raw = process.env.PROBE_BASELINE
  if (!raw) return DEFAULT_PROBES
  try {
    const custom = JSON.parse(raw)
    if (Array.isArray(custom) && custom.length && custom.every(p => p?.name && p?.path && p?.expect)) {
      printYellow('使用 repository variable PROBE_BASELINE 中的自定义基线')
      return custom
    }
    printYellow('PROBE_BASELINE 格式不合法（需 JSON 数组，每项含 name/path/expect），回退内置默认')
  } catch {
    printYellow('PROBE_BASELINE 解析失败，回退内置默认基线')
  }
  return DEFAULT_PROBES
}

async function main() {
  const api = startService()
  try {
    await waitForApi()
  } catch (e) {
    close_api(api)
    throw e
  }

  const probes = loadProbes()
  const fails = []
  try {
    for (const probe of probes) {
      try {
        // path 已带 query 参数时用 & 拼接 timestrap
        const sep = probe.path.includes('?') ? '&' : '?'
        const res = await send(`${probe.path}${sep}timestrap=${Date.now()}`, 'GET', {})
        if (probePassed(probe, res)) {
          printGreen(`探针正常: ${probe.name}`)
        } else {
          printRed(`探针异常: ${probe.name} -> ${describeErr(res)}`)
          fails.push(`${probe.name}: ${describeErr(res)}`)
        }
      } catch (e) {
        printRed(`探针请求失败: ${probe.name} -> ${e?.message || e}`)
        fails.push(`${probe.name}: ${e?.message || e}`)
      }
    }
  } finally {
    close_api(api)
  }

  if (fails.length === 0) {
    printYellow('探活全部正常（静默，不发送通知）')
    return
  }

  const title = `⚠️ 酷狗接口探活异常（${fails.length}/${probes.length}）`
  const date = new Date()
  date.setTime(date.getTime() + 8 * 60 * 60 * 1000)
  const dateStr = date.toISOString().slice(0, 16).replace('T', ' ')
  let content = `🕐 探活时间: ${dateStr}\n\n今日自动签到可能失败，请关注下次签到结果。\n\n异常详情:\n`
  for (const f of fails) content += `• ${f}\n`
  try {
    await sendNotify(title, content, { isFailure: true })
  } catch (e) {
    printYellow(`通知发送异常: ${e.message}`)
  }
  throw new Error('接口探活异常')
}

main().then(async () => { await new Promise(r => setTimeout(r, 300)); process.exit(0) }).catch(e => { console.error(e); process.exit(1) })
