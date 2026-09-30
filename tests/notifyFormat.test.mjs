import { test } from 'node:test'
import assert from 'node:assert'
import { buildCheckinReport, buildAccountReport } from '../utils/notifyFormat.js'

const okUser = {
  nickname: 'AZ***t', status: '成功', listen: '成功', vipClaim: '8/8',
  dayVip: '超级VIP有效', upgrade: '超级VIP有效',
  vipExpiry: '2026-10-02 08:00:00', remainDays: 2, error: '',
}
const badUser = {
  nickname: 'CX***9', status: '失败', listen: '失败', vipClaim: '0/8',
  dayVip: '-', upgrade: '-', vipExpiry: '未知', remainDays: null,
  error: 'token过期',
}

test('全部成功：标题/明细/临期', () => {
  const out = buildCheckinReport('2026-09-30', [okUser], null)
  assert.ok(out.includes('✅ 全部成功（1/1）'))
  assert.ok(out.includes('【AZ***t】'))
  assert.ok(out.includes('🎵 听歌: 成功'))
  assert.ok(out.includes('⬆️ 升级: 超级VIP有效'))
  assert.ok(out.includes('⏰ 到期: 10-02'))
  // remainDays=2 <= 3 应触发临期提醒
  assert.ok(out.includes('临期提醒'))
  assert.ok(out.includes('超级VIP 还剩 2 天'))
})

test('部分成功 + 连续失败告警置顶', () => {
  const out = buildCheckinReport('2026-09-30', [okUser, badUser], { 'CX***9': 3 })
  assert.ok(out.includes('⚠️ 部分成功（1/2）'))
  assert.ok(out.includes('🔥 连续失败告警'))
  assert.ok(out.includes('CX***9：已连续失败 3 天'))
  // 异常账号单独汇总
  assert.ok(out.includes('异常账号'))
  assert.ok(out.includes('CX***9：token过期'))
})

test('无临期时不出临期区块', () => {
  const farUser = { ...okUser, remainDays: 30 }
  const out = buildCheckinReport('2026-09-30', [farUser], null)
  assert.ok(!out.includes('临期提醒'))
})

test('账号管理报表 vip 模式', () => {
  const out = buildAccountReport('vip', [
    { account: 'AZ***t', ok: true, detail: 'VIP到期 2026-10-02', remain: 2, soon: true },
    { account: 'CX***9', ok: false, detail: '查询失败', remain: null, soon: false },
  ])
  assert.ok(out.includes('✅ 【AZ***t】'))
  assert.ok(out.includes('临期'))
  assert.ok(out.includes('❌ 【CX***9】'))
})

test('账号管理报表 refresh 模式', () => {
  const out = buildAccountReport('refresh', [{ account: 'AZ***t', ok: false, detail: '刷新失败' }])
  assert.ok(out.includes('登录刷新'))
  assert.ok(out.includes('❌ 【AZ***t】 刷新失败'))
})

test('shortDate 格式化', () => {
  const out = buildCheckinReport('2026-09-30', [{ ...okUser, vipExpiry: '2026-12-01 13:19:08', remainDays: null }], null)
  assert.ok(out.includes('⏰ 到期: 12-01'))
})
