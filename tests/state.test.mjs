import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// 测试隔离：状态文件指向临时目录（必须在动态 import 之前设置）
process.env.KGCHECKIN_STATE_FILE = path.join(os.tmpdir(), `kgcheckin-state-test-${Date.now()}.json`)
const { updateFailCount, loadState, saveState, CONSECUTIVE_FAIL_ALERT } = await import('../utils/state.js')

test('失败累计与成功清零', () => {
  const state = {}
  assert.strictEqual(updateFailCount(state, 'u1', true), 1)
  assert.strictEqual(updateFailCount(state, 'u1', true), 2)
  assert.strictEqual(state.u1, 2)
  assert.strictEqual(updateFailCount(state, 'u1', false), 0)
  // 成功后从状态中删除
  assert.strictEqual(state.u1, undefined)
})

test('不同账号计数独立', () => {
  const state = {}
  updateFailCount(state, 'a', true)
  updateFailCount(state, 'b', true)
  updateFailCount(state, 'b', true)
  assert.strictEqual(state.a, 1)
  assert.strictEqual(state.b, 2)
})

test('阈值常量为 3', () => {
  assert.strictEqual(CONSECUTIVE_FAIL_ALERT, 3)
})

test('loadState/saveState 往返（本地文件）', () => {
  saveState({ x: 5 })
  assert.deepStrictEqual(loadState(), { x: 5 })
  fs.rmSync(process.env.KGCHECKIN_STATE_FILE, { force: true })
  // 清理后 loadState 返回空对象
  assert.deepStrictEqual(loadState(), {})
})

test('Actions 环境优先读 repository variable 注入的 env', async () => {
  process.env.GITHUB_ACTIONS = 'true'
  process.env.CHECKIN_STATE = JSON.stringify({ fromVar: 9 })
  const mod = await import('../utils/state.js')
  assert.deepStrictEqual(mod.loadState(), { fromVar: 9 })
  delete process.env.GITHUB_ACTIONS
  delete process.env.CHECKIN_STATE
})
