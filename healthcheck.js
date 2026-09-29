/**
 * 酷狗接口探活哨兵
 *
 * 目的：酷狗改版（签名/URL/风控）后，通常表现为"次日签到失败才发现"。
 * 本脚本每天定时跑一次，用【零副作用】探针走完整链路
 * （本地 api 服务 + 签名/加密 + 真实请求酷狗），提前发现接口异常。
 *
 * 探针选择（零副作用，避免被风控）：
 *   /user/detail 不带登录态调用：酷狗返回 error_code=20018（未登录）
 *   即可证明签名校验通过、URL 正确、服务端正常响应。
 *   ——不注册设备、不生成二维码 key，不留任何服务端记录。
 *   （注意：不要用 /register/dev 做探针，它每次会注册一个新设备，
 *    大量访问会积累垃圾设备记录导致风控）
 *
 * 行为：探针正常 → 静默结束（不发通知）；
 *       探针异常（含网络错误/签名失效）→ 推送告警通知并以非零退出。
 */
import { printGreen, printRed, printYellow } from "./utils/colorOut.js";
import { sendNotify } from "./utils/notify.js";
import { close_api, send, startService, waitForApi } from "./utils/utils.js";

const PROBES = [
  { name: '网关链路(/user/detail 未登录态)', path: '/user/detail', ok: r => r?.error_code === 20018 },
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
