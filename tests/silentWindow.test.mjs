import { test } from 'node:test'
import assert from 'node:assert'
import { parseSilentHours, inSilentWindow } from '../utils/notifyWindow.js'

test('parseSilentHours: 合法/非法格式', () => {
  assert.deepStrictEqual(parseSilentHours('0-7'), [0, 7])
  assert.deepStrictEqual(parseSilentHours('23-6'), [23, 6])
  assert.deepStrictEqual(parseSilentHours(' 9-18 '), [9, 18])
  assert.strictEqual(parseSilentHours(''), null)
  assert.strictEqual(parseSilentHours('abc'), null)
  assert.strictEqual(parseSilentHours('25-30'), null)
  assert.strictEqual(parseSilentHours('9'), null)
})

test('inSilentWindow: 普通窗口', () => {
  const w = parseSilentHours('0-7')
  assert.strictEqual(inSilentWindow(w, 0), true)
  assert.strictEqual(inSilentWindow(w, 7), true)
  assert.strictEqual(inSilentWindow(w, 8), false)
  assert.strictEqual(inSilentWindow(w, 12), false)
})

test('inSilentWindow: 跨午夜窗口', () => {
  const w = parseSilentHours('23-6')
  assert.strictEqual(inSilentWindow(w, 23), true)
  assert.strictEqual(inSilentWindow(w, 3), true)
  assert.strictEqual(inSilentWindow(w, 6), true)
  assert.strictEqual(inSilentWindow(w, 12), false)
  assert.strictEqual(inSilentWindow(w, 22), false)
})
