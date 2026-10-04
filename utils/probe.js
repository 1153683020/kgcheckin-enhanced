/**
 * 探活判定工具（纯函数，供 healthcheck.js 与单测共用）
 */

/** 构造接口错误描述：优先非空 data，再附 msg，最后附错误码 */
function describeErr(res) {
  const parts = []
  const data = res?.data
  if (data != null && data !== '' && (typeof data !== 'object' || Object.keys(data).length > 0)) {
    parts.push(`data=${typeof data === 'object' ? JSON.stringify(data) : data}`)
  }
  const msg = res?.msg || res?.error_msg
  if (msg) parts.push(`msg=${msg}`)
  parts.push(`error_code=${res?.error_code ?? res?.status ?? '未知'}`)
  return parts.join(', ')
}

/** 基线匹配：接口响应的 error_code/status 与基线一致即视为链路正常 */
function probePassed(probe, res) {
  if (!res || typeof res !== 'object') return false
  if (probe.expect.error_code !== undefined) return res.error_code === probe.expect.error_code
  if (probe.expect.status !== undefined) return res.status === probe.expect.status
  return false
}

export { describeErr, probePassed }
