/**
 * 签到状态持久化（失败连击计数）
 *
 * 连续失败天数需要跨运行累计。持久化方式：
 *   - GitHub Actions 环境：Repository Variable `CHECKIN_STATE`
 *     读：workflow 以 env 注入（${{ vars.CHECKIN_STATE }}），免 API 调用
 *     写：gh api + PAT（PATCH 更新 / POST 创建），不产生 git 提交噪音
 *     未配置 PAT 时写回失败，仅提示（不影响签到）
 *   - 本地运行：本地文件 .state/checkin-state.json
 *     （可用环境变量 KGCHECKIN_STATE_FILE 覆盖，便于测试隔离）
 *
 *   - 连续失败 >= 3 天：通知升级为醒目告警
 *   - 全部成功：计数清零
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const STATE_FILE = process.env.KGCHECKIN_STATE_FILE || '.state/checkin-state.json'
const STATE_VAR = 'CHECKIN_STATE'
// 连续失败达到该天数时，通知中升级为“连续失败”醒目告警
export const CONSECUTIVE_FAIL_ALERT = 3

function loadState() {
  // Actions 环境：优先读 repository variable 注入的 env（免 API 调用）
  if (process.env.GITHUB_ACTIONS && process.env[STATE_VAR]) {
    try {
      return JSON.parse(process.env[STATE_VAR])
    } catch {
      return {}
    }
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

/** 本地文件持久化（也作为 Actions 里写回失败时的兜底记录） */
function saveLocalState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

/**
 * 把状态写回 repository variable（仅 Actions 环境执行，需 PAT）
 * 更新用 PATCH，变量不存在（404）时降级为 POST 创建
 * @param {object} state 状态对象
 */
function saveState(state) {
  saveLocalState(state)

  if (!process.env.GITHUB_ACTIONS) return

  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.PAT || process.env.GH_TOKEN
  if (!repo || !token) {
    console.log('[state] 未配置 PAT，失败计数未能写回 repository variable（无法跨运行累计）')
    return
  }

  const json = JSON.stringify(state)
  const ghEnv = { ...process.env, GH_TOKEN: token }
  try {
    execFileSync('gh', ['api', '-X', 'PATCH', `repos/${repo}/actions/variables/${STATE_VAR}`,
      '-f', `value=${json}`], { env: ghEnv, stdio: 'pipe' })
  } catch {
    try {
      execFileSync('gh', ['api', '-X', 'POST', `repos/${repo}/actions/variables`,
        '-f', `name=${STATE_VAR}`, '-f', `value=${json}`], { env: ghEnv, stdio: 'pipe' })
    } catch (e) {
      // 写回失败不阻断签到流程，仅提示
      console.log('[state] 状态写回 repository variable 失败（不影响签到）:', e?.message || e)
    }
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

export { loadState, saveState, updateFailCount }
