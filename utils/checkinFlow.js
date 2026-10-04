/**
 * 单账号签到流程（从 main.js 抽出，供并行调度调用）
 *
 * checkinOneAccount(user, state, date, todayDay)
 *   完整处理一个账号：dfid 补齐 → 用户校验 → 周日刷新 token → 听歌领取
 *   → 8 次广告领取 → 单日 VIP 领取 + 升级超级 VIP（按 svip/tvip 状态决策）
 *   → VIP 到期查询 → 失败计数更新
 *   返回 { result, failed, secretChanged, key?, error? } 供 main 汇总。
 *
 * catchToResult(user, err, state)
 *   账号处理异常时构造统一结构（单账号异常隔离，不影响其余账号）。
 */

import { printBlue, printGreen, printMagenta, printRed, printYellow } from './colorOut.js'
import { maskDisplayName, maskIdentifier, sanitizeForLog, summarizeResponse } from './safeLog.js'
import { buildCookieHeader, ensureDfid } from './dfid.js'
import { updateFailCount } from './state.js'
import { daysUntil, parseVipTime, send } from './utils.js'

/**
 * 构造接口错误详情，便于排查：
 * 优先返回非空 data（脱敏），再附 msg，最后附错误码；没有 data 时保留错误码。
 */
function bizErrDetail(res) {
  const parts = []
  const data = res?.data
  if (data != null && data !== '' && (typeof data !== 'object' || Object.keys(data).length > 0)) {
    parts.push(`data=${typeof data === 'object' ? JSON.stringify(sanitizeForLog(data)) : data}`)
  }
  const msg = res?.msg || res?.error_msg
  if (msg) parts.push(`msg=${msg}`)
  parts.push(`error_code=${res?.error_code ?? res?.status ?? '未知'}`)
  return parts.join(', ')
}

async function checkinOneAccount(user, state, date, todayDay) {
  // 确保设备指纹 dfid 存在（风控较严的接口要求真实 dfid；缺失时静默补取，获取到则稍后回写 USERINFO）
  let secretChanged = false
  if (!user.dfid && await ensureDfid(user)) {
    secretChanged = true
  }
  let headers = { cookie: buildCookieHeader(user) }

  const userDetail = await send(`/user/detail?timestrap=${Date.now()}`, "GET", headers)
  if (userDetail?.data?.nickname == null) {
    const safeUserId = maskIdentifier(user.userid)
    printRed(`token过期或账号不存在, userid: ${safeUserId}`)
    updateFailCount(state, safeUserId, true)
    return {
      result: {
        nickname: safeUserId, status: '失败', listen: '账号不存在',
        vipClaim: '0/8', vipExpiry: '未知', dayVip: '-', upgrade: '-',
        remainDays: null, error: 'token过期或账号不存在',
      },
      failed: true,
      secretChanged,
      key: safeUserId,
      error: { msg: `token过期或账号不存在, userid: ${safeUserId}`, data: summarizeResponse(userDetail) },
    }
  }

  const safeNickname = maskDisplayName(userDetail.data.nickname)
  const safeUserId = maskIdentifier(user.userid)
  printMagenta(`账号 ${safeNickname} 开始领取VIP...`)

  // 周日刷新token
  if (todayDay === 0) {
    const refreshToken = await send(`/login/token?timestrap=${Date.now()}`, "POST", headers)
    if (refreshToken?.status == 1) {
      if (refreshToken?.data?.token !== user.token) {
        printYellow(`账号 ${safeNickname} 需要刷新token`)
        user.token = refreshToken.data.token
        // 用新 token 重建本次请求的 headers，使后续听歌/VIP 领取使用刷新后的凭证
        headers = { cookie: buildCookieHeader(user) }
        secretChanged = true
      }
    }
  }

  // 听歌领取vip
  printYellow("开始听歌领取VIP...")
  const listen = await send(`/youth/listen/song?timestrap=${Date.now()}`, "GET", headers)

  let listenStatus = '未知'
  if (listen.status === 1) {
    printGreen("听歌领取成功")
    listenStatus = '成功'
  } else if (listen.error_code === 130012) {
    printGreen("今日已领取")
    listenStatus = '今日已领取'
  } else {
    printRed("听歌领取失败")
    listenStatus = '失败'
  }

  // 8 次广告领取
  printYellow("开始领取VIP...")
  let claimCount = 0
  let claimTotal = 0
  for (let i = 1; i <= 8; i++) {
    const ad = await send(`/youth/vip?timestrap=${Date.now()}`, "GET", headers)
    claimTotal = i
    if (ad.status === 1) {
      printGreen(`第${i}次领取成功`)
      claimCount++
      if (i != 8) {
        // 25~35 秒随机间隔，降低固定节奏被风控识别的概率
        await new Promise(r => setTimeout(r, 25000 + Math.floor(Math.random() * 10000)))
      }
    } else if (ad.error_code === 30002) {
      printGreen("今天次数已用光")
      break
    } else {
      printRed(`第${i}次领取失败`)
      break
    }
  }

  // 查 VIP 明细（/user/vip/detail），busi_vip 数组含 svip/tvip/dvip/qvip 等多项
  // 决策规则：svip 仍在有效期内 → 无需领取/升级；tvip 有效 → 直接升级；都过期 → 领取+升级
  const vip_details = await send(`/user/vip/detail?timestrap=${Date.now()}`, "GET", headers)
  const busiVip = (vip_details?.status === 1 && Array.isArray(vip_details?.data?.busi_vip)) ? vip_details.data.busi_vip : []
  const activeVipOf = (type) => busiVip.find(v => v?.product_type === type && v?.is_vip === 1 && (parseVipTime(v?.vip_end_time)?.getTime() || 0) > Date.now())
  const activeSvip = activeVipOf('svip')
  const activeTvip = activeVipOf('tvip')

  let dayVipStatus = '-'
  let upgradeStatus = '-'

  if (activeSvip) {
    // 目标已达成：svip 仍在有效期内，跳过领取与升级
    printGreen(`超级VIP(svip)仍在有效期内（至 ${activeSvip.vip_end_time}），无需领取与升级`)
    dayVipStatus = '超级VIP有效'
    upgradeStatus = '超级VIP有效'
  } else {
    let gotToday = false
    if (activeTvip) {
      printYellow("tvip 仍在有效期内，跳过领取，直接升级")
      dayVipStatus = '畅听VIP有效'
    } else {
      // 领取一天概念版 VIP（receive_day 传当天；勿频繁调用、勿领多日）
      printYellow("领取一天概念VIP...")
      const receiveRes = await send(`/youth/day/vip?receive_day=${date}&timestrap=${Date.now()}`, "GET", headers)
      if (receiveRes.status === 1) {
        printGreen("一天概念VIP领取成功")
        dayVipStatus = '成功'
        gotToday = true
      } else if (receiveRes.error_code === 131001) {
        // 131001：今日已签到领取，属正常情况而非失败
        printGreen("一天概念VIP今日已领取")
        dayVipStatus = '今日已领取'
        gotToday = true
      } else {
        dayVipStatus = `失败(${bizErrDetail(receiveRes)})`
        printRed(`一天概念VIP领取失败：${bizErrDetail(receiveRes)}`)
      }
    }

    // 升级为超级 VIP（需先领取一天 VIP，升级有效期 24h）
    // 仅在领取流程走过（含今天已领取 131001）时才调用；297000=无需升级/奖励不存在，属正常
    if (gotToday) {
      printYellow("升级超级VIP...")
      const upgradeRes = await send(`/youth/day/vip/upgrade?timestrap=${Date.now()}`, "GET", headers)
      const upgradeMsg = String(upgradeRes?.msg || upgradeRes?.error_msg || upgradeRes?.data?.msg || (typeof upgradeRes?.data === 'string' ? upgradeRes.data : '') || '')
      if (upgradeRes.status === 1) {
        printGreen("升级超级VIP成功")
        upgradeStatus = '成功'
      } else if (upgradeRes.error_code === 297000 || /已(经)?领取|无需|不能升级/.test(upgradeMsg)) {
        // 297000 等业务码：该账号当前无升级奖励可领（多为 svip 尚在有效期），属正常情况
        printGreen(`升级超级VIP：${upgradeMsg || '无需升级'}`)
        upgradeStatus = '无需升级'
      } else {
        upgradeStatus = `失败(${bizErrDetail(upgradeRes)})`
        printRed(`升级超级VIP失败：${bizErrDetail(upgradeRes)}`)
      }
    } else {
      upgradeStatus = '跳过'
    }
  }

  // 展示用：优先 svip 到期时间，其次任何仍在有效的 vip 项
  let vipExpiry = '未知'
  let remainDays = null
  const effective = busiVip.filter(v => v?.is_vip === 1 && (parseVipTime(v?.vip_end_time)?.getTime() || 0) > Date.now())
  const preferred = effective.find(v => v?.product_type === 'svip') || effective[0]
  if (preferred) {
    vipExpiry = preferred.vip_end_time
    remainDays = daysUntil(parseVipTime(vipExpiry))
    printBlue(`今天是：${date}`)
    printBlue(`VIP到期时间（${preferred.product_type}）：${vipExpiry}${remainDays != null ? `（还剩 ${remainDays} 天）` : ''}\n`)
  } else {
    printRed("VIP到期时间获取失败\n")
  }

  const failed = listenStatus === '失败' || claimCount === 0
  // 账号整体未全成功（听歌失败/广告未领到）也计入连续失败
  updateFailCount(state, safeUserId, failed)

  const result = {
    nickname: safeNickname,
    status: failed ? '部分失败' : '成功',
    listen: listenStatus,
    vipClaim: `${claimCount}/${claimTotal}`,
    dayVip: dayVipStatus,
    upgrade: upgradeStatus,
    vipExpiry,
    remainDays,
    error: '',
  }

  const errorEntry = preferred ? null : { msg: 'VIP到期时间获取失败', data: summarizeResponse(vip_details) }
  return { result, failed, secretChanged, key: errorEntry ? `${safeNickname} vip_details` : null, error: errorEntry }
}

/** 账号处理异常时构造统一结构（单账号异常隔离） */
function catchToResult(user, err, state) {
  const safeUserId = maskIdentifier(user.userid || '未知')
  const msg = err && err.message ? err.message : String(err)
  printRed(`账号 ${safeUserId} 处理异常：${msg}`)
  updateFailCount(state, safeUserId, true)
  return {
    result: {
      nickname: safeUserId, status: '失败', listen: '异常',
      vipClaim: '0/8', vipExpiry: '未知', dayVip: '-', upgrade: '-',
      remainDays: null, error: msg,
    },
    failed: true,
    secretChanged: false,
    key: safeUserId,
    error: { msg: '处理异常', error: msg },
  }
}

export { checkinOneAccount, catchToResult }
