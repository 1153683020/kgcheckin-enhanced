/**
 * 酷狗接口探活哨兵
 *
 * 目的：酷狗改版（签名/URL/风控）后，通常表现为"次日签到失败才发现"。
 * 本脚本每天定时跑一次，用【无需登录】的探针接口走完整链路
 * （本地 api 服务 + 签名/加密 + 真实请求酷狗），提前发现接口异常。
 *
 * 探针选择（均已验证无需登录即可调用）：
 *   1. /login/qr/key   扫码登录密钥下发，返回 qrcode
 *   2. /register/dev   设备注册，返回 dfid（覆盖加密/签名链路）
 *
 * 行为：全部正常 → 静默结束（不发通知）；
 *       任一探针失败（含网络错误）→ 推送告警通知并以非零退出。
 */
import { printGreen, printRed, printYellow } from "./utils/colorOut.js";
import { sendNotify } from "./utils/notify.js";
import { close_api, send, startService, waitForApi } from "./utils/utils.js";

const PROBES = [
  { name: '二维码密钥(/login/qr/key)', path: '/login/qr/key', ok: r => r?.status === 1 && !!r?.data?.qrcode },
  { name: '设备注册(/register/dev)', path: '/register/dev', ok: r => r?.status === 1 && !!r?.data?.dfid },
]

function describeErr(res) {
  const parts = []
  const data = res?.data
  if (data != null && data !== '' && (typeof data !== 'object' || Object.keys(data).length > 0)) {
    parts.push(`data=${typeof data === 'object' ? JSON.stringify(data) : data}`)
  }
  const msg = res?.msg || res?.error_msg
  if (msg) parts.push(`msg=${msg}`)
  parts.push(`error_code=${res?.error_code ?? res?.status ?? '未知'}`)
  return parts.join(', ')
}

async function main() {
  const api = startService()
  try {
    await waitForApi()
  } catch (e) {
    close_api(api)
    throw e
  }

  const fails = []
  try {
    for (const probe of PROBES) {
      try {
        const res = await send(`${probe.path}?timestrap=${Date.now()}`, 'GET', {})
        if (probe.ok(res)) {
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

  const title = `⚠️ 酷狗接口探活异常（${fails.length}/${PROBES.length}）`
  const date = new Date()
  date.setTime(date.getTime() + 8 * 60 * 60 * 1000)
  const dateStr = date.toISOString().slice(0, 16).replace('T', ' ')
  let content = `🕐 探活时间: ${dateStr}\n\n今日自动签到可能失败，请关注下次签到结果。\n\n异常详情:\n`
  for (const f of fails) content += `• ${f}\n`
  try {
    await sendNotify(title, content)
  } catch (e) {
    printYellow(`通知发送异常: ${e.message}`)
  }
  throw new Error('接口探活异常')
}

main().then(async () => { await new Promise(r => setTimeout(r, 300)); process.exit(0) }).catch(e => { console.error(e); process.exit(1) })
