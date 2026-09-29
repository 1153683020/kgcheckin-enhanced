/**
 * 签到状态持久化（失败连击计数）
 *
 * 用仓库文件 .state/checkin-state.json 记录每个账号的连续失败天数：
 *   - 失败：计数 +1，写回并 commit（用于跨日累计）
 *   - 全部成功：计数清零；仅当此前存在失败记录时才写回并 commit（正常运行不产生提交）
 *   - 连续失败 >= 3 天：通知升级为醒目告警
 *
 * 提交使用 Actions 默认 GITHUB_TOKEN（需 workflow 声明 contents: write），
 * 本地运行（无 GITHUB_ACTIONS 环境）时只读写文件、不 commit。
 */

import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const STATE_FILE = '.state/checkin-state.json'
// 连续失败达到该天数时，通知中升级为“连续失败”醒目告警
export const CONSECUTIVE_FAIL_ALERT = 3

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveState(state) {
  fs.mkdirSync('.state', { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

/**
 * 把状态文件 commit 并推回仓库（仅 Actions 环境执行）
 * @param {string} message 提交信息
 */
function commitState(message) {
  if (!process.env.GITHUB_ACTIONS) return
  try {
    execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], { stdio: 'pipe' })
    execFileSync('git', ['config', 'user.name', 'github-actions[bot]'], { stdio: 'pipe' })
    execFileSync('git', ['add', '.state/checkin-state.json'], { stdio: 'pipe' })
    // diff --quiet：退出码 0 = 无变化（不产生空提交）；退出码 1 = 有变化（抛异常）
    let hasChanges = false
    try {
      execFileSync('git', ['diff', '--staged', '--quiet'], { stdio: 'pipe' })
    } catch {
      hasChanges = true
    }
    if (!hasChanges) return
    execFileSync('git', ['commit', '-m', message], { stdio: 'pipe' })
    execFileSync('git', ['push'], { stdio: 'pipe' })
  } catch (e) {
    // 提交失败不阻断签到流程，仅提示
    console.log('[state] 状态文件提交失败（不影响签到）:', e?.message || e)
  }
}

/**
 * 更新账号的连续失败计数
 * @param {object} state 状态对象（会被原地修改）
 * @param {string} key 账号标识（打码后的 userid，跨运行稳定）
 * @param {boolean} failed 本次是否失败
 * @returns {number} 更新后的连续失败天数
 */
function updateFailCount(state, key, failed) {
  const current = Number(state[key] || 0)
  const next = failed ? current + 1 : 0
  if (next > 0) state[key] = next
  else delete state[key]
  return next
}

export { loadState, saveState, commitState, updateFailCount }
