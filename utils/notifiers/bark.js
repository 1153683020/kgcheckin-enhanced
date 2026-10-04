// Bark (iOS 推送，可选分组)
export default {
  name: 'Bark',
  isConfigured: () => Boolean(process.env.BARK_KEY),
  send: async (title, content) => {
    const key = process.env.BARK_KEY
    const base = key.startsWith('http') ? key : `https://api.day.app/${key}`
    const url = `${base}/${encodeURIComponent(title)}/${encodeURIComponent(content)}`
    const params = new URLSearchParams()
    if (process.env.BARK_GROUP) params.set('group', process.env.BARK_GROUP)
    const finalUrl = params.toString() ? `${url}?${params}` : url
    const resp = await fetch(finalUrl)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return true
  },
}
