import { test } from 'node:test'
import assert from 'node:assert'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { encryptDirToBundle, decryptBundleToDir } from '../utils/qrCrypto.js'

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kgqr-test-'))
}

// 手工构造加密包（与 qrCrypto 格式一致），用于测试 decrypt 侧的边界
function craftEnc(files, pass) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 })
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify({ files }))), cipher.final()])
  return Buffer.concat([salt, iv, cipher.getAuthTag(), ct])
}

test('加解密往返内容一致（含中文/二进制）', () => {
  const src = tmpdir()
  const out = tmpdir()
  fs.writeFileSync(path.join(src, 'login.html'), '<html>中文 🎵 test</html>')
  fs.writeFileSync(path.join(src, 'qr-1.png'), Buffer.from([0x89, 0x50, 0, 1, 255]))

  encryptDirToBundle(src, path.join(out, 'x.enc'), '口令abc123')
  const files = decryptBundleToDir(path.join(out, 'x.enc'), '口令abc123', path.join(out, 'dec'))

  assert.ok(files.includes('login.html') && files.includes('qr-1.png'))
  assert.strictEqual(fs.readFileSync(path.join(out, 'dec', 'login.html'), 'utf8'), '<html>中文 🎵 test</html>')
  assert.deepStrictEqual([...fs.readFileSync(path.join(out, 'dec', 'qr-1.png'))], [0x89, 0x50, 0, 1, 255])
})

test('错误口令必须失败', () => {
  const src = tmpdir()
  const out = tmpdir()
  fs.writeFileSync(path.join(src, 'a.txt'), 'data')
  encryptDirToBundle(src, path.join(out, 'x.enc'), 'correct')
  assert.throws(() => decryptBundleToDir(path.join(out, 'x.enc'), 'wrong', path.join(out, 'dec')))
})

test('空口令必须失败', () => {
  const src = tmpdir()
  const out = tmpdir()
  fs.writeFileSync(path.join(src, 'a.txt'), 'data')
  encryptDirToBundle(src, path.join(out, 'x.enc'), 'correct')
  assert.throws(() => decryptBundleToDir(path.join(out, 'x.enc'), '', path.join(out, 'dec')))
})

test('篡改密文必须失败（GCM 完整性）', () => {
  const src = tmpdir()
  const out = tmpdir()
  fs.writeFileSync(path.join(src, 'a.txt'), 'data')
  const encFile = path.join(out, 'x.enc')
  encryptDirToBundle(src, encFile, 'correct')
  const buf = fs.readFileSync(encFile)
  buf[buf.length - 1] ^= 0xff // 篡改最后一个字节
  fs.writeFileSync(encFile, buf)
  assert.throws(() => decryptBundleToDir(encFile, 'correct', path.join(out, 'dec')))
})

test('路径穿越防护（decrypt 侧仅取 basename）', () => {
  const out = tmpdir()
  const encFile = path.join(out, 'x.enc')
  fs.writeFileSync(encFile, craftEnc({ '../evil.txt': Buffer.from('evil').toString('base64') }, 'p'))
  const files = decryptBundleToDir(encFile, 'p', path.join(out, 'dec'))
  // ../ 前缀被截断，文件只落在输出目录内
  assert.ok(files.includes('evil.txt'))
  assert.ok(!fs.existsSync(path.join(out, 'evil.txt')))
  assert.ok(fs.existsSync(path.join(out, 'dec', 'evil.txt')))
})

test('损坏的加密文件必须失败', () => {
  const out = tmpdir()
  const encFile = path.join(out, 'x.enc')
  fs.writeFileSync(encFile, Buffer.from([1, 2, 3])) // 过短
  assert.throws(() => decryptBundleToDir(encFile, 'p', path.join(out, 'dec')))
})
