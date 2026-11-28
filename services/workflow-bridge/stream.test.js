// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { natsConnect, jsPublish, ensureStream, toMessage } from './stream.js'

// Máy chủ NATS giả: nói đủ giao thức chữ để thử máy khách (INFO, CONNECT, PING/PONG, SUB, PUB/HPUB có hộp thư trả lời).
function fakeNats(reply) {
  const seen = []
  const srv = createServer((sock) => {
    let buf = ''
    let inboxSid = '0'
    sock.write('INFO {"server_id":"fake","headers":true}\r\n')
    sock.on('data', (chunk) => {
      buf += chunk
      for (;;) {
        const nl = buf.indexOf('\r\n')
        if (nl < 0) return
        const line = buf.slice(0, nl)
        const [op, ...args] = line.split(' ')
        if (op === 'PUB' || op === 'HPUB') {
          const total = Number(args.at(-1))
          if (buf.length < nl + 2 + total + 2) return
          const raw = buf.slice(nl + 2, nl + 2 + total)
          buf = buf.slice(nl + 4 + total)
          const hdrLen = op === 'HPUB' ? Number(args.at(-2)) : 0
          const msg = { subject: args[0], replyTo: args[1], headers: raw.slice(0, hdrLen), data: raw.slice(hdrLen) }
          seen.push(msg)
          const [hdr, body] = reply(msg)
          const len = (t) => Buffer.byteLength(t)
          if (hdr) sock.write(`HMSG ${msg.replyTo} ${inboxSid} ${len(hdr)} ${len(hdr) + len(body)}\r\n${hdr}${body}\r\n`)
          else sock.write(`MSG ${msg.replyTo} ${inboxSid} ${len(body)}\r\n${body}\r\n`)
          continue
        }
        buf = buf.slice(nl + 2)
        if (op === 'CONNECT') seen.push({ connect: JSON.parse(args.join(' ')) })
        if (op === 'SUB') inboxSid = args.at(-1)
        if (op === 'PING') sock.write('PONG\r\n')
      }
    })
  })
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, seen, url: `nats://127.0.0.1:${srv.address().port}` })))
}

test('NATS: kết nối gửi token, phát tin kèm Nats-Msg-Id và nhận ack của JetStream (kể cả ack báo trùng)', async () => {
  let n = 0
  const { srv, seen, url } = await fakeNats((m) => [null, JSON.stringify({ stream: 'DX', seq: ++n, ...(m.headers.includes('Nats-Msg-Id: e:1') && n > 1 ? { duplicate: true } : {}) })])
  const nc = await natsConnect(url, 'bi-mat')
  try {
    assert.equal(seen[0].connect.auth_token, 'bi-mat')
    assert.equal(seen[0].connect.headers, true)
    const ack = await jsPublish(nc, 'dx.default.submission.approve', { a: 1 }, 'e:1')
    assert.deepEqual(ack, { stream: 'DX', seq: 1 })
    assert.match(seen.at(-1).headers, /^NATS\/1\.0\r\nNats-Msg-Id: e:1\r\n\r\n$/)
    assert.equal(seen.at(-1).data, '{"a":1}')
    assert.equal((await jsPublish(nc, 'dx.default.submission.approve', { a: 1 }, 'e:1')).duplicate, true)
  } finally { nc.close(); srv.close() }
})

test('NATS (nghịch): không có stream nhận (503), JetStream báo lỗi, tạo stream đã có thì cập nhật cấu hình, lỗi khác thì ném, kết nối đóng thì từ chối ngay', async () => {
  let mode = 'noresp'
  const { srv, url, seen } = await fakeNats((m) => {
    if (mode === 'noresp') return ['NATS/1.0 503\r\n\r\n', '']
    if (mode === 'err') return [null, JSON.stringify({ error: { code: 400, err_code: 10060, description: 'bị từ chối' } })]
    if (mode === 'exists') return [null, JSON.stringify(/\.CREATE\./.test(m.subject) ? { error: { code: 400, err_code: 10058, description: 'stream name already in use' } } : { config: {} })]
    return [null, JSON.stringify({ error: { code: 500, err_code: 10049, description: 'hỏng đĩa' } })]
  })
  const nc = await natsConnect(url, '')
  try {
    await assert.rejects(jsPublish(nc, 'dx.x.submission.done', {}, 'e:2'), /chưa có stream/)
    mode = 'err'
    await assert.rejects(jsPublish(nc, 'dx.x.submission.done', {}, 'e:3'), /bị từ chối/)
    mode = 'exists'
    await ensureStream(nc)
    assert.equal(seen.at(-1).subject, '$JS.API.STREAM.UPDATE.DX', 'stream đã có thì cập nhật cấu hình (cửa sổ chống trùng mới)')
    assert.equal(JSON.parse(seen.at(-1).data).duplicate_window, 3600e9)
    mode = 'broken'
    await assert.rejects(ensureStream(nc), /hỏng đĩa/)
  } finally { nc.close(); srv.close() }
  await assert.rejects(jsPublish(nc, 'dx.x.submission.done', {}, 'e:4'), /đã đóng/)
})

test('NATS (nghịch): máy chủ đóng kết nối trước khi sẵn sàng hay im lặng thì kết nối báo lỗi, không treo', async () => {
  const close = createServer((sock) => sock.end())
  const mute = createServer(() => {})
  for (const s of [close, mute]) await new Promise((ok) => s.listen(0, '127.0.0.1', ok))
  try {
    await assert.rejects(natsConnect(`nats://127.0.0.1:${close.address().port}`, ''), /đã đóng/)
    await assert.rejects(natsConnect(`nats://127.0.0.1:${mute.address().port}`, ''), /quá thời gian/)
  } finally { close.close(); mute.close() }
})

test('tin sự kiện: chủ đề theo tổ chức và hành động, không có PII; mã tổ chức hay hành động lạ thì không ghép chủ đề', () => {
  const m = toMessage(['42', 'c0ffee00-0000-0000-0000-000000000000', '7', 'tam_ung', 'truong_phong', 'approve', 'running', 'orgb', '2026-11-27T10:00:00Z'])
  assert.equal(m.subject, 'dx.orgb.submission.approve')
  assert.equal(m.msgId, 'submission_event:42')
  assert.deepEqual(Object.keys(m.data).sort(), ['action', 'app_key', 'at', 'event_id', 'no', 'org', 'status', 'step_key', 'submission_id'])
  assert.equal(m.data.event_id, 42)
  assert.equal(toMessage(['1', 'x', '1', 'a', 's', 'approve', 'running', 'org.*', '2026-11-27T10:00:00Z']), null)
  assert.equal(toMessage(['1', 'x', '1', 'a', 's', 'appr ove', 'running', 'orgb', '2026-11-27T10:00:00Z']), null)
})
