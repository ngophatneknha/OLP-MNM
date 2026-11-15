// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Chạy SQL bằng quyền quản trị qua Hasura (bridge không có trình điều khiển PostgreSQL riêng).
const { HASURA_URL, HASURA_ADMIN_SECRET } = process.env

/** Trả về các dòng (bỏ dòng tên cột), giá trị là chuỗi; NULL của SQL (Hasura trả thành chuỗi "NULL") được trả về null. Chỉ ghép vào câu lệnh giá trị đã kiểm tra chặt hoặc đã qua lit(). */
export async function sql(query) {
  const res = await fetch(`${HASURA_URL}/v2/query`, {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: query } }),
  })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(`run_sql: ${JSON.stringify(json)}`)
  return (json.result ?? []).slice(1).map((row) => row.map((v) => (v === 'NULL' ? null : v)))
}

/** Chuỗi thành hằng SQL: nhân đôi dấu nháy đơn, cấm ký tự NUL. */
export const lit = (value) => {
  const s = String(value)
  if (s.includes(String.fromCharCode(0))) throw new Error('Chuỗi chứa ký tự NUL')
  return `'${s.replaceAll("'", "''")}'`
}
