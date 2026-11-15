// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kho dữ liệu lạnh và phả hệ dữ liệu.
//  - Hồ sơ đã kết thúc quá hạn được xuất ra tệp JSONL (kèm toàn bộ nhật ký) trong kho S3, bucket dxlab-cold.
//  - Sổ cái cold_archive nối chuỗi mã băm: kiểm chứng phát hiện tệp bị sửa, bị thay, hoặc dòng sổ bị chèn/xóa.
//  - Phả hệ: các view báo cáo (bi.app_*) đọc từ bảng nào lấy thẳng từ danh mục của PostgreSQL, không khai tay.
// shortcut: định dạng JSONL (không phải Parquet/Iceberg), một tiến trình bridge giữ khóa chống chạy chồng; bản sao nóng không bị xóa.
// Cần lakehouse thật thì xuất Parquet và ghi bảng Iceberg ở bước này.
import { createHash, randomUUID } from 'node:crypto'
import { s3fetch } from './s3.js'
import { HttpError } from './files.js'
import { sql } from './db.js'

const { ARCHIVE_AFTER_DAYS = '90' } = process.env
const BUCKET = 'dxlab-cold'
const GENESIS = '0'.repeat(64)
const BATCH = 2000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const sha = (data) => createHash('sha256').update(data).digest('hex')
export const entryHash = (prev, objectSha, rows, key) => sha(`${prev}:${objectSha}:${rows}:${key}`)

/** Nội dung token (chữ ký đã được cổng API xác thực; bridge không mở ra ngoài cổng). Token hỏng thì trả {}. */
export function claimsOf(req) {
  try { return JSON.parse(Buffer.from(req.headers.authorization.split('.')[1], 'base64url').toString()) } catch { return {} }
}
export const rolesOf = (req) => claimsOf(req).realm_access?.roles ?? []
const requireDirector = (req) => { if (!rolesOf(req).includes('director')) throw new HttpError(403, 'Chỉ giám đốc xem và vận hành kho lạnh') }

let busy = false
let bucketReady = false
async function ensureBucket() {
  if (bucketReady) return
  const res = await s3fetch(`/${BUCKET}`, { method: 'PUT' })
  if (!res.ok && res.status !== 409) throw new HttpError(502, 'Kho lạnh chưa sẵn sàng')
  bucketReady = true
}

const idList = (ids) => ids.map((i) => `'${i}'`).join(',')

/** Xuất các hồ sơ đã kết thúc quá `days` ngày chưa có trong kho lạnh. Trả về { archived, id? }. */
export async function archiveFinished(days = Number(ARCHIVE_AFTER_DAYS)) {
  if (!Number.isInteger(days) || days < 0) throw new HttpError(400, 'Số ngày không hợp lệ')
  if (busy) throw new HttpError(409, 'Đang có một lần xuất khác chạy')
  busy = true
  try {
    const ids = (await sql(`SELECT s.id FROM submission s WHERE s.status IN ('approved','rejected') AND s.finished_at <= now() - interval '${days} days'
      AND NOT EXISTS (SELECT 1 FROM cold_item c WHERE c.submission_id = s.id) ORDER BY s.finished_at, s.id LIMIT ${BATCH}`)).map((r) => r[0])
    if (!ids.length) return { archived: 0 }
    if (!ids.every((id) => UUID.test(id))) throw new Error('Mã hồ sơ lạ')
    const lines = (await sql(`SELECT row_to_json(t)::text FROM (SELECT s.*, (SELECT coalesce(json_agg(e ORDER BY e.created_at, e.id), '[]'::json) FROM submission_event e WHERE e.submission_id = s.id) AS events
      FROM submission s WHERE s.id = ANY(ARRAY[${idList(ids)}]::uuid[]) ORDER BY s.finished_at, s.id) t`)).map((r) => r[0])
    const body = Buffer.from(`${lines.join(String.fromCharCode(10))}${String.fromCharCode(10)}`)
    const key = `${new Date().toISOString().slice(0, 7).replace('-', '/')}/${randomUUID()}.jsonl`
    await ensureBucket()
    const put = await s3fetch(`/${BUCKET}/${key}`, { method: 'PUT', body })
    if (!put.ok) throw new HttpError(502, 'Chưa ghi được tệp vào kho lạnh')
    const prev = (await sql('SELECT entry_hash FROM cold_archive ORDER BY seq DESC LIMIT 1'))[0]?.[0] ?? GENESIS
    const objectSha = sha(body)
    const id = randomUUID()
    // Một giao dịch: sổ cái và danh sách hồ sơ đã xuất cùng thành công hoặc cùng không có gì.
    await sql(`INSERT INTO cold_archive (id, object_key, rows, object_sha256, prev_hash, entry_hash) VALUES ('${id}', '${key}', ${ids.length}, '${objectSha}', '${prev}', '${entryHash(prev, objectSha, ids.length, key)}');
      INSERT INTO cold_item (submission_id, archive_id) SELECT unnest(ARRAY[${idList(ids)}]::uuid[]), '${id}'`)
    return { archived: ids.length, id }
  } finally { busy = false }
}

/** Kiểm chứng toàn bộ sổ cái: chuỗi băm liền mạch và mọi tệp còn nguyên. */
export async function verifyChain() {
  const rows = await sql('SELECT id, object_key, rows, object_sha256, prev_hash, entry_hash FROM cold_archive ORDER BY seq')
  const problems = []
  let prev = GENESIS
  for (const [id, key, n, objectSha, prevHash, hash] of rows) {
    if (prevHash !== prev) problems.push({ id, error: 'đứt chuỗi: mã băm dòng trước không khớp' })
    if (entryHash(prevHash, objectSha, Number(n), key) !== hash) problems.push({ id, error: 'dòng sổ bị sửa' })
    const obj = await s3fetch(`/${BUCKET}/${key}`)
    if (!obj.ok) problems.push({ id, error: `tệp không đọc được (${obj.status})` })
    else if (sha(Buffer.from(await obj.arrayBuffer())) !== objectSha) problems.push({ id, error: 'nội dung tệp đã bị sửa' })
    prev = hash
  }
  return { ok: problems.length === 0, archives: rows.length, problems }
}

/** Đồ thị phả hệ: view báo cáo đọc từ bảng nào (lấy từ danh mục PostgreSQL) cộng các luồng do mã của dự án tạo ra. */
export async function lineage() {
  const edges = (await sql(`SELECT DISTINCT view_schema || '.' || view_name, table_schema || '.' || table_name FROM information_schema.view_table_usage WHERE view_schema = 'bi'`))
    .map(([to, from]) => ({ from, to, via: 'view' }))
  edges.push(
    { from: 'public.submission', to: 'cold_archive (JSONL trong kho dxlab-cold)', via: 'archiveFinished' },
    { from: 'public.submission_event', to: 'cold_archive (JSONL trong kho dxlab-cold)', via: 'archiveFinished' },
    { from: 'public.submission', to: 'Số liệu và điểm H-P-D-I', via: 'web/src/metrics.js, maturity.js' },
    { from: 'public.submission_event', to: 'Số liệu và điểm H-P-D-I', via: 'web/src/metrics.js, maturity.js' },
    { from: 'public.ai_opinion', to: 'Số liệu và điểm H-P-D-I', via: 'web/src/maturity.js' },
  )
  return { edges }
}

const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

export async function handleCold(req, res) {
  try {
    const url = new URL(req.url, 'http://x')
    const path = url.pathname
    requireDirector(req)
    if (req.method === 'POST' && path === '/archive') return json(res, 200, await archiveFinished(url.searchParams.has('days') ? Number(url.searchParams.get('days')) : undefined))
    if (req.method === 'GET' && path === '/archive/verify') return json(res, 200, await verifyChain())
    if (req.method === 'GET' && path === '/archive') {
      return json(res, 200, (await sql('SELECT id, object_key, rows, object_sha256, entry_hash, created_at FROM cold_archive ORDER BY seq DESC LIMIT 200'))
        .map(([id, key, rows, objectSha, hash, at]) => ({ id, object_key: key, rows: Number(rows), object_sha256: objectSha, entry_hash: hash, created_at: at })))
    }
    if (req.method === 'GET' && path === '/lineage') return json(res, 200, await lineage())
    throw new HttpError(404, 'Không tìm thấy')
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    json(res, status, { message: status === 500 ? 'Lỗi máy chủ' : err.message })
  }
}
