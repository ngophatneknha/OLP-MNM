// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test services/workflow-bridge/scan.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { scan } from './scan.js'

/** clamd giả: đọc hết luồng INSTREAM rồi trả lời theo nội dung, để kiểm đúng cách đóng khung dữ liệu. */
function fakeClamd(answer) {
  return new Promise((resolve) => {
    const server = net.createServer((s) => {
      let buf = Buffer.alloc(0)
      s.on('data', (d) => {
        buf = Buffer.concat([buf, d])
        if (buf.subarray(buf.length - 4).equals(Buffer.alloc(4))) {
          const body = buf.subarray(10) // sau "zINSTREAM\0"
          let n = 0, p = 0, payload = 0
          while (p < body.length) { n = body.readUInt32BE(p); p += 4 + n; payload += n }
          s.end(answer(payload))
        }
      })
    }).listen(0, '127.0.0.1', () => resolve(server))
  })
}

test('tệp sạch, tệp nhiễm, và đóng khung đúng với tệp lớn hơn một chunk', async () => {
  const server = await fakeClamd((n) => (n === 200_000 ? 'stream: OK\0' : 'stream: Eicar-Test-Signature FOUND\0'))
  const { port } = server.address()
  assert.deepEqual(await scan(Buffer.alloc(200_000, 1), '127.0.0.1', port), { clean: true })
  assert.deepEqual(await scan(Buffer.from('x'), '127.0.0.1', port), { clean: false, signature: 'Eicar-Test-Signature' })
  server.close()
})

test('trạm kiểm dịch hỏng hoặc trả lời lạ thì báo lỗi, không coi là sạch', async () => {
  await assert.rejects(scan(Buffer.from('x'), '127.0.0.1', 1))
  const server = await fakeClamd(() => 'INSTREAM size limit exceeded. ERROR\0')
  await assert.rejects(scan(Buffer.from('x'), '127.0.0.1', server.address().port))
  server.close()
})
