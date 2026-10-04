/**
 * 多渠道通知模块（插件化）
 *
 * 渠道实现位于 utils/notifiers/，每个渠道一个文件，统一导出：
 *   { name, isConfigured(), send(title, content, opts) }
 * 新增渠道只需在 notifiers/ 下加一个文件并在下方 CHANNELS 列表登记。
 *
 * 个性化：
 *   - NOTIFY_SILENT_HOURS：静默时段（如 '0-7'，北京时间）。时段内只拦截成功通知，
 *     失败/告警照发。见 utils/notifyWindow.js
 *   - NOTIFY_MENTION：失败时 @ 指定成员（企业微信支持），逗号分隔的
 *     userid 或手机号（11 位数字自动识别为手机号）
 */

import wecom from './notifiers/wecom.js'
import dingtalk from './notifiers/dingtalk.js'
import feishu from './notifiers/feishu.js'
import yunhu from './notifiers/yunhu.js'
import serverchan from './notifiers/serverchan.js'
import pushplus from './notifiers/pushplus.js'
import telegram from './notifiers/telegram.js'
import bark from './notifiers/bark.js'
import discord from './notifiers/discord.js'
import mail from './notifiers/mail.js'
import { inSilentWindow, parseSilentHours } from './notifyWindow.js'
import { printGreen, printRed, printYellow } from './colorOut.js'

const CHANNELS = [wecom, dingtalk, feishu, yunhu, serverchan, pushplus, telegram, bark, discord, mail]

/** 解析 NOTIFY_MENTION：userid 与手机号分开（企业微信 mentioned_list / mentioned_mobile_list） */
function parseMention(raw) {
  const list = String(raw || '').split(/[,，\s]+/).filter(Boolean)
  if (list.length === 0) return null
  return {
    userids: list.filter(x => !/^1\d{10}$/.test(x)),
    mobiles: list.filter(x => /^1\d{10}$/.test(x)),
  }
}

/**
 * 发送通知到所有已配置的渠道
 * @param {string} title - 通知标题
 * @param {string} content - 通知正文（纯文本）
 * @param {{ isFailure?: boolean }} opts - isFailure: 失败/告警通知（静默时段不拦截、触发 @提及）
 */
async function sendNotify(title, content, { isFailure = false } = {}) {
  const channels = CHANNELS.filter(c => c.isConfigured())
  if (channels.length === 0) {
    return
  }

  // 静默时段：只拦截成功通知，失败/告警照发
  const spec = parseSilentHours(process.env.NOTIFY_SILENT_HOURS)
  if (spec && !isFailure) {
    const now = new Date()
    now.setTime(now.getTime() + 8 * 60 * 60 * 1000) // 北京时间
    if (inSilentWindow(spec, now.getUTCHours())) {
      printYellow(`当前处于静默时段（NOTIFY_SILENT_HOURS=${process.env.NOTIFY_SILENT_HOURS}），成功通知已跳过（失败/告警不受影响）`)
      return
    }
  }

  // 失败时 @ 指定成员（仅支持企业微信，其他渠道忽略）
  const mention = isFailure ? parseMention(process.env.NOTIFY_MENTION) : null

  printYellow(`正在发送通知到 ${channels.length} 个渠道...`)
  const results = await Promise.allSettled(channels.map(async (ch) => {
    const ok = await ch.send(title, content, { mention })
    return { name: ch.name, ok }
  }))

  let success = 0
  let fail = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.ok) {
      printGreen(`  ✓ ${r.value.name} 发送成功`)
      success++
    } else {
      const name = r.status === 'fulfilled' ? r.value.name : '未知'
      const reason = r.status === 'rejected' ? r.reason?.message : 'HTTP错误'
      printRed(`  ✗ ${name} 发送失败: ${reason}`)
      fail++
    }
  }
  printYellow(`通知发送完成: ${success} 成功, ${fail} 失败`)
}

export { sendNotify }
