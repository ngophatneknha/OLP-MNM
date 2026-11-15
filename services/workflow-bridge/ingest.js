// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Nạp hàng loạt hồ sơ: POST /ingest?app=<mã ứng dụng>, thân là mảng JSON hoặc CSV (dòng đầu là tên trường).
// Từng dòng được gửi bằng token của chính người nạp, nên mọi rào chắn (quyền, kiểu dữ liệu, trường bắt buộc) vẫn do cơ sở dữ liệu quyết định.
// Dòng sai không làm hỏng các dòng khác: kết quả trả về số dòng đã nhận và lý do từng dòng bị từ chối.
import { HttpError, asUser } from './files.js'
import { notify } from './events.js'

export const MAX_ROWS = 500
const MAX_BODY = 2 * 1024 * 1024
const NL = String.fromCharCode(10)

/** CSV đơn giản: dấu phẩy, ô có thể đặt trong ngoặc kép (ngoặc kép đôi "" là một dấu "), xuống dòng trong ô được giữ. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === NL || c === String.fromCharCode(13)) {
      if (c === String.fromCharCode(13) && src[i + 1] === NL) i++
      row.push(cell); cell = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((v) => v !== '')) rows.push(row)
  const [head, ...body] = rows
  return (head ? body : []).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])))
}

/** Ép giá trị theo kiểu khai báo của trường: ô CSV luôn là chữ, ô trống coi như không điền. Cột lạ giữ nguyên để cơ sở dữ liệu từ chối. */
export function coerce(row, fields) {
  const type = Object.fromEntries(fields.map((f) => [f.key, f.type]))
  const out = {}
  for (const [key, v] of Object.entries(row)) {
    if (v === undefined || v === null || v === '') continue
    out[key] = type[key] === 'number' && typeof v === 'string' ? Number(v) : v
  }
  return out
}

async function readText(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'Tệp nạp lớn hơn 2 MB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function handleIngest(req, res) {
  try {
    const appKey = new URL(req.url, 'http://x').searchParams.get('app')
    if (req.method !== 'POST' || !appKey) throw new HttpError(400, 'Dùng POST /ingest?app=<mã ứng dụng>')
    const text = await readText(req)
    const isCsv = (req.headers['content-type'] ?? '').includes('csv')
    let rows
    try { rows = isCsv ? parseCsv(text) : JSON.parse(text) } catch { throw new HttpError(400, 'Nội dung không phải CSV hay mảng JSON hợp lệ') }
    if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'Không có dòng nào để nạp')
    if (rows.length > MAX_ROWS) throw new HttpError(413, `Tối đa ${MAX_ROWS} dòng mỗi lần nạp`)
    const { app_by_pk: app } = await asUser(req, 'query($k: String!) { app_by_pk(key: $k) { status spec } }', { k: appKey })
    if (!app || app.status !== 'published') throw new HttpError(404, 'Không có ứng dụng đã xuất bản với mã này')
    const failed = []
    let created = 0
    for (const [i, row] of rows.entries()) {
      try {
        await asUser(req, 'mutation($o: submission_insert_input!) { insert_submission_one(object: $o) { id } }', { o: { app_key: appKey, data: coerce(row, app.spec.fields) } })
        created++
      } catch (err) {
        failed.push({ row: i + 1, reason: err instanceof HttpError ? 'bị từ chối: thiếu trường bắt buộc, sai kiểu dữ liệu hoặc không đủ quyền' : String(err.message) })
      }
    }
    notify()
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ created, failed }))
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ message: status === 500 ? 'Lỗi máy chủ' : err.message }))
  }
}
