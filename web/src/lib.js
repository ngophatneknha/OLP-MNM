// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đăng nhập (Keycloak, PKCE) và gọi GraphQL qua gateway. Cấu hình đọc từ /config.json lúc chạy,
// nên một image dùng được cho mọi môi trường.

import Keycloak from 'keycloak-js'
import { reactive } from 'vue'

export const ROLE_LABEL = { staff: 'Nhân viên', manager: 'Trưởng phòng', director: 'Giám đốc', accountant: 'Kế toán' }
export const CATEGORIES = ['Tài chính', 'Nhân sự', 'Mua sắm', 'Hành chính', 'Khác']

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

const relative = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })
/** "2 giờ trước", "hôm qua" — con người đọc khoảng cách thời gian dễ hơn dấu thời gian. */
export function ago(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'vừa xong'
}

/** Tên gọi thân mật: Keycloak ghép "tên + họ" ("Chi Lê"), nên lấy từ đầu tiên. */
export const givenName = (name) => (name || '').trim().split(/\s+/)[0]
export const initials = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/** Thông báo ngắn sau một hành động. */
export const toasts = reactive([])
export function toast(text, ok = true) {
  const item = { id: Date.now() + Math.random(), text, ok }
  toasts.push(item)
  setTimeout(() => toasts.splice(toasts.indexOf(item), 1), 5000)
}

/** Các trường cần để hiển thị một hồ sơ ở mọi màn hình. */
export const SUBMISSION_FIELDS = `id no data status current_step waiting_role submitter_id submitter_name app_version created_at finished_at
  app { key name category }
  version { spec }
  events(order_by: {id: asc}) { step_key action note actor_name created_at }`

export const stepOf = (s) => s.version.spec.steps.find((x) => x.key === s.current_step)
export const waitsOnMe = (s) => s.status === 'running' && s.waiting_role === auth.role && s.submitter_id !== auth.userId

/** Hồ sơ đang ở đâu, nói bằng một câu. */
export function whereIs(s) {
  if (s.status === 'approved') return `Đã hoàn tất ${ago(s.finished_at)}`
  if (s.status === 'rejected') {
    const refusal = s.events.findLast((e) => e.action === 'reject')
    return `${refusal?.actor_name ?? 'Người duyệt'} không duyệt${refusal?.note ? `: ${refusal.note}` : ''}`
  }
  const step = stepOf(s)
  return step ? `Đang chờ ${ROLE_LABEL[s.waiting_role]} ${step.type === 'task' ? 'thực hiện' : 'ký duyệt'}` : 'Đang chuyển tới người xử lý'
}

/** Ô thông tin đáng nhìn nhất của hồ sơ (ô bắt buộc đầu tiên), để một dòng danh sách vẫn đủ ý. */
export function headline(s) {
  const field = s.version.spec.fields.find((f) => f.required && s.data[f.key] !== undefined) ?? s.version.spec.fields[0]
  return field ? `${field.label}: ${formatValue(field, s.data[field.key])}` : ''
}

/** "Trưởng phòng, Giám đốc (chỉ khi Số tiền trên 5.000.000), Kế toán" */
export const routeText = (spec) => spec.steps
  .map((step) => ROLE_LABEL[step.role] + (step.when ? ` (${conditionText(spec, step).toLowerCase().replace(/ \(.*?\)/g, '')})` : '')).join(', ')

/** Gửi một hành động lên hồ sơ. Từ chối bắt buộc có lý do: người gửi cần biết phải sửa gì. */
export async function sendAction(submission, action, note) {
  await gql('mutation($o: submission_event_insert_input!) { insert_submission_event_one(object: $o) { id } }',
    { o: { submission_id: submission.id, step_key: submission.current_step, action, note: note?.trim() || null } })
  toast({ approve: 'Đã duyệt hồ sơ', reject: 'Đã từ chối hồ sơ', done: 'Đã ghi nhận hoàn tất' }[action])
}

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
