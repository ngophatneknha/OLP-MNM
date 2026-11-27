// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Trục sự kiện streaming (profile stream): mỗi dòng nhật ký duyệt submission_event được phát lên NATS JetStream, chủ đề
// dx.<tổ chức>.submission.<hành động> (approve, reject, done), để dịch vụ khác (báo cáo, AI, hệ thống đối tác) nghe và phát lại được.
// Mẫu outbox: không phát ngay trong lúc duyệt (NATS tắt thì việc duyệt vẫn chạy); vòng lặp đọc bảng submission_event chỉ thêm
// theo mốc stream_cursor, phát kèm Nats-Msg-Id = mã sự kiện (JetStream tự bỏ tin trùng trong cửa sổ 2 phút), có xác nhận (ack) mới dời mốc.
// Tin chỉ có mã hồ sơ, bước, hành động, trạng thái và thời điểm: không có dữ liệu biểu mẫu, ghi chú hay tên người (không PII).
// Máy khách NATS tối giản viết bằng node:net (giao thức chữ của NATS), để bridge vẫn không phụ thuộc thư viện ngoài.
// shortcut: một tiến trình bridge phát; sự kiện đọc khi đã cũ hơn 2 giây để giao dịch commit trễ không bị bỏ sót; chưa có TLS tới NATS
// (cùng mạng nội bộ Docker), chưa tách quyền theo tổ chức trên NATS (một token cho cả hệ thống).
import { connect as tcp } from 'node:net'
import { randomBytes } from 'node:crypto'
import { sql } from './db.js'

const { NATS_URL = '', NATS_TOKEN = '' } = process.env
export const STREAM = 'DX'
const BATCH = 200
const ACK_TIMEOUT_MS = 5000
const WINDOW_NS = 120e9 // cửa sổ chống trùng của JetStream: 2 phút

/** Kết nối NATS tối giản: PUB/HPUB, SUB, PING; chờ trả lời qua hộp thư (inbox) riêng. */
export async function natsConnect(url = NATS_URL, token = NATS_TOKEN) {
  const u = new URL(url)
  const sock = tcp({ host: u.hostname, port: Number(u.port || 4222) })
  sock.setNoDelay(true)
  let buf = Buffer.alloc(0)
  const subs = new Map()
  const inbox = `_INBOX.${randomBytes(8).toString('hex')}`
  let sid = 1
  let ready
  const opened = new Promise((ok, fail) => { ready = ok; sock.once('error', fail); setTimeout(() => fail(new Error('NATS: quá thời gian kết nối')), ACK_TIMEOUT_MS).unref() })
  const waiting = new Map() // mã hộp thư con -> resolve
  let closed = false
  sock.on('error', () => {}) // lỗi mạng dẫn tới 'close'; xử lý ở đó để tiến trình bridge không sập
  sock.on('close', () => { closed = true })
  const write = (s) => { if (closed) throw new Error('NATS: kết nối đã đóng'); sock.write(s) }
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    for (;;) {
      const nl = buf.indexOf('\r\n')
      if (nl < 0) return
      const line = buf.subarray(0, nl).toString()
      const [op, ...args] = line.split(' ')
      if (op === 'MSG' || op === 'HMSG') {
        const total = Number(args.at(-1))
        if (buf.length < nl + 2 + total + 2) return // chưa đủ thân tin
        const raw = buf.subarray(nl + 2, nl + 2 + total)
        const hdrLen = op === 'HMSG' ? Number(args.at(-2)) : 0
        buf = buf.subarray(nl + 2 + total + 2)
        const [subject, s] = args
        const msg = { subject, headers: raw.subarray(0, hdrLen).toString(), data: raw.subarray(hdrLen).toString() }
        if (subject.startsWith(`${inbox}.`)) { waiting.get(subject)?.(msg); waiting.delete(subject) } else subs.get(s)?.(msg)
        continue
      }
      buf = buf.subarray(nl + 2)
      if (op === 'INFO') {
        write(`CONNECT ${JSON.stringify({ verbose: false, pedantic: false, headers: true, no_responders: true, name: 'workflow-bridge', ...(token ? { auth_token: token } : {}) })}\r\nSUB ${inbox}.* 0\r\nPING\r\n`)
      } else if (op === 'PONG') {
        ready()
      } else if (op === 'PING') {
        write('PONG\r\n')
      } else if (op === '-ERR') {
        sock.destroy(new Error(`NATS: ${args.join(' ')}`))
      }
    }
  })
  await opened
  const request = (subject, payload, headers = {}) => new Promise((ok, fail) => {
    if (closed) return fail(new Error('NATS: kết nối đã đóng'))
    const reply = `${inbox}.${randomBytes(6).toString('hex')}`
    const timer = setTimeout(() => { waiting.delete(reply); fail(new Error(`NATS: không có xác nhận cho ${subject}`)) }, ACK_TIMEOUT_MS)
    waiting.set(reply, (m) => { clearTimeout(timer); ok(m) })
    const body = Buffer.from(payload)
    const names = Object.entries(headers)
    if (names.length) {
      const hdr = Buffer.from(`NATS/1.0\r\n${names.map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r\n`)
      write(`HPUB ${subject} ${reply} ${hdr.length} ${hdr.length + body.length}\r\n`)
      write(Buffer.concat([hdr, body, Buffer.from('\r\n')]))
    } else {
      write(`PUB ${subject} ${reply} ${body.length}\r\n`)
      write(Buffer.concat([body, Buffer.from('\r\n')]))
    }
  })
  return {
    request,
    subscribe(subject, fn) { const s = String(++sid); subs.set(s, fn); write(`SUB ${subject} ${s}\r\n`) },
    close() { closed = true; sock.destroy() },
    get closed() { return closed },
  }
}

/** Phát một tin lên JetStream và chờ ack; trả { stream, seq, duplicate }. Lỗi (không có stream, NATS từ chối) thì ném. */
export async function jsPublish(nc, subject, data, msgId) {
  const res = await nc.request(subject, JSON.stringify(data), { 'Nats-Msg-Id': msgId })
  if (/^NATS\/1\.0 503/.test(res.headers)) throw new Error('NATS: chưa có stream nhận chủ đề này')
  const ack = JSON.parse(res.data || '{}')
  if (ack.error) throw new Error(`NATS: ${ack.error.description}`)
  return ack
}

/** Tạo stream DX (chủ đề dx.>, lưu đĩa, giữ 30 ngày) nếu chưa có. */
export async function ensureStream(nc) {
  const cfg = { name: STREAM, subjects: ['dx.>'], storage: 'file', retention: 'limits', max_age: 30 * 24 * 3600 * 1e9, duplicate_window: WINDOW_NS, num_replicas: 1 }
  const res = JSON.parse((await nc.request(`$JS.API.STREAM.CREATE.${STREAM}`, JSON.stringify(cfg))).data || '{}')
  if (res.error && res.error.err_code !== 10058) throw new Error(`NATS: không tạo được stream: ${res.error.description}`) // 10058: đã có
}

const SAFE = /^[a-z0-9_-]+$/
/** Dòng submission_event (đã nối submission) -> chủ đề và nội dung tin. Mã tổ chức, hành động lạ thì bỏ (không ghép chủ đề tùy ý). */
export function toMessage([id, submission, no, app, step, action, status, org, at]) {
  if (!SAFE.test(org) || !SAFE.test(action)) return null
  return {
    subject: `dx.${org}.submission.${action}`,
    msgId: `submission_event:${id}`,
    data: { event_id: Number(id), submission_id: submission, no: no === null ? null : Number(no), app_key: app, step_key: step, action, status, org, at: new Date(at).toISOString() },
  }
}

let conn = null
let lastError = ''
/** Một vòng outbox: phát các sự kiện sau mốc, dời mốc tới sự kiện cuối đã được ack. Trả số tin đã phát. */
export async function relayOnce() {
  if (!NATS_URL) return 0
  try {
    if (!conn || conn.closed) { conn = await natsConnect(); await ensureStream(conn) }
    const cursor = Number((await sql("SELECT last_id FROM stream_cursor WHERE name = 'submission_event'"))[0]?.[0] ?? 0)
    const rows = await sql(`SELECT e.id, e.submission_id, s.no, s.app_key, e.step_key, e.action, s.status, s.org_id, e.created_at
      FROM submission_event e JOIN submission s ON s.id = e.submission_id
      WHERE e.id > ${cursor} AND e.created_at < now() - interval '2 seconds' ORDER BY e.id LIMIT ${BATCH}`)
    let last = cursor
    for (const row of rows) {
      const m = toMessage(row)
      if (m) await jsPublish(conn, m.subject, m.data, m.msgId)
      last = Number(row[0])
    }
    if (last > cursor) await sql(`INSERT INTO stream_cursor (name, last_id) VALUES ('submission_event', ${last}) ON CONFLICT (name) DO UPDATE SET last_id = ${last}, updated_at = now()`)
    lastError = ''
    return rows.length
  } catch (err) {
    conn?.close()
    conn = null
    if (err.message !== lastError) console.error('Trục sự kiện (NATS):', err.message) // chỉ ghi khi lỗi đổi, khỏi ngập nhật ký
    lastError = err.message
    return 0
  }
}

let running = false
export function startRelay(ms = 2000) {
  if (!NATS_URL) return
  setInterval(async () => {
    if (running) return
    running = true
    try { while ((await relayOnce()) === BATCH); } finally { running = false }
  }, ms).unref()
}

