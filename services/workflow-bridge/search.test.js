// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { submissionText } from './search.js'

const sub = {
  no: 7, submitter_name: 'An Nguyễn', app: { name: 'Đề nghị thanh toán' },
  data: { so_tien: 5000000, ghi_chu: 'mua máy in', trong: '' },
  version: { spec: { fields: [{ key: 'so_tien', label: 'Số tiền' }, { key: 'ghi_chu', label: 'Ghi chú' }, { key: 'trong', label: 'Để trống' }, { key: 'khong_co', label: 'Không có' }] } },
  events: [{ note: 'Thiếu chứng từ', actor_name: 'Chi Lê' }, { note: null, actor_name: 'Chi Lê' }],
}

test('văn bản tìm kiếm gồm tên quy trình, người gửi, các ô đã điền kèm nhãn và ghi chú duyệt', () => {
  const t = submissionText(sub)
  for (const part of ['Đề nghị thanh toán số 7', 'Người gửi: An Nguyễn', 'Số tiền: 5000000', 'Ghi chú: mua máy in', 'Chi Lê: Thiếu chứng từ']) assert.ok(t.includes(part), part)
})

test('bỏ qua ô trống, ô không có dữ liệu và sự kiện không có ghi chú', () => {
  const t = submissionText(sub)
  assert.ok(!t.includes('Để trống') && !t.includes('Không có'))
  assert.equal(t.split('Chi Lê').length - 1, 1)
})

test('extractMime: PDF và ảnh theo content-type hoặc đuôi tên; tệp khác thì không', async () => {
  const { extractMime } = await import('./search.js')
  assert.equal(extractMime({ content_type: 'application/pdf', name: 'a' }), 'application/pdf')
  assert.equal(extractMime({ content_type: 'application/octet-stream', name: 'Scan.PDF' }), 'application/pdf')
  assert.equal(extractMime({ content_type: null, name: 'anh.JPG' }), 'image/jpeg')
  assert.equal(extractMime({ content_type: 'image/png; charset=x', name: 'x' }), 'image/png')
  assert.equal(extractMime({ content_type: 'text/plain', name: 'a.txt' }), null)
  assert.equal(extractMime({ name: 'noext' }), null)
})

test('searchBody: chỉ tìm từ khóa khi chưa cấu hình mô hình nhúng; có thì tìm lai và kẹp tỉ lệ vào 0..1', async () => {
  const { searchBody } = await import('./search.js')
  assert.equal(searchBody('abc', '', undefined).hybrid, undefined)
  assert.deepEqual(searchBody('abc', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', undefined).hybrid, { embedder: 'default', semanticRatio: 0.5 })
  assert.equal(searchBody('abc', 'm', '7').hybrid.semanticRatio, 1)
  assert.equal(searchBody('abc', 'm', '0').hybrid.semanticRatio, 0.5, '0 không hợp lệ thì dùng mặc định (0 nghĩa là bỏ ngữ nghĩa nên dùng cách để trống)')
})

test('chunks: cắt văn bản dài thành đoạn ≤ cỡ cho trước, chồng nhau, không cắt đôi từ, không mất chữ nào', async () => {
  const { chunks } = await import('./search.js')
  assert.deepEqual(chunks('ngắn thôi'), ['ngắn thôi'])
  assert.deepEqual(chunks(''), [])
  const words = Array.from({ length: 400 }, (_, i) => `từ${i}`)
  const parts = chunks(words.join(' '), 100, 20)
  assert.ok(parts.length > 1)
  for (const p of parts) assert.ok(p.length <= 100, `đoạn dài ${p.length}`)
  for (const p of parts) for (const w of p.split(' ')) assert.ok(words.includes(w), `từ bị cắt đôi: ${w}`)
  assert.deepEqual([...new Set(parts.flatMap((p) => p.split(' ')))].length, words.length, 'mọi từ đều nằm trong ít nhất một đoạn')
  for (let i = 1; i < parts.length; i++) assert.ok(parts[i - 1].endsWith(parts[i].split(' ')[0]) || parts[i - 1].split(' ').includes(parts[i].split(' ')[0]), 'đoạn sau bắt đầu bằng phần cuối của đoạn trước')
  assert.ok(chunks('x'.repeat(250), 100, 20).every((p) => p.length <= 100), 'chuỗi không có khoảng trắng vẫn bị cắt')
})

test('searchRequest: có mô hình thì tìm lai trên một chỉ mục, không thì chỉ từ khóa', async () => {
  const { searchRequest } = await import('./search.js')
  assert.equal(searchRequest('máy in', '', undefined, 0)[1].hybrid, undefined)
  const [path, body] = searchRequest('máy in', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', '0.5', 100)
  assert.equal(path, '/indexes/docs/search')
  assert.equal(body.q, 'máy in', 'câu hỏi gửi nguyên văn, không tiền tố')
  assert.equal(body.offset, 100)
  assert.equal(body.hybrid.semanticRatio, 0.5)
})

test('đầu vào lớn: tệp 100.000 ký tự (cả loại không có khoảng trắng) chia đủ đoạn, không mất chữ, mỗi đoạn vừa giới hạn byte của mẫu nhúng', async () => {
  const { chunks } = await import('./search.js')
  const words = Array.from({ length: 20_000 }, (_, i) => `ệ${i}`) // chữ có dấu 3 byte: trường hợp tốn byte nhất
  const big = words.join(' ').slice(0, 100_000)
  const t0 = performance.now()
  const parts = chunks(big)
  assert.ok(performance.now() - t0 < 500, 'chia đoạn tệp lớn phải nhanh')
  assert.ok(parts.length >= 220 && parts.length <= 300, `số đoạn ${parts.length}`)
  assert.ok(parts.at(-1).endsWith(big.trim().split(' ').at(-1)), 'đoạn cuối chứa chữ cuối cùng của tệp')
  const title = 'Đề nghị thanh toán số 1234 tệp-đính-kèm-rất-dài-tên.pdf\n'
  for (const p of parts) assert.ok(Buffer.byteLength(`${title}${p}`) <= 2000, 'vượt documentTemplateMaxBytes: phần cuối đoạn sẽ không được nhúng')
  const junk = chunks('A'.repeat(100_000)) // OCR rác hoặc base64: không có khoảng trắng
  assert.equal(junk.join('').length, 100_000)
  assert.ok(junk.every((p) => p.length <= 450))
})

test('đầu vào lớn: nạp theo lô, lỗi giữa chừng thì lần sau chỉ gửi phần còn thiếu và không đánh dấu tệp là đã xong', async (t) => {
  const big = Array.from({ length: 12_000 }, (_, i) => `từ${i}`).join(' ') // ~250 đoạn, hơn một lô
  const posted = []
  let failOnce = true
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const u = new URL(url)
    const reply = (body) => new Response(JSON.stringify(body))
    if (u.host === 'hasura') return reply({ data: { submission: [{ ...sub, id: 's9', attachments: [{ id: 'big', name: 'lon.txt', size: big.length, content_type: 'text/plain', object_key: 'k' }] }] } })
    if (u.host === 's3' || u.host.startsWith('seaweedfs')) return new Response(big) // s3.js đọc S3_URL lúc nạp mô-đun đầu tiên
    if (opts.method === 'POST' && u.pathname.endsWith('/documents')) { const docs = JSON.parse(opts.body); posted.push(docs.length); return reply({ taskUid: posted.length }) }
    if (u.pathname.startsWith('/tasks/')) {
      if (u.pathname === '/tasks/2' && failOnce) { failOnce = false; return reply({ status: 'failed', error: { message: 'giả lập lỗi' } }) }
      return reply({ status: 'succeeded' })
    }
    if (opts.method === 'GET' && u.pathname.endsWith('/documents')) return reply({ results: [] })
    return reply({})
  })
  Object.assign(process.env, { MEILI_URL: 'http://meili', HASURA_URL: 'http://hasura', S3_URL: 'http://s3' })
  const { syncIndex } = await import('./search.js?batch=1')
  await assert.rejects(syncIndex(), /giả lập lỗi/)
  const first = posted.reduce((a, b) => a + b, 0)
  assert.equal(posted[0], 200, 'gửi theo lô 200')
  const sent = await syncIndex()
  assert.ok(sent > 0 && sent < first, `lần sau chỉ gửi phần thiếu (${sent} < ${first})`)
  assert.equal(await syncIndex(), 0, 'xong hết thì không gửi gì nữa')
  for (const k of ['MEILI_URL', 'HASURA_URL', 'S3_URL']) delete process.env[k]
})

test('ký tự đặc biệt: không cắt đôi emoji (cặp UTF-16) ở ranh giới đoạn', async () => {
  const { chunks } = await import('./search.js')
  for (const text of ['😀'.repeat(1000), `x${'𝔸'.repeat(1000)}`, `${'a'.repeat(449)}😀${'b'.repeat(500)}`]) {
    const parts = chunks(text)
    for (const p of parts) assert.ok(p.isWellFormed(), 'đoạn chứa nửa ký tự')
    assert.equal(parts.join(''), text)
  }
})

test('ký tự đặc biệt: văn bản đầu vào đã có nửa ký tự (cắt ở giới hạn độ dài) vẫn ra đoạn hợp lệ', async () => {
  const { chunks } = await import('./search.js')
  const parts = chunks(`abc ${'😀'.repeat(10)}`.slice(0, 9)) // cắt giữa emoji như slice(0, MAX_TEXT)
  assert.ok(parts.every((p) => p.isWellFormed()))
})

test('mẫu nhúng: mọi tài liệu gửi đi (hồ sơ và đoạn tệp) có đủ mọi trường mà documentTemplate dùng', async (t) => {
  // Thiếu một trường là Meilisearch (Liquid) từ chối CẢ LÔ: "missing field in document ... Unknown index".
  let template
  const docs = []
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const u = new URL(url)
    const reply = (body) => new Response(JSON.stringify(body))
    if (u.host === 'hasura') return reply({ data: { submission: [{ ...sub, id: 's1', attachments: [{ id: 'f', name: 'a.txt', size: 5, content_type: 'text/plain', object_key: 'k' }] }] } })
    if (u.host === 's3' || u.host.startsWith('seaweedfs')) return new Response('chữ trong tệp')
    if (opts.method === 'PATCH' && u.pathname.endsWith('/settings')) template ??= JSON.parse(opts.body).embedders?.default?.documentTemplate
    if (opts.method === 'POST' && u.pathname.endsWith('/documents')) { docs.push(...JSON.parse(opts.body)); return reply({ taskUid: 1 }) }
    if (u.pathname.startsWith('/tasks/')) return reply({ status: 'succeeded' })
    if (opts.method === 'GET' && u.pathname.endsWith('/documents')) return reply({ results: [] })
    return reply({})
  })
  Object.assign(process.env, { MEILI_URL: 'http://meili', HASURA_URL: 'http://hasura', SEARCH_EMBEDDER: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2' })
  const { syncIndex } = await import('./search.js?template=1')
  await syncIndex()
  for (const k of ['MEILI_URL', 'HASURA_URL', 'SEARCH_EMBEDDER']) delete process.env[k]
  const fields = [...template.matchAll(/doc\.(\w+)/g)].map((m) => m[1])
  assert.ok(fields.length >= 3, template)
  assert.deepEqual(new Set(docs.map((d) => d.kind)), new Set(['submission', 'file']))
  for (const d of docs) for (const f of fields) assert.ok(f in d, `${d.id} thiếu trường ${f}`)
})
