// 云湖机器人
export default {
  name: '云湖',
  isConfigured: () => Boolean(process.env.YUNHU_BOT_KEY),
  send: async (title, content) => {
    const resp = await fetch(`https://www.yhchat.com/bot/send?key=${process.env.YUNHU_BOT_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg: { text: `${title}\n\n${content}` } }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return true
  },
}
