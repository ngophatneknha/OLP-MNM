// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đăng nhập (Keycloak, PKCE) và gọi GraphQL qua gateway. Cấu hình đọc từ /config.json lúc chạy,
// nên một image dùng được cho mọi môi trường.

import Keycloak from 'keycloak-js'
import { reactive } from 'vue'

export const ROLE_LABEL = { staff: 'Nhân viên', manager: 'Trưởng phòng', director: 'Giám đốc', accountant: 'Kế toán' }
export const STATUS_LABEL = { running: 'Đang xử lý', approved: 'Hoàn tất', rejected: 'Bị từ chối' }

export const auth = reactive({ name: '', userId: '', role: 'staff', roles: [] })
let keycloak
let apiUrl

export async function login() {
  const config = await (await fetch('/config.json')).json()
  apiUrl = config.apiUrl
  keycloak = new Keycloak({ url: config.keycloakUrl, realm: 'dxlab', clientId: 'dxlab-app' })
  await keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
  const token = keycloak.tokenParsed
  auth.name = token.name || token.preferred_username
  auth.userId = token.sub
  auth.roles = Object.keys(ROLE_LABEL).filter((r) => token.realm_access?.roles.includes(r))
  // Mỗi tài khoản làm việc dưới vai trò chuyên trách của mình; ai cũng có thể gửi hồ sơ.
  auth.role = auth.roles.find((r) => r !== 'staff') ?? 'staff'
}

export const logout = () => keycloak.logout({ redirectUri: location.origin })

export async function gql(query, variables) {
  await keycloak.updateToken(30)
  const res = await fetch(`${apiUrl}/v1/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${keycloak.token}`, 'x-hasura-role': auth.role, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 401) return keycloak.login()
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

/** "Số tiền tạm ứng" -> "so_tien_tam_ung" (mã hợp lệ cho trường / bước / ứng dụng). */
export function slug(text) {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31)
  return /^[a-z]/.test(s) ? s : `x_${s}`.slice(0, 31)
}

export const formatValue = (field, value) =>
  value === undefined || value === null || value === '' ? '—'
    : field.type === 'number' ? Number(value).toLocaleString('vi-VN') : String(value)

export const formatTime = (iso) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

const OP_TEXT = { '>': 'trên', '>=': 'từ', '<': 'dưới', '<=': 'tối đa', '==': 'là', '!=': 'khác' }

/** "Chỉ khi Số tiền trên 5.000.000" (rỗng nếu bước không có điều kiện). */
export function conditionText(spec, step) {
  if (!step.when) return ''
  const field = spec.fields.find((f) => f.key === step.when.field)
  const value = typeof step.when.value === 'number' ? step.when.value.toLocaleString('vi-VN') : step.when.value
  return `Chỉ khi ${field?.label ?? step.when.field} ${OP_TEXT[step.when.op] ?? step.when.op} ${value}`
}

/** So sánh hai spec, trả về các dòng thay đổi để người không biết kỹ thuật đọc được: [{ kind: add|remove|change, text }]. */
export function diffSpec(before, after) {
  const out = []
  const index = (list) => new Map(list.map((x) => [x.key, x]))
  const changes = (pairs) => pairs.filter(([, a, b]) => a !== b).map(([what, a, b]) => `${what}: ${a || 'không'} → ${b || 'không'}`)

  const oldFields = index(before.fields), newFields = index(after.fields)
  for (const [key, f] of newFields) if (!oldFields.has(key)) out.push({ kind: 'add', text: `Thêm ô “${f.label}”` })
  for (const [key, f] of oldFields) if (!newFields.has(key)) out.push({ kind: 'remove', text: `Bỏ ô “${f.label}”` })
  for (const [key, f] of newFields) {
    const o = oldFields.get(key)
    if (!o) continue
    const list = changes([
      ['nhãn', o.label, f.label], ['kiểu', o.type, f.type],
      ['bắt buộc', o.required ? 'có' : 'không', f.required ? 'có' : 'không'],
      ['lựa chọn', (o.options ?? []).join(', '), (f.options ?? []).join(', ')],
    ])
    if (list.length) out.push({ kind: 'change', text: `Ô “${f.label}” — ${list.join('; ')}` })
  }

  const oldSteps = index(before.steps), newSteps = index(after.steps)
  for (const [key, s] of newSteps) if (!oldSteps.has(key)) out.push({ kind: 'add', text: `Thêm bước “${s.name}” (${ROLE_LABEL[s.role] ?? s.role})` })
  for (const [key, s] of oldSteps) if (!newSteps.has(key)) out.push({ kind: 'remove', text: `Bỏ bước “${s.name}”` })
  for (const [key, s] of newSteps) {
    const o = oldSteps.get(key)
    if (!o) continue
    const list = changes([
      ['tên', o.name, s.name], ['người xử lý', ROLE_LABEL[o.role], ROLE_LABEL[s.role]],
      ['loại', o.type === 'task' ? 'thực hiện' : 'duyệt', s.type === 'task' ? 'thực hiện' : 'duyệt'],
      ['điều kiện', conditionText(before, o), conditionText(after, s)],
    ])
    if (list.length) out.push({ kind: 'change', text: `Bước “${s.name}” — ${list.join('; ')}` })
  }
  const common = (list, other) => list.filter((s) => other.has(s.key)).map((s) => s.key).join()
  if (common(before.steps, newSteps) !== common(after.steps, oldSteps)) out.push({ kind: 'change', text: 'Đổi thứ tự các bước' })
  if (!out.length) out.push({ kind: 'change', text: 'Không thay đổi cấu hình (chỉ đổi tên hoặc phát hành lại)' })
  return out
}
