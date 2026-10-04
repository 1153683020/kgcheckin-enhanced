// 飞书机器人（支持 webhook 完整地址或 key；可选加签）
import crypto from 'node:crypto'

export default {
  name: '飞书',
  isConfigured: () => Boolean(process.env.FEISHU_BOT_KEY),
  send: async (title, content) => {
    const key = process.env.FEISHU_BOT_KEY
    const url = key.startsWith('http') ? key : `https://open.feishu.cn/open-apis/bot/v2/hook/${key}`
    const body = {
      msg_type: 'text',
      content: { text: `${title}\n\n${content}` },
    }
    const secret = process.env.FEISHU_SECRET
    if (secret) {
      // trim 防止复制时带入前后空格导致签名不匹配
      const cleanSecret = String(secret).trim()
      const timestamp = Math.floor(Date.now() / 1000)
      const stringToSign = `${timestamp}\n${cleanSecret}`
      const sign = crypto.createHmac('sha256', stringToSign).update('').digest('base64')
      body.timestamp = String(timestamp)
      body.sign = sign
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await resp.json().catch(() => null)
    const bizCode = data?.code ?? data?.StatusCode
    if (bizCode !== 0) {
      throw new Error(data?.msg || data?.StatusMessage || `HTTP ${resp.status}`)
    }
    return true
  },
}
