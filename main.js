import { printRed, printYellow } from "./utils/colorOut.js";
import { hasSecretWriteToken, setRepoSecret } from "./utils/githubSecrets.js";
import { sanitizeForLog } from "./utils/safeLog.js";
import { sendNotify } from "./utils/notify.js";
import { buildCheckinReport } from "./utils/notifyFormat.js";
import { close_api, delay, startService, waitForApi } from "./utils/utils.js";
import { CONSECUTIVE_FAIL_ALERT, loadState, saveState } from "./utils/state.js";
import { checkinOneAccount, catchToResult } from "./utils/checkinFlow.js";

async function main() {

  const USERINFO = process.env.USERINFO
  if (!USERINFO) {
    throw new Error("未配置")
  }
  const userinfo = JSON.parse(USERINFO)
  // 失败连击状态（连续失败天数持久化，跨运行累计）
  const state = loadState()
  const stateBefore = JSON.stringify(state)

  // 启动服务并等待就绪（避免冷启动竞态导致首个请求失败）
  const api = startService()
  try {
    await waitForApi()
  } catch (e) {
    close_api(api)
    throw e
  }

  const today = new Date();
  // 服务器时间比国内慢8小时
  today.setTime(today.getTime() + 8 * 60 * 60 * 1000)
  //日期
  const DD = String(today.getDate()).padStart(2, '0'); // 获取日
  const MM = String(today.getMonth() + 1).padStart(2, '0'); //获取月份，1 月为 0
  const yyyy = today.getFullYear(); // 获取年份
  const date = yyyy + '-' + MM + '-' + DD
  const todayDay = today.getDay()

  const errorMsg = {}
  // 通知结果收集
  const notifyResults = []
  let hasError = false
  let secretChanged = false

  try {
    // 有限并行：每 concurrency 个账号一组并发，组间随机交错 2~5 秒，
    // 兼顾多账号总时长与"同 IP 并发触发风控"的风险（CHECKIN_CONCURRENCY 可配）
    const concurrency = Math.max(1, Number(process.env.CHECKIN_CONCURRENCY || 2))
    for (let i = 0; i < userinfo.length; i += concurrency) {
      const chunk = userinfo.slice(i, i + concurrency)
      const chunkResults = await Promise.all(chunk.map(user =>
        checkinOneAccount(user, state, date, todayDay).catch(err => catchToResult(user, err, state))
      ))
      for (const r of chunkResults) {
        notifyResults.push(r.result)
        if (r.failed) hasError = true
        if (r.secretChanged) secretChanged = true
        if (r.key && r.error) errorMsg[r.key] = r.error
      }
      if (i + concurrency < userinfo.length) {
        await delay(2000 + Math.floor(Math.random() * 3000))
      }
    }

  } finally {
    close_api(api)
  }

  // 更新secret <USERINFO>（使用完整 userinfo 数组，保留所有用户包括过期账号）
  if (secretChanged) {
    if (hasSecretWriteToken()) {
      const userinfoJSON = JSON.stringify(userinfo)
      try {
        setRepoSecret("USERINFO", userinfoJSON)
        printYellow("secret <USERINFO> 已更新（token刷新/dfid补齐）")
      } catch (error) {
        printRed("secret <USERINFO> 更新失败")
        console.dir(sanitizeForLog({ message: error.message }), { depth: null })
      }
    } else {
      printYellow("存在账号数据变化（token刷新/dfid补齐），但是未配置PAT，无法回写；未刷新token最多两个月后过期")
    }
  }

  // 构建通知内容（放在 secret 更新之后、错误抛出之前，确保始终执行）
  const title = `酷狗签到${hasError ? '异常' : '成功'} ${date}`
  // 连续失败 >= 阈值的账号，升级为醒目告警区块
  const consecutiveFails = {}
  for (const [key, count] of Object.entries(state)) {
    if (Number(count) >= CONSECUTIVE_FAIL_ALERT) consecutiveFails[key] = Number(count)
  }
  const content = buildCheckinReport(date, notifyResults, consecutiveFails)

  // 发送通知（失败/告警不被静默时段拦截，并触发 @提及）
  try {
    await sendNotify(title, content, { isFailure: hasError })
  } catch (e) {
    printYellow(`通知发送异常: ${e.message}`)
  }

  // 失败连击状态变化时持久化（Actions 里自动写回 repository variable，不产生 git 提交）
  if (JSON.stringify(state) !== stateBefore) {
    saveState(state)
  }

  if (Object.keys(errorMsg).length > 0) {
    printRed("异常信息如下:")
    console.dir(sanitizeForLog(errorMsg), { depth: null })
    throw new Error("领取异常")
  }

}

main().then(async () => { await new Promise(r => setTimeout(r, 300)); process.exit(0) }).catch(e => { console.error(e); process.exit(1) })
