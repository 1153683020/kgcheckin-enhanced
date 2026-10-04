// Server酱
export default {
  name: 'Server酱',
  isConfigured: () => Boolean(process.env.SERVERCHAN_SENDKEY),
  send: async (title, content) => {
    const resp = await fetch(`https://sctapi.ftqq.com/${process.env.SERVERCHAN_SENDKEY}.send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ title, desp: content }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return true
  },
}
