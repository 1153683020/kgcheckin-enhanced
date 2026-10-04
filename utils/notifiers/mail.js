// 邮箱 SMTP（node:net/node:tls 实现最小 SMTP 客户端）
// 支持隐式 TLS（465）与 STARTTLS（587/25）
import tls from 'node:tls'
import net from 'node:net'

function smtpSend(title, content, cfg) {
  return new Promise((resolve, reject) => {
    const { host, port, user, pass, to } = cfg
    const from = user
    const subject = `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`
    const date = new Date().toUTCString()
    const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@kgcheckin>`

    // SMTP dot-stuffing：正文任意以 "." 开头的行必须再补一个点
    const safeContent = String(content).replace(/^\./gm, '..')

    const mailBody = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${date}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      safeContent,
    ].join('\r\n')

    const smtpPort = Number(port) || 465
    const useSTARTTLS = smtpPort !== 465

    let state = 'GREETING'
    let buffer = ''
    let socket
    let timer
    let completed = false
    let settled = false
    function finish(success, err) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (success) resolve(true)
      else reject(err || new Error('SMTP 会话异常终止'))
    }

    const authCommands = [
      'AUTH LOGIN',
      Buffer.from(user).toString('base64'),
      Buffer.from(pass).toString('base64'),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      'DATA',
      mailBody.replace(/\r?\n/g, '\r\n') + '\r\n.',
      'QUIT',
    ]
    let authStep = 0

    function sendCmd(cmd) {
      socket.write(cmd + '\r\n')
    }

    function processData(line) {
      const code = parseInt(line.slice(0, 3), 10)

      if (code >= 400) {
        socket.destroy()
        finish(false, new Error(`SMTP 错误: ${line}`))
        return
      }
      if (line[3] === '-') return

      switch (state) {
        case 'GREETING':
          sendCmd('EHLO kgcheckin')
          state = 'EHLO_SENT'
          break
        case 'EHLO_SENT':
          if (useSTARTTLS) {
            sendCmd('STARTTLS')
            state = 'STARTTLS_SENT'
          } else {
            state = 'AUTH'
            authStep = 0
            sendCmd(authCommands[authStep++])
          }
          break
        case 'STARTTLS_SENT':
          if (code !== 220) {
            socket.destroy()
            finish(false, new Error(`STARTTLS 失败: ${line}`))
            return
          }
          socket = tls.connect({ socket, host, rejectUnauthorized: true })
          socket.setEncoding('utf8')
          socket.on('data', (chunk) => handleChunk(chunk))
          socket.on('end', () => finish(completed))
          socket.on('close', () => finish(completed))
          socket.on('error', (err) => finish(false, err))
          sendCmd('EHLO kgcheckin')
          state = 'EHLO2_SENT'
          break
        case 'EHLO2_SENT':
          state = 'AUTH'
          authStep = 0
          sendCmd(authCommands[authStep++])
          break
        case 'AUTH':
          if (authStep < authCommands.length) {
            const cmd = authCommands[authStep]
            if (cmd === 'QUIT') completed = true
            sendCmd(authCommands[authStep++])
          } else if (code === 221) {
            completed = true
          }
          break
      }
    }

    function handleChunk(chunk) {
      buffer += chunk
      while (true) {
        const idx = buffer.indexOf('\r\n')
        if (idx === -1) break
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        processData(line)
      }
    }

    timer = setTimeout(() => {
      if (socket) socket.destroy()
      finish(false, new Error('SMTP 超时'))
    }, 15000)

    if (useSTARTTLS) {
      socket = net.connect(smtpPort, host, () => {})
    } else {
      socket = tls.connect({ host, port: smtpPort, rejectUnauthorized: true }, () => {})
    }

    socket.setEncoding('utf8')
    socket.on('data', (chunk) => handleChunk(chunk))
    socket.on('end', () => finish(completed))
    socket.on('close', () => finish(completed))
    socket.on('error', (err) => finish(false, err))
  })
}

export default {
  name: '邮箱',
  isConfigured: () => Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS && process.env.MAIL_TO),
  send: async (title, content) => {
    return smtpSend(title, content, {
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT || 465,
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
      to: process.env.MAIL_TO,
    })
  },
}
