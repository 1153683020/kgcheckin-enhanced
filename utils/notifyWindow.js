/**
 * 静默时段解析与判定（纯函数，便于测试）
 * NOTIFY_SILENT_HOURS 形如 '0-7'（北京时间 0:00-7:59）或 '23-6'（跨午夜）。
 * 静默时段内只拦截成功通知，失败/告警照发。
 */

/** 解析静默时段，返回 [start, end] 或 null */
function parseSilentHours(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (a > 23 || b > 23) return null
  return [a, b]
}

/** hour 是否在静默窗口内（支持跨午夜） */
function inSilentWindow([s, e], hour) {
  if (s <= e) return hour >= s && hour <= e
  return hour >= s || hour <= e
}

export { parseSilentHours, inSilentWindow }
