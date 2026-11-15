// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Hội tụ IT/OT: cảm biến gửi số đo vào hệ thống, vượt ngưỡng thì tự mở hồ sơ sửa chữa đi qua đúng quy trình duyệt của con người.
//  - POST /sensors (giám đốc, token Keycloak): đăng ký cảm biến, trả token thiết bị MỘT lần (chỉ lưu mã băm).
//  - GET /sensors (giám đốc, trưởng phòng): trạng thái hiện tại của mọi cảm biến ("bản sao số").
//  - POST /telemetry/<mã>: thiết bị gửi số đo, xác thực bằng tiêu đề x-sensor-token (thiết bị không có tài khoản Keycloak).
// shortcut: ngưỡng một chiều (trên hoặc dưới), một hồ sơ sửa chữa mở tại một thời điểm cho mỗi cảm biến; chưa có giao thức MQTT/OPC UA, thiết bị gọi HTTP.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { HttpError } from './files.js'
import { claimsOf, rolesOf, orgOf } from './cold.js'
import { notify } from './events.js'
import { sql, lit } from './db.js'

const { HASURA_URL, HASURA_ADMIN_SECRET } = process.env
const KEY = /^[a-z][a-z0-9_]{1,30}$/
const MAX_READINGS = 100
const REQUIRED_FIELDS = ['thiet_bi', 'cam_bien', 'gia_tri', 'mo_ta']
const sha = (data) => createHash('sha256').update(data).digest('hex')

/** Vượt ngưỡng? "above": giá trị lớn hơn ngưỡng; "below": nhỏ hơn ngưỡng. */
export const breaches = (value, threshold, direction) => (direction === 'above' ? value > threshold : value < threshold)

/** So sánh token thiết bị với mã băm đã lưu, thời gian không phụ thuộc vào chỗ khác biệt đầu tiên. */
export function tokenMatches(token, storedHash) {
  const a = Buffer.from(sha(String(token ?? '')))
  const b = Buffer.from(String(storedHash))
  return a.length === b.length && timingSafeEqual(a, b)
}

async function readJson(req, max = 256 * 1024) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > max) throw new HttpError(413, 'Nội dung quá lớn')
  }
  try { return JSON.parse(body) } catch { throw new HttpError(400, 'Nội dung không phải JSON hợp lệ') }
}

async function register(req) {
  const claims = claimsOf(req)
  if (!rolesOf(req).includes('director')) throw new HttpError(403, 'Chỉ giám đốc đăng ký cảm biến')
  const org = orgOf(req)
  const b = await readJson(req)
  const threshold = Number(b.threshold)
  if (!KEY.test(b.key ?? '')) throw new HttpError(400, 'Mã cảm biến: chữ thường không dấu, số, gạch dưới, 2 đến 31 ký tự')
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120) throw new HttpError(400, 'Thiếu tên cảm biến')
  if (!Number.isFinite(threshold)) throw new HttpError(400, 'Ngưỡng phải là số')
  const hasGeo = b.lat !== undefined || b.lon !== undefined
  const lat = Number(b.lat)
  const lon = Number(b.lon)
  if (hasGeo && !(typeof b.lat === 'number' && typeof b.lon === 'number' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new HttpError(400, 'Vị trí: lat (-90..90) và lon (-180..180) phải là số, đi cùng nhau')
  if (!['above', 'below'].includes(b.direction)) throw new HttpError(400, 'direction phải là above hoặc below')
  if (typeof b.repair_app !== 'string' || !KEY.test(b.repair_app)) throw new HttpError(400, 'Thiếu mã ứng dụng sửa chữa')
  const app = (await sql(`SELECT status, spec->'fields' FROM app WHERE key = ${lit(b.repair_app)} AND org_id = ${lit(org)}`))[0]
  if (!app || app[0] !== 'published') throw new HttpError(400, 'Ứng dụng sửa chữa chưa xuất bản (hoặc không thuộc tổ chức của bạn)')
  const have = new Set(JSON.parse(app[1]).map((f) => f.key))
  const missing = REQUIRED_FIELDS.filter((k) => !have.has(k))
  if (missing.length) throw new HttpError(400, `Ứng dụng sửa chữa thiếu trường: ${missing.join(', ')}`)
  if ((await sql(`SELECT 1 FROM sensor WHERE key = ${lit(b.key)}`)).length) throw new HttpError(409, 'Mã cảm biến đã tồn tại')
  const token = randomBytes(24).toString('base64url')
  await sql(`INSERT INTO sensor (key, org_id, name, unit, threshold, direction, repair_app, owner_id, owner_name, token_hash, lat, lon)
    VALUES (${lit(b.key)}, ${lit(org)}, ${lit(b.name.trim())}, ${lit(String(b.unit ?? '').slice(0, 20))}, ${threshold}, ${lit(b.direction)}, ${lit(b.repair_app)}, ${lit(claims.sub ?? '')}, ${lit(claims.name ?? claims.preferred_username ?? '')}, '${sha(token)}', ${hasGeo ? lat : 'NULL'}, ${hasGeo ? lon : 'NULL'})`)
  return { key: b.key, token, note: 'Token chỉ hiện một lần: cất vào thiết bị' }
}

export async function listSensors(org) {
  return (await sql(`SELECT s.key, s.name, s.unit, s.threshold, s.direction, s.last_value, s.last_at, s.open_submission_id, s.lat, s.lon,
      (s.last_value IS NOT NULL AND CASE s.direction WHEN 'above' THEN s.last_value > s.threshold ELSE s.last_value < s.threshold END) AS alarm
    FROM sensor s WHERE s.org_id = ${lit(org)} ORDER BY s.key`))
    .map(([key, name, unit, threshold, direction, last, at, open, lat, lon, alarm]) => ({
      key, name, unit, threshold: Number(threshold), direction, last_value: last === null ? null : Number(last), last_at: at, open_submission_id: open, lat: lat === null ? null : Number(lat), lon: lon === null ? null : Number(lon), alarm: alarm === 't' || alarm === true,
    }))
}

/** Mở hồ sơ sửa chữa nhân danh chủ cảm biến (bằng quyền quản trị; trigger CSDL vẫn kiểm dữ liệu theo spec). */
async function openRepair(sensor, value) {
  const res = await fetch(`${HASURA_URL}/v1/graphql`, {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'mutation($o: submission_insert_input!) { insert_submission_one(object: $o) { id } }',
      variables: { o: {
        app_key: sensor.repair_app, submitter_id: sensor.owner_id, submitter_name: `Cảm biến ${sensor.name}`,
        data: { thiet_bi: sensor.name, cam_bien: sensor.key, gia_tri: value, mo_ta: `${sensor.name} đọc được ${value} ${sensor.unit}, ${sensor.direction === 'above' ? 'vượt trên' : 'xuống dưới'} ngưỡng ${sensor.threshold}. Hồ sơ do hệ thống tự mở.` },
      } },
    }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`Không mở được hồ sơ sửa chữa: ${JSON.stringify(json.errors)}`)
  return json.data.insert_submission_one.id
}

// shortcut: khóa trong bộ nhớ của một tiến trình bridge; chạy nhiều bản bridge thì chuyển sang khóa cố vấn của PostgreSQL (pg_advisory_lock).
const locks = new Map()
export async function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.catch(() => {})
  locks.set(key, tail)
  try { return await run } finally { if (locks.get(key) === tail) locks.delete(key) }
}

async function telemetry(req, key) {
  if (!KEY.test(key)) throw new HttpError(404, 'Không tìm thấy cảm biến')
  const row = (await sql(`SELECT token_hash, name, unit, threshold, direction, repair_app, owner_id, open_submission_id FROM sensor WHERE key = ${lit(key)}`))[0]
  // Cùng một phản hồi cho "không có cảm biến" và "sai token": không để dò ra mã cảm biến nào tồn tại.
  if (!row || !tokenMatches(req.headers['x-sensor-token'], row[0])) throw new HttpError(401, 'Sai mã cảm biến hoặc token')
  const sensor = { key, name: row[1], unit: row[2], threshold: Number(row[3]), direction: row[4], repair_app: row[5], owner_id: row[6] }
  const body = await readJson(req)
  const items = Array.isArray(body) ? body : [body]
  if (!items.length || items.length > MAX_READINGS) throw new HttpError(400, `Gửi từ 1 đến ${MAX_READINGS} số đo mỗi lần`)
  const now = Date.now()
  const readings = items.map((r) => {
    const value = Number(r?.value)
    const at = r?.at === undefined ? now : Date.parse(r.at)
    if (typeof r?.value !== 'number' || !Number.isFinite(value)) throw new HttpError(400, 'value phải là số')
    if (!Number.isFinite(at) || at > now + 5 * 60_000 || at < now - 7 * 24 * 3600_000) throw new HttpError(400, 'Thời điểm đo phải trong 7 ngày qua và không ở tương lai')
    return { value, at }
  }).sort((x, y) => x.at - y.at)
  await sql(`INSERT INTO sensor_reading (sensor_key, value, at) VALUES ${readings.map((r) => `(${lit(key)}, ${r.value}, to_timestamp(${r.at} / 1000.0))`).join(',')};
    UPDATE sensor SET last_value = ${readings.at(-1).value}, last_at = to_timestamp(${readings.at(-1).at} / 1000.0) WHERE key = ${lit(key)}`)
  const bad = readings.find((r) => breaches(r.value, sensor.threshold, sensor.direction))
  let request = null
  if (bad) {
    // Khóa theo cảm biến: hai số đo vượt ngưỡng đến cùng lúc không mở hai hồ sơ. Đọc lại hồ sơ đang mở bên trong khóa.
    request = await withLock(key, async () => {
      const cur = (await sql(`SELECT open_submission_id FROM sensor WHERE key = ${lit(key)}`))[0]?.[0]
      // Còn hồ sơ sửa chữa đang chạy cho cảm biến này thì không mở thêm, khỏi ngập hồ sơ khi số đo cứ vượt ngưỡng.
      if (cur && (await sql(`SELECT 1 FROM submission WHERE id = '${cur}' AND status = 'running'`)).length) return cur
      const id = await openRepair(sensor, bad.value)
      await sql(`UPDATE sensor SET open_submission_id = '${id}' WHERE key = ${lit(key)}`)
      return id
    })
  }
  notify()
  return { accepted: readings.length, alarm: Boolean(bad), request }
}

const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

export async function handleSensors(req, res) {
  try {
    const path = new URL(req.url, 'http://x').pathname
    if (req.method === 'POST' && path === '/sensors') return json(res, 201, await register(req))
    if (req.method === 'GET' && path === '/sensors') {
      if (!rolesOf(req).some((r) => ['director', 'manager'].includes(r))) throw new HttpError(403, 'Chỉ trưởng phòng và giám đốc xem cảm biến')
      return json(res, 200, await listSensors(orgOf(req)))
    }
    const m = path.match(/^\/telemetry\/([^/]+)$/)
    if (req.method === 'POST' && m) return json(res, 200, await telemetry(req, m[1]))
    throw new HttpError(404, 'Không tìm thấy')
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    json(res, status, { message: status === 500 ? 'Lỗi máy chủ' : err.message })
  }
}
