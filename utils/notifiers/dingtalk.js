// 钉钉机器人（含可选加签）
import crypto from 'node:crypto'

export default {
  name: '钉钉',
  isConfigured: () => Boolean(process.env.DINGTALK_BOT_KEY),
  send: async (title, content) => {
    let url = `https://oapi.dingtalk.com/robot/send?access_token=${process.env.DINGTALK_BOT_KEY}`
    const secret = process.env.DINGTALK_SECRET
    if (secret) {
      const timestamp = Date.now()
      const stringToSign = `${timestamp}\n${secret}`
      const sign = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')
      url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title, text: `### ${title}\n\n${content}` },
      }),
    })
    // 钉钉接口即使 HTTP 200 也可能业务失败（errcode != 0）
    const data = await resp.json().catch(() => null)
    if (!data || data.errcode !== 0) {
      throw new Error(data?.errmsg || `HTTP ${resp.status}`)
    }
    return true
  },
}
