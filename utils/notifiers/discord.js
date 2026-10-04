// Discord Webhook
export default {
  name: 'Discord',
  isConfigured: () => Boolean(process.env.DISCORD_WEBHOOK),
  send: async (title, content) => {
    const resp = await fetch(process.env.DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**${title}**\n\n${content}`.slice(0, 2000),
      }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return true
  },
}
