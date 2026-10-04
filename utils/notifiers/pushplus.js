// PushPlus（可选群组 topic）
export default {
  name: 'PushPlus',
  isConfigured: () => Boolean(process.env.PUSHPLUS_TOKEN),
  send: async (title, content) => {
    const body = { token: process.env.PUSHPLUS_TOKEN, title, content, template: 'txt' }
    if (process.env.PUSHPLUS_TOPIC) body.topic = process.env.PUSHPLUS_TOPIC
    const resp = await fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return true
  },
}
