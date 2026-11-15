// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Quản trị người dùng của tổ chức: giám đốc của một tổ chức thêm, xem, khóa tài khoản trong CHÍNH tổ chức đó (qua Keycloak Admin API).
//  - GET  /orgs/users                      danh sách người dùng của tổ chức người gọi (kèm vai trò, trạng thái)
//  - POST /orgs/users                      { username, name, role, password, temporary? } thêm người dùng vào tổ chức người gọi
//  - POST /orgs/users/<id>/disable|enable  khóa hoặc mở lại tài khoản (chỉ người cùng tổ chức)
// org_id của người mới do máy chủ đặt theo token người gọi, không do người gọi chọn nên không tạo được người ở tổ chức khác.
// shortcut: dùng tài khoản quản trị Keycloak (KEYCLOAK_ADMIN) của máy chủ; triển khai thật nên đổi sang client dịch vụ chỉ có quyền quản lý người dùng.
import { HttpError } from './files.js'
import { claimsOf, rolesOf, orgOf } from './cold.js'

const { KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD } = process.env
const KC = process.env.KEYCLOAK_INTERNAL_URL ?? 'http://keycloak:8080'
const USERNAME = /^[a-z][a-z0-9._-]{2,30}$/
// Mỗi người luôn có vai trò staff, cộng thêm vai trò chính (cùng cách các tài khoản mẫu trong realm).
export const ROLE_SETS = { staff: ['staff'], manager: ['staff', 'manager'], director: ['staff', 'director'], accountant: ['staff', 'accountant'] }

/** Kiểm tra thân yêu cầu thêm người dùng; trả về bản đã làm sạch hoặc ném lỗi 400. */
export function validateNewUser(b) {
  if (!USERNAME.test(b?.username ?? '')) throw new HttpError(400, 'Tên đăng nhập: chữ thường không dấu, số, . _ -, 3 đến 31 ký tự, bắt đầu bằng chữ')
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) throw new HttpError(400, 'Thiếu họ tên')
  if (!Object.hasOwn(ROLE_SETS, b.role)) throw new HttpError(400, `Vai trò phải là một trong: ${Object.keys(ROLE_SETS).join(', ')}`)
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128) throw new HttpError(400, 'Mật khẩu tạm từ 8 đến 128 ký tự')
  return { username: b.username, name: b.name.trim(), role: b.role, password: b.password, temporary: b.temporary !== false }
}

/** Người dùng Keycloak -> dòng hiển thị; vai trò chính là vai trò cao nhất trong ROLE_SETS mà người đó có. */
export function toRow(u, roles) {
  const main = ['director', 'manager', 'accountant'].find((r) => roles.includes(r)) ?? 'staff'
  return { id: u.id, username: u.username, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username, role: main, enabled: u.enabled !== false }
}

const userOrg = (u) => u.attributes?.org_id?.[0] ?? 'default'

let cached = { token: '', until: 0 }
async function adminToken() {
  if (Date.now() < cached.until) return cached.token
  if (!KEYCLOAK_ADMIN || !KEYCLOAK_ADMIN_PASSWORD) throw new HttpError(503, 'Chưa cấu hình tài khoản quản trị Keycloak cho bridge')
  const res = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: KEYCLOAK_ADMIN, password: KEYCLOAK_ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new HttpError(502, 'Không đăng nhập được Keycloak quản trị')
  const j = await res.json()
  cached = { token: j.access_token, until: Date.now() + (j.expires_in - 20) * 1000 }
  return cached.token
}

async function kc(path, init = {}) {
  const res = await fetch(`${KC}/admin/realms/dxlab${path}`, { ...init, headers: { authorization: `Bearer ${await adminToken()}`, 'content-type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(15_000) })
  if (res.status === 401) cached = { token: '', until: 0 }
  return res
}

async function orgUsers(org) {
  const all = await (await kc('/users?max=500&briefRepresentation=false')).json()
  return all.filter((u) => userOrg(u) === org)
}

async function list(org) {
  const users = await orgUsers(org)
  return Promise.all(users.map(async (u) => toRow(u, (await (await kc(`/users/${u.id}/role-mappings/realm`)).json()).map((r) => r.name))))
}

async function create(org, body) {
  const v = validateNewUser(body)
  const [first, ...rest] = v.name.split(/\s+/)
  const res = await kc('/users', {
    method: 'POST',
    body: JSON.stringify({
      username: v.username, enabled: true, firstName: first, lastName: rest.join(' ') || '-', attributes: { org_id: [org] },
      credentials: [{ type: 'password', value: v.password, temporary: v.temporary }],
    }),
  })
  if (res.status === 409) throw new HttpError(409, 'Tên đăng nhập đã tồn tại')
  if (!res.ok) throw new HttpError(502, 'Keycloak từ chối tạo người dùng')
  const id = res.headers.get('location').split('/').pop()
  const roles = await Promise.all(ROLE_SETS[v.role].map(async (r) => (await kc(`/roles/${r}`)).json()))
  const map = await kc(`/users/${id}/role-mappings/realm`, { method: 'POST', body: JSON.stringify(roles) })
  if (!map.ok) throw new HttpError(502, 'Không gán được vai trò')
  return { id, username: v.username, role: v.role, org }
}

async function setEnabled(org, id, enabled) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Mã người dùng không hợp lệ')
  const got = await kc(`/users/${id}`)
  const user = got.ok ? await got.json() : null
  if (!user || userOrg(user) !== org) throw new HttpError(404, 'Không tìm thấy người dùng trong tổ chức của bạn')
  const res = await kc(`/users/${id}`, { method: 'PUT', body: JSON.stringify({ ...user, enabled }) })
  if (!res.ok) throw new HttpError(502, 'Keycloak từ chối cập nhật')
  return { id, enabled }
}

async function readJson(req) {
  let body = ''
  for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new HttpError(413, 'Yêu cầu quá lớn') }
  try { return JSON.parse(body) } catch { throw new HttpError(400, 'Yêu cầu không phải JSON hợp lệ') }
}

const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

export async function handleOrgs(req, res) {
  try {
    const me = claimsOf(req)
    if (!me.sub) throw new HttpError(401, 'Thiếu thông tin đăng nhập')
    if (!rolesOf(req).includes('director')) throw new HttpError(403, 'Chỉ giám đốc quản trị người dùng của tổ chức')
    const org = orgOf(req)
    const path = new URL(req.url, 'http://x').pathname
    if (req.method === 'GET' && path === '/orgs/users') return json(res, 200, await list(org))
    if (req.method === 'POST' && path === '/orgs/users') return json(res, 201, await create(org, await readJson(req)))
    const m = path.match(/^\/orgs\/users\/([^/]+)\/(disable|enable)$/)
    if (req.method === 'POST' && m) {
      if (m[1] === me.sub) throw new HttpError(400, 'Không tự khóa chính mình')
      return json(res, 200, await setEnabled(org, m[1], m[2] === 'enable'))
    }
    throw new HttpError(404, 'Không tìm thấy')
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    json(res, status, { message: status === 500 ? 'Lỗi máy chủ' : err.message })
  }
}
