// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// AI điền form từ chứng từ: POST /fill?app=<mã> (thân là tệp PDF hoặc ảnh thô).
// Trạm extractor đọc chữ (pdftotext hoặc OCR), trợ lý AI chọn giá trị cho từng trường của quy trình.
// Chỉ gợi ý: không lưu tệp, không tạo hồ sơ; người dùng xem, sửa rồi mới gửi (AI soạn, người duyệt).
// Chữ gửi sang dịch vụ AI đã được che số điện thoại, email, CCCD, số thẻ (chat() dùng maskMessages).
import { HttpError, asUser } from './files.js'
import { aiConfigured, chat } from './ai.js'

const { EXTRACTOR_URL } = process.env
const MAX_FILE = 8 * 1024 * 1024
const MAX_TEXT = 6000
const IMAGE_OR_PDF = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/bmp', 'image/gif'])

export function buildMessages(fields, text) {
  const list = fields.map((f) => `- ${f.key} (${f.label}; kiểu ${f.type}${f.options ? `; chỉ được chọn: ${f.options.join(' | ')}` : ''})`).join('\n')
  return [
    { role: 'system', content: 'Bạn đọc chứng từ văn phòng Việt Nam (hóa đơn, phiếu thu chi, đề nghị) và trích giá trị cho các trường của một biểu mẫu. Chỉ trả JSON dạng {"key": giá trị}. Số tiền chỉ gồm chữ số (không dấu chấm, phẩy, đơn vị). Ngày theo YYYY-MM-DD. Trường nào chứng từ không có thì bỏ qua, không đoán.' },
    { role: 'user', content: `Các trường của biểu mẫu:\n${list}\n\nNội dung chứng từ:\n${text.slice(0, MAX_TEXT)}` },
  ]
}

/** Giữ lại đúng các trường của biểu mẫu, ép về đúng kiểu; giá trị không hợp lệ thì bỏ (không bao giờ đưa dữ liệu lạ vào form). */
export function normalise(fields, json) {
  const out = {}
  if (!json || typeof json !== 'object') return out
  for (const f of fields) {
    const raw = json[f.key]
    if (raw === undefined || raw === null || raw === '') continue
    if (f.type === 'number') {
      // Tiền Việt dùng dấu chấm/phẩy ngăn nghìn: bỏ hết, chỉ giữ chữ số (và dấu trừ đầu).
      const digits = String(raw).replace(/[.,\s]/g, '').replace(/[^\d-]/g, '')
      if (/\d/.test(digits) && Number.isFinite(Number(digits))) out[f.key] = Number(digits)
    } else if (f.type === 'date') {
      const d = String(raw).trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))) out[f.key] = d
    } else if (f.type === 'select') {
      if (f.options?.includes(raw)) out[f.key] = raw
    } else if (typeof raw === 'string' || typeof raw === 'number') {
      out[f.key] = String(raw).trim().slice(0, 2000)
    }
  }
  return out
}

async function readFile(req) {
  if (Number(req.headers['content-length'] ?? 0) > MAX_FILE) throw new HttpError(413, 'Tệp lớn hơn 8 MB')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_FILE) throw new HttpError(413, 'Tệp lớn hơn 8 MB')
    chunks.push(chunk)
  }
  if (!size) throw new HttpError(400, 'Tệp rỗng')
  return Buffer.concat(chunks)
}

export async function handleFill(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(404, 'Không tìm thấy')
    if (!aiConfigured()) throw new HttpError(501, 'Trợ lý AI chưa được cấu hình')
    if (!EXTRACTOR_URL) throw new HttpError(501, 'Trạm đọc chữ (extractor) chưa bật')
    const key = new URL(req.url, 'http://x').searchParams.get('app') ?? ''
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (!IMAGE_OR_PDF.has(mime)) throw new HttpError(415, 'Chỉ đọc được PDF và ảnh')
    // Hasura kiểm quyền: người dùng chỉ lấy được quy trình mà họ được thấy.
    const data = await asUser(req, 'query($k: String!) { app_by_pk(key: $k) { spec status } }', { k: key })
    if (!data.app_by_pk || data.app_by_pk.status !== 'published') throw new HttpError(404, 'Không tìm thấy quy trình')
    const fields = data.app_by_pk.spec.fields
    const body = await readFile(req)
    const ex = await fetch(`${EXTRACTOR_URL}/extract`, { method: 'POST', headers: { 'content-type': mime }, body, signal: AbortSignal.timeout(120_000) })
    if (!ex.ok) throw new HttpError(ex.status === 415 ? 415 : 502, 'Chưa đọc được chữ trong tệp')
    const text = ((await ex.json()).text ?? '').replace(/\s+/g, ' ').trim()
    if (text.length < 15) throw new HttpError(422, 'Không đọc được chữ trong tệp; hãy chụp rõ hơn hoặc nhập tay')
    const { json } = await chat(buildMessages(fields, text))
    const values = normalise(fields, json)
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ values }))
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 502
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ message: err instanceof HttpError ? err.message : 'Trợ lý AI chưa trả lời được, hãy nhập tay' }))
  }
}
