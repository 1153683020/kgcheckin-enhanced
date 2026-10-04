import { test } from 'node:test'
import assert from 'node:assert'
import { patShape } from '../security-check.js'

test('patShape: 未配置', () => {
  const r = patShape('')
  assert.strictEqual(r.level, 'info')
  assert.ok(r.text.includes('未配置'))
})

test('patShape: fine-grained（推荐）', () => {
  const r = patShape('github_pat_XXXXXXXXXXXXXXXXXXXX')
  assert.strictEqual(r.level, 'ok')
})

test('patShape: classic（警告）', () => {
  assert.strictEqual(patShape('ghp_' + 'x'.repeat(36)).level, 'warn')
  assert.strictEqual(patShape('gho_' + 'x'.repeat(36)).level, 'warn')
})

test('patShape: 无法识别（警告）', () => {
  assert.strictEqual(patShape('invalid-token').level, 'warn')
})
