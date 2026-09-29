import { printGreen, printRed, printYellow } from "./utils/colorOut.js";
import { sanitizeForLog, summarizeResponse } from "./utils/safeLog.js";
import { upsertUser, saveUserinfo } from "./utils/userinfo.js";
import { ensureDfid } from "./utils/dfid.js";
import { close_api, delay, send, startService, waitForApi } from "./utils/utils.js";

async function login() {

  const phone = process.env.PHONE
  const code = process.env.CODE
  const USERINFO = process.env.USERINFO
  const APPEND_USER = process.env.APPEND_USER
  // 一个手机号绑定多个酷狗账号时，必须指定要登录的账号 userid（酷狗接口要求）
  const login_userid = process.env.LOGIN_USERID || ''
  const userinfo = (USERINFO && APPEND_USER == "是") ? JSON.parse(USERINFO) : []

  // 不使用二维码登录并且没有手机号或验证码
  if (!phone || !code) {
    throw new Error("未配置")
  }
  // 启动服务并等待就绪（避免冷启动竞态）
  const api = startService()
  try {
    await waitForApi()
  } catch (e) {
    close_api(api)
    throw e
  }

  try {
    // 手机号登录请求（多账号绑定同一手机号时需带 userid 指定账号）
    const result = await send(`/login/cellphone?mobile=${phone}&code=${code}${login_userid ? `&userid=${login_userid}` : ''}`, "GET", {})
    if (result.status === 1) {
      printGreen("登录成功！")
      const loginUser = { userid: result.data.userid, token: result.data.token }
      // 获取设备指纹 dfid 一并保存（后续签到/领取等接口需要）
      await ensureDfid(loginUser)
      upsertUser(userinfo, loginUser, APPEND_USER == "是")
      saveUserinfo(userinfo)
    } else if (result.error_code === 34175) {
      throw new Error("该手机号绑定了多个酷狗账号，请在运行时填写 LOGIN_USERID（要登录的账号 userid）后重试")
    } else {
      printRed("响应内容")
      console.dir(summarizeResponse(result), { depth: null })
      throw new Error("登录失败！请检查")
    }
  } finally {
    close_api(api)
  }
}

login().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
