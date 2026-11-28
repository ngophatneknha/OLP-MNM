// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Truy vết phân tán theo chuẩn OpenTelemetry, tự viết để bridge không thêm gói npm.
//  - Nhận mã truy vết từ tiêu đề W3C `traceparent` do cổng APISIX gửi xuống (plugin opentelemetry), hoặc tự tạo nếu gọi thẳng.
//  - Mỗi yêu cầu là một span SERVER; mỗi lần gọi ra ngoài bằng fetch (Hasura, Flowable, SeaweedFS, Meilisearch...) là một span
//    CLIENT con và mang `traceparent` sang dịch vụ đó; mỗi câu SQL là một span có tên lệnh (không ghi nội dung câu lệnh).
//  - Span gửi theo lô bằng OTLP/HTTP JSON tới OTEL_EXPORTER_OTLP_ENDPOINT (Jaeger, profile logs). Trống là không gửi, nhưng
//    mã truy vết vẫn được tạo để ghi vào nhật ký truy cập và audit_log.
//  - Không ghi PII hay bí mật vào span: đường dẫn bỏ chuỗi truy vấn và đã che PII, không ghi thân yêu cầu, tiêu đề hay câu SQL.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { maskPii } from './pii.js'

const { OTEL_EXPORTER_OTLP_ENDPOINT = '', OTEL_SERVICE_NAME = 'workflow-bridge' } = process.env
const store = new AsyncLocalStorage()
const realFetch = globalThis.fetch
const EPOCH_NS = BigInt(Date.now()) * 1_000_000n - process.hrtime.bigint()
const now = () => EPOCH_NS + process.hrtime.bigint()
const hex = (bytes) => randomBytes(bytes).toString('hex')
const KIND = { internal: 1, server: 2, client: 3 }
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/
const ZERO = /^0+$/

/** Ngữ cảnh hiện tại: { span, actor, role } hoặc undefined khi đang chạy ngoài yêu cầu. */
export const current = () => store.getStore()

/** Đọc tiêu đề traceparent (W3C Trace Context). Sai dạng hoặc toàn số 0 thì bỏ qua như không có. */
export function parseTraceparent(header) {
  const m = typeof header === 'string' ? TRACEPARENT.exec(header.trim()) : null
  if (!m || ZERO.test(m[1]) || ZERO.test(m[2])) return null
  return { traceId: m[1], spanId: m[2], sampled: (parseInt(m[3], 16) & 1) === 1 }
}
export const traceparentOf = (span) => `00-${span.traceId}-${span.spanId}-${span.sampled ? '01' : '00'}`

/** Tạo span. parent là span hoặc ngữ cảnh đọc từ traceparent; không có thì mở một chuỗi truy vết mới. */
export function startSpan(name, { kind = 'internal', parent, attributes = {} } = {}) {
  return {
    traceId: parent?.traceId ?? hex(16), spanId: hex(8), parentSpanId: parent?.spanId ?? '',
    sampled: parent ? parent.sampled : Boolean(OTEL_EXPORTER_OTLP_ENDPOINT), name, kind, start: now(), attributes: { ...attributes }, status: 0,
  }
}

export function endSpan(span, { error, attributes } = {}) {
  if (span.end) return
  span.end = now()
  Object.assign(span.attributes, attributes)
  if (error) { span.status = 2; span.message = String(error.message ?? error).slice(0, 200) }
  if (span.sampled && OTEL_EXPORTER_OTLP_ENDPOINT) enqueue(span)
}

/** Chạy fn trong một span con của ngữ cảnh hiện tại; ngoài yêu cầu chỉ tạo span gốc khi đặt opts.root. Lỗi được ghi vào span rồi ném lại. */
export async function withSpan(name, opts, fn) {
  const ctx = current()
  if (!ctx?.span && !opts?.root) return fn() // việc nền (đồng bộ chỉ mục, phát NATS mỗi giây) không mở chuỗi truy vết riêng cho từng câu SQL
  const span = startSpan(name, { ...opts, parent: opts?.parent ?? ctx?.span })
  try {
    const result = await store.run({ ...ctx, span }, fn)
    endSpan(span)
    return result
  } catch (err) {
    endSpan(span, { error: err })
    throw err
  }
}

const ROLE_ORDER = ['director', 'manager', 'accountant', 'staff']
/** Bọc một yêu cầu HTTP: span SERVER tiếp nối traceparent của cổng, người gọi lấy từ token (cổng API đã xác thực chữ ký). */
export function serveTraced(req, res, claims, fn) {
  if (req.method === 'GET' && req.url === '/' && !req.headers.traceparent) return fn() // kiểm tra sức khỏe của Docker mỗi 15 giây
  const path = maskPii(safeDecode(req.url.split('?')[0])).slice(0, 200)
  const span = startSpan(`${req.method} /${path.split('/')[1] ?? ''}`, {
    kind: 'server', parent: parseTraceparent(req.headers.traceparent), attributes: { 'http.request.method': req.method, 'url.path': path },
  })
  const roles = claims?.realm_access?.roles ?? []
  const ctx = { span, actor: typeof claims?.sub === 'string' ? claims.sub : undefined, role: ROLE_ORDER.find((r) => roles.includes(r)) }
  res.setHeader('traceparent', traceparentOf(span))
  res.on('finish', () => endSpan(span, { error: res.statusCode >= 500 ? new Error(`HTTP ${res.statusCode}`) : undefined, attributes: { 'http.response.status_code': res.statusCode } }))
  return store.run(ctx, fn)
}
const safeDecode = (p) => { try { return decodeURIComponent(p) } catch { return p } }

/** Đổi người làm trong ngữ cảnh hiện tại (ví dụ sự kiện Hasura mang session_variables của người bấm). */
export function setActor(actor, role) {
  const ctx = current()
  if (ctx && typeof actor === 'string' && actor) { ctx.actor = actor; ctx.role = role }
}

// Mọi lần gọi ra ngoài bằng fetch thành span CLIENT và mang traceparent. Ngoài ngữ cảnh yêu cầu thì gọi thẳng, không tạo span.
globalThis.fetch = async function tracedFetch(input, init = {}) {
  const ctx = current()
  if (!ctx?.span) return realFetch(input, init)
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  const method = (init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
  const span = startSpan(`${method} ${url.host}`, {
    kind: 'client', parent: ctx.span, attributes: { 'http.request.method': method, 'server.address': url.hostname, 'url.path': maskPii(safeDecode(url.pathname)).slice(0, 200) },
  })
  const headers = new Headers(init.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined))
  headers.set('traceparent', traceparentOf(span))
  try {
    const res = await realFetch(input, { ...init, headers })
    endSpan(span, { error: res.status >= 500 ? new Error(`HTTP ${res.status}`) : undefined, attributes: { 'http.response.status_code': res.status } })
    return res
  } catch (err) {
    endSpan(span, { error: err })
    throw err
  }
}

// Gửi theo lô: tối đa 256 span chờ (đầy thì bỏ span mới, không làm chậm nghiệp vụ), mỗi giây gửi một lần.
const queue = []
let dropped = 0
function enqueue(span) {
  if (queue.length >= 256) { dropped++; return }
  queue.push(span)
}
const attr = (key, value) => ({ key, value: typeof value === 'number' ? (Number.isInteger(value) ? { intValue: value } : { doubleValue: value }) : typeof value === 'boolean' ? { boolValue: value } : { stringValue: String(value) } })
/** Đổi span sang OTLP/JSON (mã truy vết viết hex theo đặc tả OTLP/JSON). */
export function toOtlp(spans, service = OTEL_SERVICE_NAME) {
  return {
    resourceSpans: [{
      resource: { attributes: [attr('service.name', service)] },
      scopeSpans: [{
        scope: { name: 'dxlab-workflow-bridge' },
        spans: spans.map((s) => ({
          traceId: s.traceId, spanId: s.spanId, parentSpanId: s.parentSpanId, name: s.name, kind: KIND[s.kind] ?? 1,
          startTimeUnixNano: String(s.start), endTimeUnixNano: String(s.end),
          attributes: Object.entries(s.attributes).filter(([, v]) => v !== undefined).map(([k, v]) => attr(k, v)),
          status: s.status === 2 ? { code: 2, message: s.message } : { code: 0 },
        })),
      }],
    }],
  }
}
let lastError = ''
export async function flush() {
  if (!queue.length || !OTEL_EXPORTER_OTLP_ENDPOINT) return
  const batch = queue.splice(0, queue.length)
  try {
    const res = await realFetch(`${OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(toOtlp(batch)), signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    lastError = ''
  } catch (err) {
    const msg = `Gửi span thất bại (bỏ ${batch.length + dropped} span): ${err.message}`
    if (msg.split(':').pop() !== lastError.split(':').pop()) console.error(msg) // chỉ ghi khi lỗi đổi, khỏi ngập nhật ký
    lastError = msg
  }
  dropped = 0
}
if (OTEL_EXPORTER_OTLP_ENDPOINT) setInterval(flush, 1000).unref()
