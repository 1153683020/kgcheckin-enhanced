// 企业微信机器人（消息推送）
// mention: { userids: [], mobiles: [] } 失败时 @ 指定成员
export default {
  name: '企业微信',
  isConfigured: () => Boolean(process.env.WECOM_BOT_KEY),
  send: async (title, content, opts = {}) => {
    const url = process.env.WECOM_BOT_KEY.startsWith('http')
      ? process.env.WECOM_BOT_KEY
      : `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${process.env.WECOM_BOT_KEY}`
    const text = { content: `${title}\n\n${content}` }
    if (opts.mention) {
      if (opts.mention.userids.length) text.mentioned_list = opts.mention.userids
      if (opts.mention.mobiles.length) text.mentioned_mobile_list = opts.mention.mobiles
    }
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text }),
    })
    const data = await resp.json().catch(() => null)
    if (!data || data.errcode !== 0) {
      throw new Error(data?.errmsg || `HTTP ${resp.status}`)
    }
    return true
  },
}
