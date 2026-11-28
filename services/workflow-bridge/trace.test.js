// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

// Máy nhận OTLP giả (thay Jaeger) và một dịch vụ phía sau giả (thay Hasura/Flowable): ghi lại những gì nhận được.
const received = []
const downstream = []
const collector = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => { received.push({ path: req.url, type: req.headers['content-type'], body: JSON.parse(body) }); res.end('{}') })
})
const backend = createServer((req, res) => { downstream.push(req.headers.traceparent); res.writeHead(req.url === '/hong' ? 503 : 200).end('ok') })
await new Promise((r) => collector.listen(0, '127.0.0.1', r))
await new Promise((r) => backend.listen(0, '127.0.0.1', r))
after(() => { collector.close(); backend.close() })
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${collector.address().port}`
const BACK = `http://127.0.0.1:${backend.address().port}`
const { parseTraceparent, traceparentOf, startSpan, withSpan, serveTraced, setActor, current, flush, toOtlp } = await import('./trace.js')
const { auditPrefix } = await import('./db.js')

const allSpans = () => received.flatMap((r) => r.body.resourceSpans[0].scopeSpans[0].spans)
function fakeReqRes(headers = {}, url = '/ngsi-ld/v1/entities?q=0912345678') {
  const listeners = {}
  const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v }, getHeader(k) { return this.headers[k] }, on(ev, fn) { listeners[ev] = fn }, finish() { listeners.finish?.() } }
  return { req: { method: 'GET', url, headers }, res }
}

test('traceparent đúng chuẩn W3C được đọc; sai dạng, toàn số 0 hay phiên bản lạ bị bỏ qua', () => {
  assert.deepEqual(parseTraceparent('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'), { traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', sampled: true })
  assert.equal(parseTraceparent('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00').sampled, false)
  for (const bad of [undefined, '', 'abc', '00-00000000000000000000000000000000-b7ad6b7169203331-01', '00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01',
    'ff-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01', '00-0AF7651916CD43DD8448EB211C80319C-b7ad6b7169203331-01', `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01\r\nX: y`]) {
    assert.equal(parseTraceparent(bad), null, String(bad))
  }
})

test('yêu cầu đi qua cổng: span của bridge nối tiếp chuỗi truy vết của cổng, fetch ra ngoài mang traceparent con, span được gửi OTLP/JSON', async () => {
  const gateway = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
  const { req, res } = fakeReqRes({ traceparent: gateway })
  let inner
  await serveTraced(req, res, { sub: 'user-1', realm_access: { roles: ['staff', 'director'] } }, async () => {
    inner = current()
    await fetch(`${BACK}/ok`)
    await fetch(`${BACK}/hong`)
  })
  res.finish()
  await flush()
  assert.equal(inner.actor, 'user-1')
  assert.equal(inner.role, 'director', 'vai trò cao nhất của người gọi')
  assert.equal(inner.span.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
  assert.equal(res.headers.traceparent, traceparentOf(inner.span), 'phản hồi trả lại traceparent để bên gọi tìm được chuỗi')
  assert.equal(downstream.length, 2)
  for (const h of downstream) {
    const p = parseTraceparent(h)
    assert.equal(p.traceId, inner.span.traceId, 'dịch vụ phía sau nhận cùng mã truy vết')
    assert.notEqual(p.spanId, inner.span.spanId, 'nhưng là span con')
  }
  assert.equal(received.at(-1).path, '/v1/traces')
  assert.equal(received.at(-1).type, 'application/json')
  const spans = allSpans().filter((s) => s.traceId === inner.span.traceId)
  const server = spans.find((s) => s.kind === 2)
  assert.equal(server.parentSpanId, '00f067aa0ba902b7', 'span gốc của bridge là con của span ở cổng')
  const clients = spans.filter((s) => s.kind === 3)
  assert.equal(clients.length, 2)
  assert.ok(clients.every((c) => c.parentSpanId === server.spanId))
  assert.equal(clients.find((c) => c.attributes.some((a) => a.value.stringValue === '/hong')).status.code, 2, 'lỗi 503 phía sau đánh dấu span lỗi')
  assert.ok(BigInt(server.endTimeUnixNano) >= BigInt(server.startTimeUnixNano))
  const text = JSON.stringify(spans)
  assert.doesNotMatch(text, /0912345678/, 'chuỗi truy vấn (có thể chứa PII) không vào span')
  assert.doesNotMatch(text, /authorization|Bearer/i)
})

test('cổng không lấy mẫu (cờ 00) thì bridge không gửi span nhưng vẫn mang cùng mã truy vết xuống dưới', async () => {
  const before = allSpans().length
  const { req, res } = fakeReqRes({ traceparent: '00-11111111111111111111111111111111-2222222222222222-00' })
  await serveTraced(req, res, {}, () => fetch(`${BACK}/ok`))
  res.finish()
  await flush()
  assert.equal(allSpans().length, before)
  assert.match(downstream.at(-1), /^00-11111111111111111111111111111111-[0-9a-f]{16}-00$/)
})

test('gọi thẳng không qua cổng thì mở chuỗi mới; kiểm tra sức khỏe và việc nền không tạo span', async () => {
  const { req, res } = fakeReqRes({})
  let ctx
  await serveTraced(req, res, {}, () => { ctx = current() })
  assert.match(ctx.span.traceId, /^[0-9a-f]{32}$/)
  assert.equal(ctx.span.parentSpanId, '')
  assert.equal(ctx.actor, undefined)
  const health = fakeReqRes({}, '/')
  await serveTraced({ ...health.req, method: 'GET' }, health.res, {}, () => { ctx = current() })
  assert.equal(ctx, undefined)
  assert.equal(await withSpan('SQL SELECT', {}, async () => current()), undefined, 'ngoài yêu cầu, withSpan không tạo span gốc')
  const root = await withSpan('archive daily', { root: true }, async () => current().span)
  assert.equal(root.parentSpanId, '')
})

test('sự kiện Hasura đổi người làm; câu SQL của bridge mang người làm, vai trò và mã truy vết cho audit_log', async () => {
  assert.equal(auditPrefix(undefined), "SET LOCAL dx.actor = 'workflow-bridge';", 'ngoài yêu cầu: người làm là chính bridge')
  const { req, res } = fakeReqRes({})
  await serveTraced(req, res, {}, async () => {
    setActor('user-2', 'manager')
    const p = auditPrefix()
    assert.match(p, /SET LOCAL dx\.actor = 'user-2';/)
    assert.match(p, /SET LOCAL dx\.actor_role = 'manager';/)
    assert.match(p, new RegExp(`SET LOCAL dx\\.trace_id = '${current().span.traceId}';`))
    setActor('', 'x')
    assert.equal(current().actor, 'user-2', 'người làm rỗng không ghi đè')
  })
  const { req: r2, res: s2 } = fakeReqRes({})
  await serveTraced(r2, s2, { sub: "o'brien" }, async () => {
    assert.match(auditPrefix(), /SET LOCAL dx\.actor = 'o''brien';/, 'giá trị lạ được đóng nháy, không chèn được SQL')
  })
})

test('OTLP/JSON: mã truy vết dạng hex, thời gian dạng chuỗi nano giây, thuộc tính đúng kiểu', () => {
  const s = startSpan('x', { attributes: { a: 'b', n: 3, f: 1.5, t: true } })
  s.end = s.start + 1000n
  const out = toOtlp([s], 'svc').resourceSpans[0]
  assert.deepEqual(out.resource.attributes, [{ key: 'service.name', value: { stringValue: 'svc' } }])
  const span = out.scopeSpans[0].spans[0]
  assert.match(span.traceId, /^[0-9a-f]{32}$/)
  assert.match(span.spanId, /^[0-9a-f]{16}$/)
  assert.equal(typeof span.startTimeUnixNano, 'string')
  assert.deepEqual(span.attributes.map((a) => Object.keys(a.value)[0]), ['stringValue', 'intValue', 'doubleValue', 'boolValue'])
})
