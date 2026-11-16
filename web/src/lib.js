// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đăng nhập (Keycloak, PKCE) và gọi GraphQL qua gateway. Cấu hình đọc từ /config.json lúc chạy,
// nên một image dùng được cho mọi môi trường.

import { startStream } from './live.js'
import Keycloak from 'keycloak-js'
import { reactive } from 'vue'
import { i18n, locale, t } from './i18n.js'

/** Tên vai trò theo ngôn ngữ đang chọn (getter để đổi ngôn ngữ là đổi ngay, không cần tải lại). */
export const ROLE_LABEL = {
  get staff() { return t('role.staff') }, get manager() { return t('role.manager') },
  get director() { return t('role.director') }, get accountant() { return t('role.accountant') },
}
/** Bốn nấc tự chủ của trợ lý AI ở một bước duyệt (nấc 0 để chỉ số khớp với mã nấc 1..4). */
export const AUTONOMY = [
  null,
  ...[1, 2, 3, 4].map((n) => ({ get name() { return t(`auto.${n}.name`) }, get help() { return t(`auto.${n}.help`) } })),
]
/** Giá trị nhóm lưu trong cơ sở dữ liệu (dữ liệu, không phải chữ giao diện); tên hiển thị lấy qua t('cat.<giá trị>'). */
export const CATEGORIES = ['Tài chính', 'Nhân sự', 'Mua sắm', 'Hành chính', 'Khác'] // i18n-ok: giá trị lưu trong cơ sở dữ liệu

export const auth = reactive({ name: '', userId: '', role: 'staff', roles: [], orgName: '' })
let keycloak
let apiUrl

/** Mở kênh thời gian thực (SSE) qua cổng API; gọi một lần sau khi đăng nhập. */
export function startLiveUpdates() {
  startStream(`${apiUrl}/events`, async () => {
    await keycloak.updateToken(30).catch(() => {})
    return { authorization: `Bearer ${keycloak.token}`, 'x-hasura-role': auth.role }
  })
}

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
  // Tên tổ chức chỉ để hiển thị; lỗi thì bỏ qua, không chặn đăng nhập.
  auth.orgName = (await gql('{ org { name } }').catch(() => ({ org: [] }))).org?.[0]?.name ?? ''
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

/** Gọi một điểm cuối JSON của gateway bằng token hiện tại (tìm kiếm, hỏi đáp). Ném lỗi với thông báo người dùng đọc được. */
export async function postJson(path, body) {
  await keycloak.updateToken(30)
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${keycloak.token}`, 'x-hasura-role': auth.role, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message ?? (res.status === 429 ? t('err.rate') : t('err.http', { status: res.status })))
  return json
}

/** GET một điểm cuối JSON của gateway (kiểm chứng chữ ký số). */
export async function getJson(path) {
  await keycloak.updateToken(30)
  const res = await fetch(`${apiUrl}${path}`, { headers: { authorization: `Bearer ${keycloak.token}`, 'x-hasura-role': auth.role } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message ?? t('err.http', { status: res.status }))
  return json
}

/** "Số tiền tạm ứng" -> "so_tien_tam_ung" (mã hợp lệ cho trường / bước / ứng dụng). */
export function slug(text) {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D') // i18n-ok: bỏ dấu tiếng Việt khi sinh mã
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31)
  return /^[a-z]/.test(s) ? s : `x_${s}`.slice(0, 31)
}

export const formatValue = (field, value) =>
  value === undefined || value === null || value === '' ? '—'
    : field.type === 'number' ? Number(value).toLocaleString(locale()) : String(value)

export const formatTime = (iso) => new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })

/** "2 giờ trước", "hôm qua" — con người đọc khoảng cách thời gian dễ hơn dấu thời gian. */
export function ago(iso) {
  const seconds = (Date.parse(iso) - Date.now()) / 1000
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return new Intl.RelativeTimeFormat(i18n.lang, { numeric: 'auto' }).format(Math.round(seconds / size), unit)
  }
  return t('time.now')
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
  events(order_by: {id: asc}) { step_key action note actor_name created_at }
  attachments(order_by: {created_at: asc}) { id name size uploader_name created_at }
  opinions { decision reason level }`

/** Gợi ý của trợ lý cho hồ sơ đang chờ tôi (chỉ từ nấc 3; nấc 2 là chạy bóng nên chưa được thấy). */
export const suggestion = (s) => (waitsOnMe(s) ? s.opinions?.find((o) => o.level >= 3) : null)

export const stepOf = (s) => s.version.spec.steps.find((x) => x.key === s.current_step)
export const waitsOnMe = (s) => s.status === 'running' && s.waiting_role === auth.role && s.submitter_id !== auth.userId

/** Hồ sơ đang ở đâu, nói bằng một câu. */
export function whereIs(s) {
  if (s.status === 'approved') return t('where.approved', { when: ago(s.finished_at) })
  if (s.status === 'rejected') {
    const refusal = s.events.findLast((e) => e.action === 'reject')
    const who = refusal?.actor_name ?? t('where.approver')
    return refusal?.note ? t('where.rejectedNote', { who, note: refusal.note }) : t('where.rejected', { who })
  }
  const step = stepOf(s)
  return step ? t('where.waiting', { role: ROLE_LABEL[s.waiting_role], action: t(step.type === 'task' ? 'where.doIt' : 'where.sign') }) : t('where.moving')
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
  toast(t(`toast.${action}`))
}

/** "Chỉ khi Số tiền trên 5.000.000" (rỗng nếu bước không có điều kiện). */
export function conditionText(spec, step) {
  if (!step.when) return ''
  const field = spec.fields.find((f) => f.key === step.when.field)
  const value = typeof step.when.value === 'number' ? step.when.value.toLocaleString(locale()) : step.when.value
  const op = ['>', '>=', '<', '<=', '==', '!='].includes(step.when.op) ? t(`op.${step.when.op}`) : step.when.op
  return t('cond.when', { field: field?.label ?? step.when.field, op, value })
}

/** So sánh hai spec, trả về các dòng thay đổi để người không biết kỹ thuật đọc được: [{ kind: add|remove|change, text }]. */
export function diffSpec(before, after) {
  const out = []
  const index = (list) => new Map(list.map((x) => [x.key, x]))
  const none = () => t('diff.no')
  const changes = (pairs) => pairs.filter(([, a, b]) => a !== b).map(([what, a, b]) => t('diff.item', { what: t(`diff.${what}`), a: a || none(), b: b || none() }))
  const yesNo = (v) => t(v ? 'diff.yes' : 'diff.no')
  const kind = (step) => t(step.type === 'task' ? 'act.do' : 'act.approve')

  const oldFields = index(before.fields), newFields = index(after.fields)
  for (const [key, f] of newFields) if (!oldFields.has(key)) out.push({ kind: 'add', text: t('diff.addField', { label: f.label }) })
  for (const [key, f] of oldFields) if (!newFields.has(key)) out.push({ kind: 'remove', text: t('diff.removeField', { label: f.label }) })
  for (const [key, f] of newFields) {
    const o = oldFields.get(key)
    if (!o) continue
    const list = changes([
      ['label', o.label, f.label], ['type', o.type, f.type],
      ['required', yesNo(o.required), yesNo(f.required)],
      ['options', (o.options ?? []).join(', '), (f.options ?? []).join(', ')],
    ])
    if (list.length) out.push({ kind: 'change', text: t('diff.changeField', { label: f.label, list: list.join('; ') }) })
  }

  const oldSteps = index(before.steps), newSteps = index(after.steps)
  for (const [key, s] of newSteps) if (!oldSteps.has(key)) out.push({ kind: 'add', text: t('diff.addStep', { name: s.name, role: ROLE_LABEL[s.role] ?? s.role }) })
  for (const [key, s] of oldSteps) if (!newSteps.has(key)) out.push({ kind: 'remove', text: t('diff.removeStep', { name: s.name }) })
  for (const [key, s] of newSteps) {
    const o = oldSteps.get(key)
    if (!o) continue
    const list = changes([
      ['name', o.name, s.name], ['handler', ROLE_LABEL[o.role], ROLE_LABEL[s.role]],
      ['kind', kind(o), kind(s)],
      ['cond', conditionText(before, o), conditionText(after, s)],
    ])
    if (list.length) out.push({ kind: 'change', text: t('diff.changeStep', { name: s.name, list: list.join('; ') }) })
  }
  const common = (list, other) => list.filter((s) => other.has(s.key)).map((s) => s.key).join()
  if (common(before.steps, newSteps) !== common(after.steps, oldSteps)) out.push({ kind: 'change', text: t('diff.reorder') })
  if (!out.length) out.push({ kind: 'change', text: t('diff.none') })
  return out
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const formatSize = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

/** Nhờ trợ lý AI đọc chứng từ (PDF hoặc ảnh) và gợi ý giá trị cho các trường của quy trình. Không lưu gì lên máy chủ. */
export async function fillFromFile(appKey, file) {
  await keycloak.updateToken(30)
  const res = await fetch(`${apiUrl}/fill?app=${encodeURIComponent(appKey)}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${keycloak.token}`, 'x-hasura-role': auth.role, 'content-type': file.type || 'application/octet-stream' },
    body: file,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message ?? t('err.http', { status: res.status }))
  return json.values
}

/** Tải một tệp lên hồ sơ. Ném lỗi với câu chữ người dùng đọc được. */
export async function uploadFile(submissionId, file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(t('err.big', { name: file.name }))
  if (file.size === 0) throw new Error(t('err.empty', { name: file.name }))
  await keycloak.updateToken(30)
  const res = await fetch(`${apiUrl}/files`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${keycloak.token}`, 'x-hasura-role': auth.role, 'x-submission-id': submissionId,
      'x-file-name': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? t('err.upload', { name: file.name }))
}

/** Tải tệp về máy. Trình duyệt không gửi được token khi bấm liên kết, nên lấy qua fetch rồi lưu. */
export async function downloadFile(file) {
  await keycloak.updateToken(30)
  const res = await fetch(`${apiUrl}/files/${file.id}`, { headers: { authorization: `Bearer ${keycloak.token}`, 'x-hasura-role': auth.role } })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? t('err.download'))
  const link = document.createElement('a')
  link.href = URL.createObjectURL(await res.blob())
  link.download = file.name
  link.click()
  URL.revokeObjectURL(link.href)
}
