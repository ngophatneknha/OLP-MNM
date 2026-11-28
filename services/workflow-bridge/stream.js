// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Trục sự kiện streaming (profile stream): mỗi dòng nhật ký duyệt submission_event được phát lên NATS JetStream, chủ đề
// dx.<tổ chức>.submission.<hành động> (approve, reject, done), để dịch vụ khác (báo cáo, AI, hệ thống đối tác) nghe và phát lại được.
// Mẫu outbox: không phát ngay trong lúc duyệt (NATS tắt thì việc duyệt vẫn chạy). Dòng submission_event chính là lệnh duyệt
// (cùng một INSERT, cùng giao dịch), nên đã duyệt là chắc chắn có sự kiện. Vòng lặp đọc các sự kiện CHƯA có dòng trong stream_published,
// phát kèm Nats-Msg-Id = mã sự kiện, JetStream xác nhận (ack) thì đánh dấu đúng sự kiện đó. Đánh dấu từng dòng (không dùng một mốc
// "id cuối") để giao dịch commit trễ, có id nhỏ hơn sự kiện đã phát, vẫn được phát. Mốc dưới last_id chỉ để truy vấn khỏi quét cả bảng:
// mốc chỉ vượt qua sự kiện đã phát và sự kiện cũ hơn 1 giờ (giao dịch duyệt không kéo dài tới 1 giờ).
// Giao hàng "ít nhất một lần": bridge chết giữa lúc phát và lúc đánh dấu thì tin được phát lại cùng Nats-Msg-Id; JetStream bỏ tin trùng
// trong cửa sổ 1 giờ, ngoài cửa sổ đó bên nghe phải tự bỏ trùng theo event_id (khóa duy nhất của mọi tin).
// Chạy nhiều bản bridge: chỉ bản giữ hợp đồng thuê (lease 30 giây, gia hạn mỗi vòng) trong stream_cursor được phát.
// Tin chỉ có mã hồ sơ, bước, hành động, trạng thái và thời điểm: không có dữ liệu biểu mẫu, ghi chú hay tên người (không PII).
// Máy khách NATS tối giản viết bằng node:net (giao thức chữ của NATS), để bridge vẫn không phụ thuộc thư viện ngoài.
// shortcut: thứ tự tin trên NATS gần đúng theo id (tin commit trễ đến sau), bên nghe sắp lại theo event_id nếu cần; chưa có TLS tới NATS
// (cùng mạng nội bộ Docker), chưa tách quyền theo tổ chức trên NATS (một token cho cả hệ thống).
import { connect as tcp } from 'node:net'
import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import { sql, lit } from './db.js'

const { NATS_URL = '', NATS_TOKEN = '' } = process.env
export const STREAM = 'DX'
const BATCH = 200
const ACK_TIMEOUT_MS = 5000
const WINDOW_NS = 3600e9 // cửa sổ chống trùng của JetStream: 1 giờ
const LEASE_S = 30
const SETTLE = "interval '1 hour'" // sự kiện cũ hơn mức này coi như mọi giao dịch có id nhỏ hơn đã xong
export const OWNER = `${hostname()}:${process.pid}:${randomBytes(4).toString('hex')}`

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
  // Máy chủ đóng kết nối trước PONG (đang khởi động, sai token) hay im lặng quá hạn thì báo lỗi, không treo vòng outbox.
  const opened = new Promise((ok, fail) => {
    const timer = setTimeout(() => { fail(new Error('NATS: quá thời gian kết nối')); sock.destroy() }, ACK_TIMEOUT_MS)
    ready = () => { clearTimeout(timer); ok() }
    sock.once('error', (err) => { clearTimeout(timer); fail(err) })
    sock.once('close', () => { clearTimeout(timer); fail(new Error('NATS: kết nối đã đóng trước khi sẵn sàng')) })
  })
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

/** Tạo stream DX (chủ đề dx.>, lưu đĩa, giữ 30 ngày) nếu chưa có; đã có (10058) thì cập nhật cấu hình cho khớp. */
export async function ensureStream(nc) {
  const cfg = { name: STREAM, subjects: ['dx.>'], storage: 'file', retention: 'limits', max_age: 30 * 24 * 3600 * 1e9, duplicate_window: WINDOW_NS, num_replicas: 1 }
  const call = async (op) => JSON.parse((await nc.request(`$JS.API.STREAM.${op}.${STREAM}`, JSON.stringify(cfg))).data || '{}')
  let res = await call('CREATE')
  if (res.error?.err_code === 10058) res = await call('UPDATE')
  if (res.error) throw new Error(`NATS: không tạo được stream: ${res.error.description}`)
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

/** Giữ hoặc gia hạn hợp đồng thuê; trả mốc dưới last_id nếu bản bridge này được phát, null nếu bản khác đang giữ. */
export async function lease(owner = OWNER) {
  const row = (await sql(`UPDATE stream_cursor SET holder = ${lit(owner)}, lease_until = now() + interval '${LEASE_S} seconds'
    WHERE name = 'submission_event' AND (holder IS NULL OR holder = ${lit(owner)} OR lease_until < now()) RETURNING last_id`))[0]
  return row ? Number(row[0]) : null
}

/** Dời mốc dưới: không vượt sự kiện chưa phát nào đang thấy được, không vượt sự kiện mới hơn SETTLE; dọn dấu đã nằm dưới mốc. */
async function advance(mark) {
  const unpublished = `NOT EXISTS (SELECT 1 FROM stream_published p WHERE p.event_id = e.id)`
  const next = Number((await sql(`UPDATE stream_cursor SET updated_at = now(), last_id = GREATEST(last_id, LEAST(
      COALESCE((SELECT min(e.id) - 1 FROM submission_event e WHERE e.id > ${mark} AND ${unpublished}), 9223372036854775807),
      COALESCE((SELECT max(e.id) FROM submission_event e WHERE e.id > ${mark} AND e.created_at < now() - ${SETTLE}), ${mark})))
    WHERE name = 'submission_event' RETURNING last_id`))[0]?.[0] ?? mark)
  if (next > mark) await sql(`DELETE FROM stream_published WHERE event_id <= ${next}`)
}

let conn = null
let lastError = ''
/** Một vòng outbox: phát các sự kiện chưa đánh dấu (trên mốc dưới), đánh dấu từng sự kiện đã được ack. Trả số sự kiện đã xử lý. */
export async function relayOnce() {
  if (!NATS_URL) return 0
  try {
    const mark = await lease()
    if (mark === null) return 0 // bản bridge khác đang phát
    if (!conn || conn.closed) { conn = await natsConnect(); await ensureStream(conn) }
    const rows = await sql(`SELECT e.id, e.submission_id, s.no, s.app_key, e.step_key, e.action, s.status, s.org_id, e.created_at
      FROM submission_event e JOIN submission s ON s.id = e.submission_id
      WHERE e.id > ${mark} AND NOT EXISTS (SELECT 1 FROM stream_published p WHERE p.event_id = e.id) ORDER BY e.id LIMIT ${BATCH}`)
    const done = []
    try {
      for (const row of rows) {
        const m = toMessage(row) // mã tổ chức, hành động lạ: không phát nhưng vẫn đánh dấu, khỏi thử lại mãi
        if (m) await jsPublish(conn, m.subject, m.data, m.msgId)
        done.push(Number(row[0]))
      }
    } finally {
      if (done.length) await sql(`INSERT INTO stream_published (event_id) SELECT unnest(ARRAY[${done.join(',')}]::bigint[]) ON CONFLICT DO NOTHING`)
    }
    await advance(mark)
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

