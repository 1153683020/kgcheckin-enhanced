import { test } from 'node:test'
import assert from 'node:assert'
import { describeErr, probePassed } from '../utils/probe.js'

test('describeErr: 优先 data，其次 msg，最后错误码', () => {
  assert.strictEqual(describeErr({ data: 'not uuid', status: 0, error_code: 20010 }), 'data=not uuid, error_code=20010')
  assert.strictEqual(describeErr({ msg: '无法升级奖励', error_code: 297000 }), 'msg=无法升级奖励, error_code=297000')
  assert.strictEqual(describeErr({ status: 0 }), 'error_code=0')
  assert.strictEqual(describeErr({}), 'error_code=未知')
  assert.strictEqual(describeErr({ data: {}, status: 0, error_code: 1 }), 'error_code=1') // 空对象 data 跳过
  assert.strictEqual(describeErr({ data: { a: 1 }, error_code: 1 }), 'data={"a":1}, error_code=1')
})

test('probePassed: error_code 基线匹配', () => {
  const probe = { name: 'x', path: '/x', expect: { error_code: 20002 } }
  assert.strictEqual(probePassed(probe, { error_code: 20002 }), true)
  assert.strictEqual(probePassed(probe, { error_code: 20010 }), false)
  assert.strictEqual(probePassed(probe, null), false)
  assert.strictEqual(probePassed(probe, 'error'), false)
})

test('probePassed: status 基线匹配', () => {
  const probe = { name: 'x', path: '/x', expect: { status: 1 } }
  assert.strictEqual(probePassed(probe, { status: 1 }), true)
  assert.strictEqual(probePassed(probe, { status: 0 }), false)
})
