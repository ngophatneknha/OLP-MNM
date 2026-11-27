// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Cổng NGSI-LD (ETSI GS CIM 009) cho cảm biến, để hệ thống bên ngoài đọc, ghi và theo dõi theo chuẩn không gian dữ liệu (data space):
//  - GET    /ngsi-ld/v1/entities[?type=Device&limit=N]   danh sách thực thể của tổ chức người gọi (trưởng phòng, giám đốc)
//  - GET    /ngsi-ld/v1/entities/<id>                    một thực thể
//  - POST   /ngsi-ld/v1/entities                         tạo Device (giám đốc); trả token thiết bị một lần, như POST /sensors
//  - PATCH  /ngsi-ld/v1/entities/<id>/attrs              cập nhật số đo `value` (giám đốc); đi chung đường với /telemetry
//  - POST   /ngsi-ld/v1/subscriptions                    đăng ký thuê bao (giám đốc): số đo thỏa q thì POST Notification tới endpoint
//  - GET    /ngsi-ld/v1/subscriptions[/<id>]             xem thuê bao của tổ chức, kèm trạng thái gửi (trưởng phòng, giám đốc)
//  - DELETE /ngsi-ld/v1/subscriptions/<id>               hủy thuê bao (giám đốc)
// Kiểu Device theo Smart Data Models. Endpoint nhận thông báo phải nằm trong NGSI_NOTIFY_ALLOW (chặn bị lợi dụng gọi vào mạng nội bộ).
// shortcut: tập con của chuẩn: một kiểu Device, chỉ ghi được thuộc tính value, q chỉ gồm so sánh số/đúng-sai nối bằng ";" (và),
// gửi thông báo một lần không thử lại, chưa có DELETE thực thể, truy vấn thời gian (temporal) hay đăng ký nguồn (registration).
import { randomUUID } from 'node:crypto'
import { HttpError } from './files.js'
import { claimsOf, rolesOf, orgOf } from './cold.js'
import { listSensors, createSensor, recordReadings, readJson, onReadings } from './sensors.js'
import { sql, lit } from './db.js'

const CORE = 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld'
const CONTEXT = [CORE, { '@vocab': 'https://dxlab.example/ns#' }]
const LINK = `<${CORE}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
const NOTIFY_TIMEOUT_MS = 5000

export const entityId = (org, key) => `urn:ngsi-ld:Device:${org}:${key}`

/** Một dòng của listSensors -> thực thể NGSI-LD (Property, GeoProperty, observedAt theo chuẩn). */
export function toEntity(org, s) {
  const e = {
    id: entityId(org, s.key),
    type: 'Device',
    name: { type: 'Property', value: s.name },
    value: { type: 'Property', value: s.last_value, unitCode: s.unit, ...(s.last_at ? { observedAt: new Date(s.last_at).toISOString() } : {}) },
    threshold: { type: 'Property', value: s.threshold, unitCode: s.unit },
    direction: { type: 'Property', value: s.direction },
    alarm: { type: 'Property', value: s.alarm },
    '@context': CONTEXT,
  }
  if (s.lat !== null && s.lon !== null) e.location = { type: 'GeoProperty', value: { type: 'Point', coordinates: [s.lon, s.lat] } } // NGSI-LD/GeoJSON: kinh độ trước
  return e
}

const prop = (attr) => (attr && typeof attr === 'object' && !Array.isArray(attr) ? attr.value : attr)

/** Thực thể Device do bên ngoài gửi -> dữ liệu đăng ký cảm biến. id phải là URN Device của chính tổ chức người gọi. */
export function fromEntity(org, e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw new HttpError(400, 'Thực thể phải là một đối tượng JSON')
  if (e.type !== 'Device') throw new HttpError(400, 'Chỉ hỗ trợ kiểu Device')
  const m = typeof e.id === 'string' && e.id.match(/^urn:ngsi-ld:Device:([^:]+):([^:]+)$/)
  if (!m) throw new HttpError(400, 'id phải có dạng urn:ngsi-ld:Device:<tổ chức>:<mã>')
  if (m[1] !== org) throw new HttpError(403, 'Không tạo thực thể cho tổ chức khác')
  const unit = e.threshold?.unitCode ?? e.value?.unitCode ?? ''
  const b = { key: m[2], name: prop(e.name), unit, threshold: prop(e.threshold), direction: prop(e.direction), repair_app: prop(e.repairApp) }
  const point = e.location?.value
  if (e.location !== undefined) {
    if (e.location?.type !== 'GeoProperty' || point?.type !== 'Point' || !Array.isArray(point.coordinates) || point.coordinates.length !== 2) throw new HttpError(400, 'location phải là GeoProperty kiểu Point [kinh độ, vĩ độ]')
    ;[b.lon, b.lat] = point.coordinates
  }
  return b
}

// q của NGSI-LD, tập con: "value>8", "value>=8;value<30", "alarm==true". Dấu ";" là "và".
const Q_TERM = /^(value|threshold|alarm)(==|!=|>=|<=|>|<)(-?\d+(?:\.\d+)?|true|false)$/
/** Biên dịch q thành hàm kiểm thực thể; q sai cú pháp thì báo lỗi 400 ngay lúc đăng ký thay vì im lặng không gửi. */
export function parseQ(q) {
  if (q === undefined || q === null || q === '') return () => true
  if (typeof q !== 'string' || q.length > 200) throw new HttpError(400, 'q phải là chuỗi ngắn hơn 200 ký tự')
  const terms = q.split(';').map((t) => {
    const m = t.trim().match(Q_TERM)
    if (!m) throw new HttpError(400, `q không hợp lệ: "${t}". Hỗ trợ: value, threshold, alarm với == != > >= < <=, nối bằng ";"`)
    const [, attr, op, raw] = m
    const want = raw === 'true' ? true : raw === 'false' ? false : Number(raw)
    if (typeof want === 'boolean' && !['==', '!='].includes(op)) throw new HttpError(400, 'Giá trị đúng/sai chỉ so sánh bằng == hoặc !=')
    return { attr, op, want }
  })
  const cmp = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b }
  return (entity) => terms.every(({ attr, op, want }) => {
    const v = entity[attr]?.value
    return v !== null && v !== undefined && cmp[op](v, want)
  })
}

/** Danh sách máy được nhận thông báo, từ NGSI_NOTIFY_ALLOW="ten-may:cong,may-khac" (không ghi cổng là cổng mặc định của giao thức). */
export function allowList(env = process.env.NGSI_NOTIFY_ALLOW) {
  return new Set(String(env ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
}
/** Kiểm endpoint nhận thông báo: http(s), không kèm tài khoản, máy:cổng nằm trong danh sách cho phép. Danh sách rỗng là cấm hết. */
export function checkEndpoint(uri, allow = allowList()) {
  let u
  try { u = new URL(uri) } catch { throw new HttpError(400, 'notification.endpoint.uri không phải URL') }
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'Endpoint chỉ được là http hoặc https')
  if (u.username || u.password) throw new HttpError(400, 'Endpoint không được chứa tài khoản')
  const host = u.hostname.toLowerCase()
  const port = u.port || (u.protocol === 'https:' ? '443' : '80')
  if (!allow.has(`${host}:${port}`) && !(allow.has(host) && !u.port)) throw new HttpError(400, `Endpoint ${host}:${port} chưa được phép nhận thông báo (NGSI_NOTIFY_ALLOW)`)
  return u.href
}

const SUB_COLS = 'id, entity_id, watched, q, endpoint, throttling, created_at, times_sent, last_notification, last_success, last_failure, last_error'
const iso = (t) => (t ? new Date(t).toISOString() : undefined)
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null))
const toArray = (pg) => (pg ? String(pg).replace(/^\{|\}$/g, '').split(',').filter(Boolean) : [])

function toSubscription([id, entity, watched, q, endpoint, throttling, created, sent, lastN, lastS, lastF, lastErr]) {
  return clean({
    id, type: 'Subscription',
    entities: [clean({ type: 'Device', id: entity })],
    watchedAttributes: toArray(watched),
    q,
    throttling: throttling === null ? undefined : Number(throttling),
    notification: clean({
      endpoint: { uri: endpoint, accept: 'application/json' },
      format: 'normalized',
      status: lastF && (!lastS || lastF > lastS) ? 'failed' : 'ok',
      timesSent: Number(sent),
      lastNotification: iso(lastN), lastSuccess: iso(lastS), lastFailure: iso(lastF), lastErrorReason: lastErr ?? undefined,
    }),
    status: 'active',
    createdAt: iso(created),
    '@context': CONTEXT,
  })
}

async function createSubscription(req, org) {
  const b = await readJson(req, 16 * 1024)
  if (!b || typeof b !== 'object' || b.type !== 'Subscription') throw new HttpError(400, 'type phải là Subscription')
  const id = b.id ?? `urn:ngsi-ld:Subscription:${randomUUID()}`
  if (typeof id !== 'string' || !/^urn:ngsi-ld:Subscription:[A-Za-z0-9._:-]{1,100}$/.test(id)) throw new HttpError(400, 'id thuê bao phải có dạng urn:ngsi-ld:Subscription:<mã>')
  const ents = b.entities ?? [{ type: 'Device' }]
  if (!Array.isArray(ents) || ents.length !== 1 || ents[0]?.type !== 'Device') throw new HttpError(400, 'entities phải gồm đúng một mục kiểu Device')
  const entity = ents[0].id
  if (entity !== undefined && (typeof entity !== 'string' || !entity.startsWith(`urn:ngsi-ld:Device:${org}:`))) throw new HttpError(400, 'entities[0].id phải là Device của tổ chức bạn')
  const watched = b.watchedAttributes ?? ['value']
  if (!Array.isArray(watched) || !watched.length || watched.some((a) => !['value', 'alarm'].includes(a))) throw new HttpError(400, 'watchedAttributes chỉ gồm value, alarm')
  parseQ(b.q)
  const throttling = b.throttling === undefined ? null : Number(b.throttling)
  if (throttling !== null && !(Number.isInteger(throttling) && throttling >= 0 && throttling <= 86400)) throw new HttpError(400, 'throttling là số giây nguyên từ 0 đến 86400')
  const endpoint = checkEndpoint(b.notification?.endpoint?.uri)
  if ((await sql(`SELECT 1 FROM ngsi_subscription WHERE id = ${lit(id)}`)).length) throw new HttpError(409, 'Thuê bao đã tồn tại')
  await sql(`INSERT INTO ngsi_subscription (id, org_id, entity_id, watched, q, endpoint, throttling, owner_id)
    VALUES (${lit(id)}, ${lit(org)}, ${entity === undefined ? 'NULL' : lit(entity)}, ARRAY[${watched.map(lit).join(',')}]::text[], ${b.q ? lit(b.q) : 'NULL'}, ${lit(endpoint)}, ${throttling ?? 'NULL'}, ${lit(claimsOf(req).sub ?? '')})`)
  return id
}

/** Gửi một Notification (dạng normalized) tới endpoint; lỗi mạng hay mã khác 2xx được ghi lại làm lastFailure, không ném ra. */
export async function deliver(sub, entity, fetchImpl = fetch) {
  const { '@context': _ctx, ...data } = entity
  const body = { id: `urn:ngsi-ld:Notification:${randomUUID()}`, type: 'Notification', subscriptionId: sub.id, notifiedAt: new Date().toISOString(), data: [data] }
  try {
    // redirect: 'manual' để máy nhận không chuyển hướng được bridge sang địa chỉ ngoài danh sách cho phép.
    const res = await fetchImpl(sub.endpoint, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', link: LINK }, body: JSON.stringify(body), signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS) })
    return res.status >= 200 && res.status < 300 ? null : `HTTP ${res.status}`
  } catch (err) {
    return String(err?.name === 'TimeoutError' ? 'quá thời gian chờ' : err?.cause?.code ?? err?.message ?? err).slice(0, 200)
  }
}

/** Số đo mới của cảm biến key: gửi thông báo tới mọi thuê bao cùng tổ chức có q thỏa và hết thời gian giãn cách (throttling). */
export async function fanOut(org, key) {
  const id = entityId(org, key)
  const subs = await sql(`SELECT id, endpoint, q, throttling, last_notification FROM ngsi_subscription
    WHERE org_id = ${lit(org)} AND (entity_id IS NULL OR entity_id = ${lit(id)})`)
  if (!subs.length) return
  const s = (await listSensors(org)).find((x) => x.key === key)
  if (!s) return
  const entity = toEntity(org, s)
  await Promise.all(subs.map(async ([subId, endpoint, q, throttling, last]) => {
    if (!parseQ(q)(entity)) return
    if (throttling !== null && last && Date.now() - Date.parse(last) < Number(throttling) * 1000) return
    // Giữ chỗ trước khi gửi để hai số đo sát nhau không cùng vượt qua giãn cách.
    await sql(`UPDATE ngsi_subscription SET last_notification = now() WHERE id = ${lit(subId)}`)
    const error = await deliver({ id: subId, endpoint }, entity)
    await sql(error
      ? `UPDATE ngsi_subscription SET times_sent = times_sent + 1, last_failure = now(), last_error = ${lit(error)} WHERE id = ${lit(subId)}`
      : `UPDATE ngsi_subscription SET times_sent = times_sent + 1, last_success = now(), last_error = NULL WHERE id = ${lit(subId)}`)
  }))
}
onReadings(fanOut)

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...(body === undefined ? {} : { 'content-type': 'application/ld+json' }), link: LINK, ...headers })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}
const ERR = { 400: 'BadRequestData', 401: 'InvalidRequest', 403: 'InvalidRequest', 404: 'ResourceNotFound', 405: 'OperationNotSupported', 409: 'AlreadyExists', 413: 'BadRequestData' }
const canRead = (req) => rolesOf(req).some((r) => ['director', 'manager'].includes(r))
const requireWrite = (req) => { if (!rolesOf(req).includes('director')) throw new HttpError(403, 'Chỉ giám đốc ghi thực thể và quản lý thuê bao') }

async function entities(req, res, url, org) {
  const path = url.pathname
  if (req.method === 'POST' && path === '/ngsi-ld/v1/entities') {
    requireWrite(req)
    const b = fromEntity(org, await readJson(req))
    const created = await createSensor(claimsOf(req), org, b)
    const id = entityId(org, created.key)
    // Chuẩn chỉ yêu cầu 201 + Location; thân phản hồi là phần mở rộng để thiết bị nhận token một lần.
    return send(res, 201, { id, deviceToken: created.token, note: created.note }, { location: `/ngsi-ld/v1/entities/${encodeURIComponent(id)}` })
  }
  const attrs = path.match(/^\/ngsi-ld\/v1\/entities\/([^/]+)\/attrs$/)
  if (attrs) {
    if (req.method !== 'PATCH') throw new HttpError(405, 'Chỉ hỗ trợ PATCH trên /attrs')
    requireWrite(req)
    const id = decodeURIComponent(attrs[1])
    const s = (await listSensors(org)).find((x) => entityId(org, x.key) === id)
    if (!s) throw new HttpError(404, 'Không tìm thấy thực thể')
    const b = await readJson(req)
    const names = Object.keys(b ?? {}).filter((k) => k !== '@context')
    if (!names.length || names.some((k) => k !== 'value')) throw new HttpError(400, 'Chỉ cập nhật được thuộc tính value (số đo)')
    const v = b.value
    if (!v || typeof v !== 'object' || (v.type ?? 'Property') !== 'Property') throw new HttpError(400, 'value phải là Property')
    await recordReadings(s.key, [{ value: v.value, ...(v.observedAt ? { at: v.observedAt } : {}) }])
    return send(res, 204)
  }
  if (req.method !== 'GET') throw new HttpError(405, 'Phương thức không được hỗ trợ')
  if (!canRead(req)) throw new HttpError(403, 'Chỉ trưởng phòng và giám đốc xem thực thể')
  const all = (await listSensors(org)).map((s) => toEntity(org, s))
  const one = path.match(/^\/ngsi-ld\/v1\/entities\/([^/]+)$/)
  if (one) {
    const found = all.find((e) => e.id === decodeURIComponent(one[1]))
    if (!found) throw new HttpError(404, 'Không tìm thấy thực thể')
    return send(res, 200, found)
  }
  if (path !== '/ngsi-ld/v1/entities') throw new HttpError(404, 'Không tìm thấy')
  const type = url.searchParams.get('type')
  if (type && type !== 'Device') return send(res, 200, [])
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 1000)
  return send(res, 200, all.slice(0, limit))
}

async function subscriptions(req, res, url, org) {
  const one = url.pathname.match(/^\/ngsi-ld\/v1\/subscriptions\/([^/]+)$/)
  if (req.method === 'POST' && !one) {
    requireWrite(req)
    const id = await createSubscription(req, org)
    return send(res, 201, undefined, { location: `/ngsi-ld/v1/subscriptions/${encodeURIComponent(id)}` })
  }
  if (req.method === 'DELETE' && one) {
    requireWrite(req)
    const id = decodeURIComponent(one[1])
    const gone = await sql(`DELETE FROM ngsi_subscription WHERE id = ${lit(id)} AND org_id = ${lit(org)} RETURNING id`)
    if (!gone.length) throw new HttpError(404, 'Không tìm thấy thuê bao')
    return send(res, 204)
  }
  if (req.method !== 'GET') throw new HttpError(405, 'Phương thức không được hỗ trợ')
  if (!canRead(req)) throw new HttpError(403, 'Chỉ trưởng phòng và giám đốc xem thuê bao')
  const where = `org_id = ${lit(org)}${one ? ` AND id = ${lit(decodeURIComponent(one[1]))}` : ''}`
  const rows = (await sql(`SELECT ${SUB_COLS} FROM ngsi_subscription WHERE ${where} ORDER BY created_at, id`)).map(toSubscription)
  if (!one) return send(res, 200, rows)
  if (!rows.length) throw new HttpError(404, 'Không tìm thấy thuê bao')
  return send(res, 200, rows[0])
}

export async function handleNgsi(req, res) {
  try {
    if (!claimsOf(req).sub) throw new HttpError(401, 'Thiếu thông tin đăng nhập')
    const url = new URL(req.url, 'http://x')
    const org = orgOf(req)
    if (url.pathname === '/ngsi-ld/v1/subscriptions' || url.pathname.startsWith('/ngsi-ld/v1/subscriptions/')) return await subscriptions(req, res, url, org)
    if (url.pathname === '/ngsi-ld/v1/entities' || url.pathname.startsWith('/ngsi-ld/v1/entities/')) return await entities(req, res, url, org)
    throw new HttpError(404, 'Không tìm thấy')
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ type: `https://uri.etsi.org/ngsi-ld/errors/${ERR[status] ?? 'InternalError'}`, title: status === 500 ? 'Lỗi máy chủ' : err.message, status }))
  }
}
