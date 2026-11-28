// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// AI "thử việc": khi một hồ sơ vào bước duyệt có nấc tự chủ >= 2, AI đưa ý kiến (duyệt / từ chối kèm lý do),
// ghi vào ai_opinion. Người quyết định xong thì trigger trong cơ sở dữ liệu so sánh để đo độ khớp.
// Ở nấc 4, AI tự duyệt nếu ý kiến là duyệt; từ chối thì không bao giờ tự làm, hồ sơ luôn trở về cho người.
// AI lỗi hoặc không cấu hình: bỏ qua, luồng của người không bị ảnh hưởng.

import { adminHeaders } from './db.js'
import { chat, aiConfigured } from './ai.js'

const { HASURA_URL } = process.env

async function admin(query, variables) {
  const res = await fetch(`${HASURA_URL}/v1/graphql`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`Hasura: ${JSON.stringify(json.errors)}`)
  return json.data
}

/** Đọc câu trả lời của mô hình; trả null nếu không dùng được (không đoán). */
export function parseOpinion(text) {
  let json
  try { json = JSON.parse(text) } catch { return null }
  if (!['approve', 'reject'].includes(json?.decision)) return null
  const reason = typeof json.reason === 'string' ? json.reason.trim().slice(0, 300) : ''
  return reason ? { decision: json.decision, reason } : null
}

const VERB = { approve: 'duyệt', reject: 'từ chối', done: 'duyệt' }

/** Nội dung gửi cho AI: quy trình, bước, hồ sơ, và vài quyết định gần đây của người ở đúng bước này để học cách làm của tổ chức. */
export function buildMessages({ app, step, fields, data, history }) {
  const show = (d) => fields.map((f) => `- ${f.label}: ${d[f.key] ?? '(để trống)'}`).join('\n')
  const examples = history.map((h, i) => `Ví dụ ${i + 1}:\n${show(h.data)}\n=> Người đã ${VERB[h.action]}${h.note ? ` (ghi chú: ${h.note})` : ''}`).join('\n\n')
  return [
    { role: 'system', content: `Bạn là trợ lý hỗ trợ ký duyệt hồ sơ của một tổ chức. Nhiệm vụ: cho ý kiến ở bước "${step.name}" của quy trình "${app.name}"${app.description ? ` (${app.description})` : ''}.
Trả về MỘT đối tượng JSON: {"decision":"approve"|"reject","reason":"một câu tiếng Việt, nêu căn cứ cụ thể"}.
Quy tắc: chỉ từ chối khi hồ sơ có dấu hiệu rõ ràng không ổn (thiếu thông tin quan trọng, số liệu vô lý, lý do không phù hợp, khác hẳn cách người thường quyết định ở các ví dụ). Hồ sơ hợp lý thì duyệt. Không bịa thêm thông tin.` },
    { role: 'user', content: `${examples ? `Các quyết định gần đây của người ở bước này:\n\n${examples}\n\n` : ''}Hồ sơ cần cho ý kiến:\n${show(data)}` },
  ]
}

/** AI đưa ý kiến cho hồ sơ `id` đang chờ ở bước `stepKey`. Chạy lại được an toàn. */
export async function opine(id, stepKey) {
  if (!aiConfigured()) return
  const { submission_by_pk: sub } = await admin(
    `query($id: uuid!) { submission_by_pk(id: $id) { id app_key data status current_step app { name description } version { spec } } }`, { id })
  if (!sub || sub.status !== 'running' || sub.current_step !== stepKey) return
  const step = sub.version.spec.steps.find((s) => s.key === stepKey)
  if (!step || step.type === 'task') return

  const { step_autonomy_by_pk: auto, ai_opinion: existing } = await admin(
    `query($a: String!, $s: String!, $id: uuid!) { step_autonomy_by_pk(app_key: $a, step_key: $s) { level } ai_opinion(where: {submission_id: {_eq: $id}, step_key: {_eq: $s}}) { id } }`,
    { a: sub.app_key, s: stepKey, id })
  const level = auto?.level ?? 1
  if (level < 2 || existing.length) return

  const { submission_event: past } = await admin(
    `query($a: String!, $s: String!) { submission_event(where: {step_key: {_eq: $s}, actor_id: {_neq: "ai"}, submission: {app_key: {_eq: $a}}}, order_by: {id: desc}, limit: 6) { action note submission { data } } }`,
    { a: sub.app_key, s: stepKey })
  const history = past.map((e) => ({ action: e.action, note: e.note, data: e.submission.data }))

  // Dịch vụ AI hay giới hạn tần suất (429): thử lại vài lần, cách nhau dần, rồi thôi (người vẫn quyết định bình thường).
  let content
  for (const wait of [0, 5000, 15000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    try { ;({ content } = await chat(buildMessages({ app: sub.app, step, fields: sub.version.spec.fields, data: sub.data, history }))); break } catch (err) { if (wait === 15000) throw err }
  }
  const opinion = parseOpinion(content)
  if (!opinion) return console.error(`AI trả lời không dùng được cho hồ sơ ${id}`)

  await admin(
    `mutation($o: ai_opinion_insert_input!) { insert_ai_opinion_one(object: $o, on_conflict: {constraint: ai_opinion_submission_id_step_key_key, update_columns: []}) { id } }`,
    { o: { submission_id: id, step_key: stepKey, level, decision: opinion.decision, reason: opinion.reason } })

  if (level === 4 && opinion.decision === 'approve') {
    await admin(
      `mutation($o: submission_event_insert_input!, $id: uuid!, $s: String!) {
         insert_submission_event_one(object: $o) { id }
         update_ai_opinion(where: {submission_id: {_eq: $id}, step_key: {_eq: $s}}, _set: {human_action: "approve", decided_at: "now()"}) { affected_rows }
       }`,
      { id, s: stepKey, o: { submission_id: id, step_key: stepKey, action: 'approve', note: `Trợ lý AI tự duyệt: ${opinion.reason}`, actor_id: 'ai', actor_name: 'Trợ lý AI' } })
  }
}

/** Mỗi bước duyệt của một quy trình có một dòng nấc tự chủ (mặc định nấc 1: người làm). */
export async function ensureAutonomy(app) {
  const objects = app.spec.steps.filter((s) => s.type !== 'task').map((s) => ({ app_key: app.key, step_key: s.key }))
  if (!objects.length) return
  await admin(
    `mutation($o: [step_autonomy_insert_input!]!) { insert_step_autonomy(objects: $o, on_conflict: {constraint: step_autonomy_pkey, update_columns: []}) { affected_rows } }`,
    { o: objects })
}

export async function ensureAllAutonomy() {
  const { app } = await admin('{ app(where: {status: {_eq: "published"}}) { key spec } }')
  for (const a of app) await ensureAutonomy(a)
}
