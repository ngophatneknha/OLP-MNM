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
import { sql, lit } from './db.js'

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
const ORG = /^[a-z][a-z0-9_-]{1,30}$/
/** Tổ chức của người gọi, lấy từ token (cùng nguồn với x-hasura-org-id); thiếu claim thì là tổ chức mặc định. */
export function orgOf(req) {
  const org = claimsOf(req).org_id ?? 'default'
  if (typeof org !== 'string' || !ORG.test(org)) throw new HttpError(403, 'Token có mã tổ chức không hợp lệ')
  return org
}
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

/** Xuất các hồ sơ của tổ chức `org` đã kết thúc quá `days` ngày chưa có trong kho lạnh. Mỗi tổ chức một chuỗi sổ cái riêng. Trả về { archived, id? }. */
export async function archiveFinished(days = Number(ARCHIVE_AFTER_DAYS), org = 'default') {
  if (!Number.isInteger(days) || days < 0) throw new HttpError(400, 'Số ngày không hợp lệ')
  if (!ORG.test(org)) throw new HttpError(400, 'Mã tổ chức không hợp lệ')
  if (busy) throw new HttpError(409, 'Đang có một lần xuất khác chạy')
  busy = true
  try {
    const ids = (await sql(`SELECT s.id FROM submission s WHERE s.org_id = ${lit(org)} AND s.status IN ('approved','rejected') AND s.finished_at <= now() - interval '${days} days'
      AND NOT EXISTS (SELECT 1 FROM cold_item c WHERE c.submission_id = s.id) ORDER BY s.finished_at, s.id LIMIT ${BATCH}`)).map((r) => r[0])
    if (!ids.length) return { archived: 0 }
    if (!ids.every((id) => UUID.test(id))) throw new Error('Mã hồ sơ lạ')
    const lines = (await sql(`SELECT row_to_json(t)::text FROM (SELECT s.*, (SELECT coalesce(jsonb_agg(e ORDER BY e.created_at, e.id), '[]'::jsonb) FROM submission_event e WHERE e.submission_id = s.id) AS events
      FROM submission s WHERE s.id = ANY(ARRAY[${idList(ids)}]::uuid[]) ORDER BY s.finished_at, s.id) t`)).map((r) => r[0])
    const body = Buffer.from(`${lines.join(String.fromCharCode(10))}${String.fromCharCode(10)}`)
    const key = `${org}/${new Date().toISOString().slice(0, 7).replace('-', '/')}/${randomUUID()}.jsonl`
    await ensureBucket()
    const put = await s3fetch(`/${BUCKET}/${key}`, { method: 'PUT', body })
    if (!put.ok) throw new HttpError(502, 'Chưa ghi được tệp vào kho lạnh')
    const prev = (await sql(`SELECT entry_hash FROM cold_archive WHERE org_id = ${lit(org)} ORDER BY seq DESC LIMIT 1`))[0]?.[0] ?? GENESIS
    const objectSha = sha(body)
    const id = randomUUID()
    // Một giao dịch: sổ cái và danh sách hồ sơ đã xuất cùng thành công hoặc cùng không có gì.
    await sql(`INSERT INTO cold_archive (id, org_id, object_key, rows, object_sha256, prev_hash, entry_hash) VALUES ('${id}', ${lit(org)}, '${key}', ${ids.length}, '${objectSha}', '${prev}', '${entryHash(prev, objectSha, ids.length, key)}');
      INSERT INTO cold_item (submission_id, archive_id) SELECT unnest(ARRAY[${idList(ids)}]::uuid[]), '${id}'`)
    return { archived: ids.length, id }
  } finally { busy = false }
}

/** Kiểm chứng sổ cái của một tổ chức: chuỗi băm liền mạch và mọi tệp còn nguyên. */
export async function verifyChain(org = 'default') {
  const rows = await sql(`SELECT id, object_key, rows, object_sha256, prev_hash, entry_hash FROM cold_archive WHERE org_id = ${lit(org)} ORDER BY seq`)
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

/** Xuất kho lạnh cho mọi tổ chức (việc chạy hằng ngày). Lỗi ở một tổ chức không chặn các tổ chức còn lại. */
export async function archiveAll() {
  for (const [org] of await sql('SELECT id FROM org ORDER BY id')) {
    await archiveFinished(undefined, org).catch((err) => console.error(`Xuất kho lạnh (${org}):`, err.message))
  }
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

const rowsJson = async (query) => JSON.parse((await sql(`SELECT coalesce(json_agg(t), '[]')::text FROM (${query}) t`))[0][0])
const JAEGER_UI = process.env.JAEGER_UI_URL ?? 'http://127.0.0.1:16686'

/** Dòng đời một hồ sơ: ai tạo, ai sửa cột nào (audit_log), ai duyệt và có chữ ký số không, đã phát lên NATS chưa, tệp đính kèm,
 *  xuống kho lạnh ở tệp nào (mã băm, sổ cái), nạp vào ảnh chụp Iceberg nào hay đã bị xóa theo yêu cầu, và các mã truy vết (Jaeger).
 *  Chỉ trong tổ chức của người hỏi; hồ sơ của tổ chức khác trả 404 như không tồn tại. */
export async function submissionLineage(id, org) {
  if (!UUID.test(id)) throw new HttpError(400, 'Mã hồ sơ không hợp lệ')
  const sub = (await rowsJson(`SELECT id, no, app_key, app_version, status, current_step, submitter_id, created_at, finished_at FROM submission WHERE id = ${lit(id)} AND org_id = ${lit(org)}`))[0]
  if (!sub) throw new HttpError(404, 'Không tìm thấy hồ sơ')
  const events = await rowsJson(`SELECT e.id, e.step_key, e.action, e.actor_id, e.created_at,
      EXISTS (SELECT 1 FROM event_signature g WHERE g.event_id = e.id) AS signed,
      (SELECT p.published_at FROM stream_published p WHERE p.event_id = e.id) AS published_at
    FROM submission_event e WHERE e.submission_id = ${lit(id)} ORDER BY e.created_at, e.id`)
  const attachments = await rowsJson(`SELECT id, object_key, size, content_type, uploader_id, created_at FROM attachment WHERE submission_id = ${lit(id)} ORDER BY created_at`)
  const changes = await rowsJson(`SELECT l.id, l.at, l.table_name, l.row_key, l.op, l.actor_id, l.actor_role, l.via, l.changes, l.trace_id
    FROM audit_log l WHERE (l.table_name = 'submission' AND l.row_key = ${lit(id)})
       OR (l.table_name IN ('attachment', 'ai_opinion') AND l.changes -> 'submission_id' ->> 'new' = ${lit(id)})
       OR (l.table_name = 'attachment' AND l.row_key IN (SELECT a.id::text FROM attachment a WHERE a.submission_id = ${lit(id)}))
       OR (l.table_name = 'ai_opinion' AND l.row_key IN (SELECT o.id::text FROM ai_opinion o WHERE o.submission_id = ${lit(id)}))
    ORDER BY l.id`)
  const archive = (await rowsJson(`SELECT a.id, a.object_key, a.object_sha256, a.entry_hash, a.created_at FROM cold_item c JOIN cold_archive a ON a.id = c.archive_id WHERE c.submission_id = ${lit(id)}`))[0] ?? null
  const forgotten = await rowsJson(`SELECT at, rows, snapshot_id FROM lake_event WHERE operation = 'forget' AND subject_sha256 = ${lit(sha(id))} ORDER BY id`)
  const lake = archive ? await rowsJson(`SELECT l.operation, l.at, l.snapshot_id, l.rows FROM lake_event l
    WHERE l.id >= coalesce((SELECT min(x.id) FROM lake_event x WHERE x.operation = 'load' AND x.object_key = ${lit(archive.object_key)}), 9223372036854775807)
      AND (l.object_key = ${lit(archive.object_key)} OR l.operation IN ('compact', 'expire'))
    ORDER BY l.id`) : []
  const timeline = [
    // Hồ sơ tạo trước khi có audit_log (bản cũ) thì lấy thời điểm và người gửi từ chính hồ sơ.
    ...(changes.some((c) => c.table_name === 'submission' && c.op === 'INSERT') ? [] : [{ at: sub.created_at, what: 'tạo hồ sơ', actor_id: sub.submitter_id }]),
    ...changes.map((c) => ({ at: c.at, what: `${c.op} ${c.table_name}`, actor_id: c.actor_id, actor_role: c.actor_role, via: c.via, columns: Object.keys(c.changes), trace_id: c.trace_id })),
    ...events.map((e) => ({ at: e.created_at, what: `${e.action} bước ${e.step_key}`, actor_id: e.actor_id, signed: e.signed })),
    ...events.filter((e) => e.published_at).map((e) => ({ at: e.published_at, what: `phát lên NATS dx.${org}.submission.${e.action}` })),
    ...(archive ? [{ at: archive.created_at, what: `chuyển xuống kho lạnh ${archive.object_key}`, sha256: archive.object_sha256 }] : []),
    ...lake.map((l) => ({ at: l.at, what: l.operation === 'load' ? `nạp vào bảng Iceberg, ảnh chụp ${l.snapshot_id}` : l.operation === 'compact' ? `gộp tệp Iceberg, nay ở ảnh chụp ${l.snapshot_id}` : `xóa ${l.rows} ảnh chụp Iceberg quá hạn` })),
    ...forgotten.map((f) => ({ at: f.at, what: 'xóa khỏi bảng Iceberg và mọi ảnh chụp cũ theo yêu cầu (Luật Bảo vệ dữ liệu cá nhân)' })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at))
  const traces = [...new Set(changes.map((c) => c.trace_id).filter(Boolean))]
  return { submission: sub, timeline, events, changes, attachments, archive, lake, forgotten: forgotten.length > 0, traces: traces.map((t) => ({ trace_id: t, jaeger: `${JAEGER_UI}/trace/${t}` })) }
}

/** Lịch sử thay đổi của một dòng bất kỳ (bảng có trigger audit), trong tổ chức của người hỏi. */
export async function rowHistory(table, key, org) {
  if (!/^[a-z_]{1,40}$/.test(table) || typeof key !== 'string' || !key || key.length > 200) throw new HttpError(400, 'Thiếu hoặc sai bảng, khóa')
  return rowsJson(`SELECT id, at, op, actor_id, actor_role, via, changes, trace_id FROM audit_log
    WHERE table_name = ${lit(table)} AND row_key = ${lit(key)} AND org_id = ${lit(org)} ORDER BY id`)
}

/** Kiểm chuỗi băm của audit_log: các dòng bị sửa, bị xóa hay bị chèn (chuỗi chung cho mọi tổ chức). */
export async function auditVerify() {
  const broken = await rowsJson('SELECT id, problem FROM audit_broken()')
  const [[rows]] = await sql('SELECT count(*) FROM audit_log')
  return { ok: broken.length === 0, rows: Number(rows), broken }
}

const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

export async function handleCold(req, res) {
  try {
    const url = new URL(req.url, 'http://x')
    const path = url.pathname
    requireDirector(req)
    const org = orgOf(req)
    if (req.method === 'POST' && path === '/archive') return json(res, 200, await archiveFinished(url.searchParams.has('days') ? Number(url.searchParams.get('days')) : undefined, org))
    if (req.method === 'GET' && path === '/archive/verify') return json(res, 200, await verifyChain(org))
    if (req.method === 'GET' && path === '/archive') {
      return json(res, 200, (await sql(`SELECT id, object_key, rows, object_sha256, entry_hash, created_at FROM cold_archive WHERE org_id = ${lit(org)} ORDER BY seq DESC LIMIT 200`))
        .map(([id, key, rows, objectSha, hash, at]) => ({ id, object_key: key, rows: Number(rows), object_sha256: objectSha, entry_hash: hash, created_at: at })))
    }
    if (req.method === 'GET' && path === '/lineage') return json(res, 200, await lineage())
    if (req.method === 'GET' && path.startsWith('/lineage/submission/')) return json(res, 200, await submissionLineage(decodeURIComponent(path.slice(20)), org))
    if (req.method === 'GET' && path === '/audit') return json(res, 200, await rowHistory(url.searchParams.get('table'), url.searchParams.get('key'), org))
    if (req.method === 'GET' && path === '/audit/verify') return json(res, 200, await auditVerify())
    throw new HttpError(404, 'Không tìm thấy')
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    json(res, status, { message: status === 500 ? 'Lỗi máy chủ' : err.message })
  }
}
