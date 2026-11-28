// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Chạy SQL bằng quyền quản trị qua Hasura (bridge không có trình điều khiển PostgreSQL riêng).
import { current, withSpan } from './trace.js'

const { HASURA_URL, HASURA_ADMIN_SECRET } = process.env

/** Đặt cho giao dịch (run_sql chạy cả lô trong một giao dịch) người làm và mã truy vết, để trigger audit_log ghi lại
 *  (infra/postgres/init/11-audit.sql). Ngoài yêu cầu của người dùng thì người làm là chính bridge. */
export function auditPrefix(ctx = current()) {
  const parts = [`SET LOCAL dx.actor = ${lit(ctx?.actor || 'workflow-bridge')};`]
  if (ctx?.actor && ctx.role) parts.push(`SET LOCAL dx.actor_role = ${lit(ctx.role)};`)
  if (ctx?.span) parts.push(`SET LOCAL dx.trace_id = ${lit(ctx.span.traceId)};`)
  return parts.join(' ')
}

/** Tiêu đề cho lệnh GraphQL bằng quyền quản trị: Hasura đưa mọi x-hasura-* vào phiên (hasura.user) khi dùng khóa quản trị, nên trigger
 *  audit_log biết bridge làm thay ai và thuộc chuỗi truy vết nào. Người dùng thường (JWT) không tự đặt được các biến này. */
export function adminHeaders(ctx = current()) {
  const h = { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET, 'content-type': 'application/json', 'x-hasura-dx-actor': ctx?.actor || 'workflow-bridge' }
  if (ctx?.actor && ctx.role) h['x-hasura-dx-role'] = ctx.role
  if (ctx?.span) h['x-hasura-dx-trace-id'] = ctx.span.traceId
  return h
}

/** Trả về các dòng (bỏ dòng tên cột), giá trị là chuỗi; NULL của SQL (Hasura trả thành chuỗi "NULL") được trả về null. Chỉ ghép vào câu lệnh giá trị đã kiểm tra chặt hoặc đã qua lit(). */
export async function sql(query) {
  const op = /^\s*(\w+)/.exec(query)?.[1]?.toUpperCase() ?? 'SQL'
  return withSpan(`SQL ${op}`, { kind: 'client', attributes: { 'db.system': 'postgresql', 'db.operation': op } }, async () => {
    const res = await fetch(`${HASURA_URL}/v2/query`, {
      method: 'POST',
      headers: { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: `${auditPrefix()} ${query}` } }),
    })
    const json = await res.json()
    if (!res.ok || json.error) throw new Error(`run_sql: ${JSON.stringify(json)}`)
    return (json.result ?? []).slice(1).map((row) => row.map((v) => (v === 'NULL' ? null : v)))
  })
}

/** Chuỗi thành hằng SQL: nhân đôi dấu nháy đơn, cấm ký tự NUL. */
export const lit = (value) => {
  const s = String(value)
  if (s.includes(String.fromCharCode(0))) throw new Error('Chuỗi chứa ký tự NUL')
  return `'${s.replaceAll("'", "''")}'`
}
