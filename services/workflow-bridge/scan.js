// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kiểm dịch mã độc cho tệp tải lên bằng ClamAV (clamd, giao thức INSTREAM). "Đóng khi lỗi": không hỏi được
// trạm kiểm dịch thì tệp bị từ chối, không bao giờ cho qua vì lý do trạm hỏng.

import net from 'node:net'

const { CLAMAV_HOST = 'clamav', CLAMAV_PORT = '3310' } = process.env
const CHUNK = 64 * 1024

/** Trả { clean: true } hoặc { clean: false, signature }; ném lỗi nếu clamd không trả lời. */
export function scan(buffer, host = CLAMAV_HOST, port = Number(CLAMAV_PORT)) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port, timeout: 30_000 })
    let reply = ''
    socket.on('connect', () => {
      socket.write('zINSTREAM\0')
      for (let i = 0; i < buffer.length; i += CHUNK) {
        const part = buffer.subarray(i, i + CHUNK)
        const len = Buffer.alloc(4)
        len.writeUInt32BE(part.length)
        socket.write(len)
        socket.write(part)
      }
      socket.write(Buffer.alloc(4)) // chunk dài 0 = hết dữ liệu
    })
    socket.on('data', (d) => { reply += d })
    socket.on('timeout', () => socket.destroy(new Error('clamd quá hạn')))
    socket.on('error', reject)
    socket.on('close', () => {
      const text = reply.replace(/\0/g, '').trim()
      if (/ OK$/.test(text)) return resolve({ clean: true })
      const found = text.match(/: (.+) FOUND$/)
      if (found) return resolve({ clean: false, signature: found[1] })
      reject(new Error(`clamd trả lời lạ: ${text || '(rỗng)'}`))
    })
  })
}
