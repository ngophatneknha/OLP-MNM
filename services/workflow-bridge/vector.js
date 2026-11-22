// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Tìm ngữ nghĩa tách riêng (profile vector): Qdrant lưu véc-tơ, dịch vụ nhúng Text Embeddings Inference (TEI) biến chữ thành véc-tơ.
// Không dùng Ollama nên không tranh tài nguyên với mô hình ngôn ngữ; Meilisearch vẫn lo phần từ khóa.
// Mô-đun này không biết mô hình nào đang chạy: nếu mô hình cần tiền tố riêng cho câu hỏi/tài liệu thì đặt qua biến môi trường (mặc định không có).
// Như Meilisearch, Qdrant KHÔNG quyết định quyền: search.js luôn kiểm lại kết quả bằng Hasura.

import { createHash } from 'node:crypto'

const env = process.env // đọc lúc gọi (không chụp lúc nạp mô-đun), như vậy search.js nạp lại là thấy cấu hình mới
export const vectorOn = () => Boolean(env.VECTOR_URL && env.EMBED_URL)
const COLLECTION = 'docs'
const EMBED_BATCH = 32 // bằng giới hạn mặc định của TEI cho mỗi yêu cầu

async function call(url, opts, what) {
  const res = await fetch(url, { ...opts, headers: { 'content-type': 'application/json', ...opts.headers }, signal: AbortSignal.timeout(opts.timeout ?? 10_000) })
  const text = await res.text()
  if (!res.ok) throw Object.assign(new Error(`${what}: ${res.status} ${text.slice(0, 200)}`), { status: res.status })
  return text ? JSON.parse(text) : null
}
const qdrant = (method, path, body) => call(`${env.VECTOR_URL}${path}`, { method, headers: env.VECTOR_API_KEY ? { 'api-key': env.VECTOR_API_KEY } : {}, body: body && JSON.stringify(body), timeout: 30_000 }, `Qdrant ${method} ${path}`)

/** Nhúng một lô văn bản; TEI tự cắt phần vượt giới hạn token của mô hình. */
export async function embed(texts, prefix = '', timeout = 120_000) {
  const out = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    // Lô đầu khi mô hình vừa nạp có thể chậm trên CPU yếu: cho 2 phút.
    out.push(...await call(`${env.EMBED_URL}/embed`, { method: 'POST', headers: env.EMBED_API_KEY ? { authorization: `Bearer ${env.EMBED_API_KEY}` } : {}, body: JSON.stringify({ inputs: texts.slice(i, i + EMBED_BATCH).map((t) => `${prefix}${t}`), truncate: true, normalize: true }), timeout }, 'Dịch vụ nhúng'))
  }
  return out
}

/** Qdrant chỉ nhận id là số hoặc UUID: suy UUID cố định từ id tài liệu, nạp lại thì ghi đè đúng điểm cũ. */
export function pointId(id) {
  const h = createHash('sha256').update(id).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

let ready = false
/** Lần ghi đầu của mỗi lần khởi động thì dựng lại kho từ đầu, vì search.js khi khởi động luôn nạp lại toàn bộ tài liệu (như Meilisearch).
 *  Nhờ vậy véc-tơ luôn do mô hình hiện tại tạo (đổi mô hình, kể cả cùng số chiều, không trộn véc-tơ cũ) và điểm của tài liệu đã xóa cũng mất.
 *  Chỉ gọi sau khi đã nhúng được lô đầu: dịch vụ nhúng chết lúc khởi động thì kho cũ vẫn giữ nguyên để tìm. */
async function ensureCollection(size) {
  if (ready) return
  await qdrant('DELETE', `/collections/${COLLECTION}`).catch((e) => { if (e.status !== 404) throw e })
  await qdrant('PUT', `/collections/${COLLECTION}`, { vectors: { size, distance: 'Cosine' }, on_disk_payload: true }).catch((e) => { if (e.status !== 409) throw e }) // nội dung đoạn để trên đĩa, RAM chỉ giữ véc-tơ
  ready = true
}

/** Văn bản đem nhúng của một tài liệu: giống mẫu bên Meilisearch (tiêu đề, tên tệp, nội dung). */
export const docText = (d) => `${d.title} ${d.name ?? ''}\n${d.text}`

/** Nhúng và ghi các tài liệu (cùng dạng gửi Meilisearch) vào Qdrant; chờ ghi xong mới trả về. */
export async function upsert(docs) {
  if (!docs.length) return
  const vectors = await embed(docs.map(docText), env.EMBED_DOC_PREFIX)
  const put = async () => {
    await ensureCollection(vectors[0].length)
    await qdrant('PUT', `/collections/${COLLECTION}/points?wait=true`, { points: docs.map((d, i) => ({ id: pointId(d.id), vector: vectors[i], payload: d })) })
  }
  await put().catch((err) => { if (err.status !== 404) throw err; ready = false; return put() }) // kho bị xóa (mất volume): tạo lại rồi ghi
}

let pausedUntil = 0 // dịch vụ nhúng vừa lỗi hoặc chưa có kho: tạm không gọi, khỏi bắt mọi câu hỏi chờ hết hạn (tra DNS tên đã chết mất ~5 s và chiếm luồng của cả Meilisearch)
const recent = new Map() // câu hỏi -> véc-tơ: quét trang sau (lọc quyền) khỏi nhúng lại cùng câu hỏi
async function queryVector(q) {
  if (recent.has(q)) return recent.get(q)
  let vector
  try { [vector] = await embed([q], env.EMBED_QUERY_PREFIX, 3000) } catch (err) { pausedUntil = Date.now() + 30_000; throw err } // một câu hỏi nhúng trong vài chục ms; quá 3 s là có sự cố
  recent.set(q, vector)
  if (recent.size > 200) recent.delete(recent.keys().next().value)
  return vector
}

/** Một trang láng giềng gần nhất của câu hỏi, cùng dạng hit như Meilisearch (không có _formatted), kèm _score (cosine). */
export async function vectorPage(q, offset, limit) {
  if (Date.now() < pausedUntil) throw Object.assign(new Error('tìm ngữ nghĩa đang tạm ngừng sau lỗi'), { paused: true })
  const query = await queryVector(q)
  const res = await qdrant('POST', `/collections/${COLLECTION}/points/query`, { query, limit, offset, with_payload: true }).catch((err) => {
    if (err.status !== 404) throw err
    pausedUntil = Date.now() + 30_000 // chưa có kho thì khỏi hỏi Qdrant ở mọi câu
    if (!ready) err.status = undefined // kho chưa từng dựng trong lần chạy này (dịch vụ nhúng chưa sẵn sàng): tài liệu vẫn nằm trong hàng chờ, không cần nạp lại
    ready = false // kho đã dựng mà mất (xóa volume): lần ghi sau dựng lại
    throw err
  })
  return res.result.points.map((p) => ({ ...p.payload, _score: p.score }))
}

/** Trộn kết quả từ khóa (Meilisearch, _rankingScore) và ngữ nghĩa (Qdrant, _score) như Meilisearch tìm lai: mỗi tệp lấy điểm cao hơn của hai bên
 *  (đã nhân trọng số, ratio là phần ngữ nghĩa); mỗi tệp (parent) một kết quả. Đã đo: hơn hẳn trộn theo thứ hạng (RRF) và cộng điểm chuẩn hóa. */
export function fuse(keyword, vector, ratio = 0.5) {
  const score = new Map()
  const best = new Map()
  for (const [list, weight, field] of [[keyword, 1 - ratio, '_rankingScore'], [vector, ratio, '_score']]) {
    for (const h of list) {
      const key = h.parent ?? h.id
      score.set(key, Math.max(score.get(key) ?? 0, weight * (h[field] ?? 0)))
      if (!best.has(key) || (!best.get(key)._formatted && h._formatted)) best.set(key, h) // ưu tiên đoạn trích có đánh dấu từ khớp
    }
  }
  return [...score.keys()].sort((a, b) => score.get(b) - score.get(a)).map((k) => best.get(k))
}
