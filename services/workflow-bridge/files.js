// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Tệp đính kèm hồ sơ, lưu trong kho đối tượng chuẩn S3 (SeaweedFS). Đi qua cổng API:
//   POST /files        thân yêu cầu = nội dung tệp; header X-Submission-Id, X-File-Name (mã hóa URI)
//   GET  /files/<id>   tải tệp về
// Quyền do Hasura quyết định bằng chính token của người dùng (tệp thuộc hồ sơ mà họ được xem / được xử lý),
// nên không có hai bộ luật phân quyền lệch nhau. Cổng API đã kiểm chữ ký token trước khi tới đây.
// Kho S3 không mở ra ngoài: không ai tới được tệp mà không qua đây.

import { adminHeaders } from './db.js'
import { randomUUID } from 'node:crypto'
import { scan } from './scan.js'
import { s3fetch } from './s3.js'
import { notify } from './events.js'

const { HASURA_URL } = process.env
const BUCKET = 'dxlab'
export const MAX_BYTES = 10 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Bỏ đường dẫn và ký tự điều khiển; giữ tên người dùng nhận ra được. */
export function safeName(raw) {
  const name = String(raw ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f"<>|:*?]/g, '').trim().slice(0, 150)
  return name || 'tep-dinh-kem'
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export async function asUser(req, query, variables) {
  const authorization = req.headers.authorization
  if (!authorization) throw new HttpError(401, 'Thiếu thông tin đăng nhập')
  const res = await fetch(`${HASURA_URL}/v1/graphql`, {
    method: 'POST',
    headers: { authorization, 'x-hasura-role': req.headers['x-hasura-role'] ?? 'staff', 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new HttpError(403, 'Bạn không có quyền với hồ sơ này')
  return json.data
}

let bucketReady = false
async function ensureBucket() {
  if (bucketReady) return
  const res = await s3fetch(`/${BUCKET}`, { method: 'PUT' })
  if (!res.ok && res.status !== 409) throw new HttpError(502, 'Kho lưu trữ chưa sẵn sàng')
  bucketReady = true
}

async function readBody(req) {
  const length = Number(req.headers['content-length'] ?? 0)
  if (length > MAX_BYTES) throw new HttpError(413, 'Tệp lớn hơn 10 MB')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BYTES) throw new HttpError(413, 'Tệp lớn hơn 10 MB')
    chunks.push(chunk)
  }
  if (!size) throw new HttpError(400, 'Tệp rỗng')
  return Buffer.concat(chunks)
}

async function upload(req, res) {
  const submissionId = req.headers['x-submission-id']
  if (!UUID.test(submissionId ?? '')) throw new HttpError(400, 'Thiếu mã hồ sơ')
  const name = safeName(decodeURIComponent(req.headers['x-file-name'] ?? ''))
  const body = await readBody(req)
  // Kiểm dịch trước mọi thứ khác: tệp nhiễm không để lại dấu vết nào trong cơ sở dữ liệu hay kho lưu trữ.
  let verdict
  try { verdict = await scan(body) } catch (err) {
    console.error('Trạm kiểm dịch lỗi:', err.message)
    throw new HttpError(503, 'Trạm kiểm dịch mã độc chưa sẵn sàng, tệp chưa được nhận. Hãy thử lại sau ít phút')
  }
  if (!verdict.clean) throw new HttpError(422, `Tệp bị từ chối: phát hiện mã độc (${verdict.signature})`)
  const key = `${submissionId}/${randomUUID()}`
  // Ghi dòng dữ liệu trước bằng quyền của người dùng: bị từ chối thì chưa có gì nằm trong kho.
  const { insert_attachment_one: row } = await asUser(req,
    'mutation($o: attachment_insert_input!) { insert_attachment_one(object: $o) { id name size created_at } }',
    { o: { submission_id: submissionId, name, size: body.length, content_type: req.headers['content-type'] ?? null, object_key: key } })
  try {
    await ensureBucket()
    const put = await s3fetch(`/${BUCKET}/${key}`, { method: 'PUT', body })
    if (!put.ok) throw new Error(`S3 ${put.status}`)
  } catch (err) {
    // Không để lại dòng dữ liệu trỏ vào tệp không tồn tại.
    await fetch(`${HASURA_URL}/v1/graphql`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ query: 'mutation($id: uuid!) { delete_attachment_by_pk(id: $id) { id } }', variables: { id: row.id } }),
    })
    throw new HttpError(502, 'Chưa lưu được tệp, hãy thử lại')
  }
  notify()
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(row))
}

async function download(req, res, id) {
  if (!UUID.test(id)) throw new HttpError(404, 'Không tìm thấy tệp')
  const { attachment_by_pk: file } = await asUser(req,
    'query($id: uuid!) { attachment_by_pk(id: $id) { name object_key } }', { id })
  if (!file) throw new HttpError(404, 'Không tìm thấy tệp, hoặc bạn không có quyền xem')
  const object = await s3fetch(`/${BUCKET}/${file.object_key}`)
  if (!object.ok) throw new HttpError(502, 'Chưa đọc được tệp từ kho lưu trữ')
  res.writeHead(200, {
    // Luôn tải về, không cho trình duyệt tự mở: tệp do người dùng tải lên không được chạy trong trang.
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'x-content-type-options': 'nosniff',
    'content-length': object.headers.get('content-length') ?? undefined,
  })
  res.end(Buffer.from(await object.arrayBuffer()))
}

export async function handleFiles(req, res) {
  try {
    const path = req.url.split('?')[0]
    if (req.method === 'POST' && path === '/files') return await upload(req, res)
    if (req.method === 'GET' && path.startsWith('/files/')) return await download(req, res, path.slice(7))
    throw new HttpError(404, 'Không tìm thấy')
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ message: status === 500 ? 'Lỗi máy chủ' : err.message }))
  }
}
