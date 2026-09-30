import { test } from 'node:test'
import assert from 'node:assert'
import { parseVipTime, daysUntil } from '../utils/utils.js'

test('parseVipTime 支持各格式', () => {
  assert.ok(parseVipTime('2026-09-21 12:00:00') instanceof Date)
  assert.ok(parseVipTime('2026-09-21') instanceof Date)
  assert.ok(parseVipTime('1760000000') instanceof Date)   // 秒级时间戳
  assert.ok(parseVipTime(1760000000000) instanceof Date)  // 毫秒级时间戳
  assert.strictEqual(parseVipTime(''), null)
  assert.strictEqual(parseVipTime('not-a-date'), null)
  assert.strictEqual(parseVipTime(null), null)
  assert.strictEqual(parseVipTime(undefined), null)
})

test('daysUntil 计算与边界', () => {
  assert.strictEqual(daysUntil(new Date(Date.now() + 86400e3 * 3)), 3)
  assert.strictEqual(daysUntil(new Date(Date.now() + 86400e3)), 1)
  assert.ok(daysUntil(new Date(Date.now() - 86400e3)) <= -1)
  assert.strictEqual(daysUntil(null), null)
  assert.strictEqual(daysUntil(new Date('invalid')), null)
})
