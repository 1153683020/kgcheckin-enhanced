// Telegram Bot
export default {
  name: 'Telegram',
  isConfigured: () => Boolean(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID),
  send: async (title, content) => {
    const url = `https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TG_CHAT_ID,
        text: `*${title}*\n\n${content}`,
        parse_mode: 'Markdown',
      }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return true
  },
}
