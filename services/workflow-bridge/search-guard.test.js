// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Hàng rào kiến trúc và bảo mật của tìm kiếm (AI-02, AI-04), chạy không cần Docker:
// Meilisearch và Hasura được giả lập bằng cách thay fetch.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('kiến trúc: workflow-bridge không dùng gói npm nào, chỉ thư viện chuẩn Node và tệp của chính nó', () => {
  assert.ok(!existsSync(new URL('./package.json', import.meta.url)) || !/"dependencies"/.test(read('./package.json')))
  for (const file of readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.js'))) {
    for (const [, from] of read(`./${file}`).matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
      assert.ok(from.startsWith('node:') || from.startsWith('./'), `${file} nhập "${from}"`)
    }
  }
})

test('kiến trúc: Meilisearch là bản Community ghim phiên bản, không công bố cổng ra ngoài, nằm trong profile search', () => {
  const block = read('../../docker-compose.optional.yml').split(/\n(?=  [a-z-]+:\n)/).find((b) => b.startsWith('  meilisearch:'))
  assert.match(block, /image: getmeili\/meilisearch:v\d+\.\d+\.\d+/, 'image chính thức, ghim phiên bản')
  assert.doesNotMatch(block.match(/image: (\S+)/)[1], /enterprise/, 'image enterprise là BUSL, không phải OSI')
  assert.doesNotMatch(block, /\n\s+ports:/, 'chỉ workflow-bridge được gọi Meilisearch')
  assert.match(block, /profiles: \["search"\]/, 'bản lõi chạy được khi không bật tìm kiếm')
})

/** Giả lập: Meilisearch trả về đoạn của hai hồ sơ s1, s2 (kể cả hai đoạn cùng một tệp); người hỏi chỉ được xem s1. */
function fakeBackends(t, { searchError, vectorError } = {}) {
  const calls = { search: [], hasura: [], embed: [], vector: [] }
  const hits = [
    { id: 'att-f2-0', parent: 'att-f2', submission_id: 's2', kind: 'file', title: 'Hồ sơ người khác', name: 'luong.txt', text: 'bảng lương bí mật' },
    { id: 'att-f1-3', parent: 'att-f1', submission_id: 's1', kind: 'file', title: 'Hồ sơ của tôi', name: 'a.txt', text: 'bảng lương phòng tôi' },
    { id: 'att-f1-4', parent: 'att-f1', submission_id: 's1', kind: 'file', title: 'Hồ sơ của tôi', name: 'a.txt', text: 'đoạn khác cùng tệp' },
  ]
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status })
    if (String(url).endsWith('/v1/graphql')) {
      calls.hasura.push({ headers: opts.headers, body: JSON.parse(opts.body) })
      return reply({ data: { submission: [{ id: 's1' }] } })
    }
    const path = new URL(url).pathname
    if (path === '/embed') {
      calls.embed.push(JSON.parse(opts.body))
      if (vectorError) return reply({ error: 'model not loaded' }, 503)
      return reply(JSON.parse(opts.body).inputs.map(() => [0.6, 0.8]))
    }
    if (path === '/collections/docs/points/query') {
      calls.vector.push(JSON.parse(opts.body))
      return reply({ result: { points: JSON.parse(opts.body).offset ? [] : [...hits].reverse().map((payload) => ({ id: 'x', score: 0.9, payload })) } })
    }
    if (path.endsWith('/search') || path === '/multi-search') {
      const body = JSON.parse(opts.body)
      calls.search.push(body)
      if (searchError && (body.hybrid || body.queries)) return reply({ message: 'Cannot find embedder with name `default`.', code: 'invalid_search_embedder' }, 400)
      return reply({ hits: body.offset ? [] : hits })
    }
    return reply({ taskUid: 1, status: 'succeeded', results: [] })
  })
  return calls
}

let n = 0
async function load(env) { // mỗi lần import mới đọc lại biến môi trường, như một lần khởi động bridge
  Object.assign(process.env, { MEILI_URL: 'http://meili', SEARCH_EMBEDDER: '', VECTOR_URL: '', EMBED_URL: '', ...env })
  const mod = await import(`./search.js?guard=${n++}`)
  for (const k of ['MEILI_URL', 'SEARCH_EMBEDDER', 'VECTOR_URL', 'EMBED_URL']) delete process.env[k]
  return mod
}
const asker = { headers: { authorization: 'Bearer token-cua-nguoi-hoi', 'x-hasura-role': 'staff' } }

for (const embedder of ['', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2']) {
  test(`bảo mật: chỉ trả về hồ sơ Hasura cho phép, kiểm bằng token người hỏi (mô hình: ${embedder || 'không'})`, async (t) => {
    const calls = fakeBackends(t)
    const { permittedHits } = await load({ SEARCH_EMBEDDER: embedder })
    const out = await permittedHits(asker, 'bảng lương', 10)
    assert.deepEqual(out.map((h) => h.submission_id), ['s1'], 'không lộ s2, và mỗi tệp chỉ một đoạn')
    assert.ok(!JSON.stringify(out).includes('bí mật'))
    const check = calls.hasura.at(-1)
    assert.equal(check.headers.authorization, 'Bearer token-cua-nguoi-hoi', 'kiểm quyền bằng token người hỏi')
    assert.equal(check.headers['x-hasura-admin-secret'], undefined, 'không dùng quyền admin để lọc')
    assert.deepEqual(check.body.variables.ids.sort(), ['s1', 's2'])
  })
}

test('bảo mật: hỏi đáp chỉ đưa nguồn được phép vào ngữ cảnh', async (t) => {
  fakeBackends(t)
  const { handleSearch } = await load({})
  const req = Object.assign((async function* () { yield JSON.stringify({ question: 'bảng lương thế nào' }) })(), { method: 'POST', url: '/ask', ...asker })
  let status, body
  const res = { writeHead: (s) => { status = s; return res }, end: (b) => { body = JSON.parse(b) } }
  await handleSearch(req, res)
  assert.equal(status, 200)
  assert.deepEqual(body.sources.map((s) => s.submission_id), ['s1'])
  assert.ok(!JSON.stringify(body).includes('bí mật'))
})

test('bền vững: mô hình nhúng chưa sẵn sàng thì lùi về tìm từ khóa, không báo lỗi; kiểm quyền vẫn chạy', async (t) => {
  const calls = fakeBackends(t, { searchError: true })
  const { permittedHits } = await load({ SEARCH_EMBEDDER: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2' })
  const out = await permittedHits(asker, 'bảng lương', 10)
  assert.deepEqual(out.map((h) => h.submission_id), ['s1'])
  assert.ok(calls.search.some((b) => !b.hybrid && !b.queries), 'đã thử lại bằng từ khóa')
})

const VEC = { VECTOR_URL: 'http://qdrant:6333', EMBED_URL: 'http://embed' }
async function loadVector(t, env) { // vector.js đọc địa chỉ lúc gọi, nên giữ biến môi trường suốt bài kiểm
  const mod = await load({ ...VEC, ...env })
  Object.assign(process.env, VEC)
  t.after(() => { for (const k of Object.keys(VEC)) delete process.env[k] })
  return mod
}

test('bảo mật: profile vector (Qdrant) cũng chỉ trả hồ sơ Hasura cho phép, và Meilisearch không tự nhúng nữa', async (t) => {
  const calls = fakeBackends(t)
  const { permittedHits } = await loadVector(t, { SEARCH_EMBEDDER: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', EMBED_QUERY_PREFIX: 'tien-to: ' })
  const out = await permittedHits(asker, 'bảng lương', 10)
  assert.deepEqual(out.map((h) => h.submission_id), ['s1'], 'không lộ s2, và mỗi tệp chỉ một đoạn')
  assert.ok(!JSON.stringify(out).includes('bí mật'))
  assert.ok(calls.vector.length, 'đã hỏi Qdrant')
  assert.deepEqual(calls.embed.at(-1).inputs, ['tien-to: bảng lương'], 'tiền tố (nếu mô hình cần) lấy từ cấu hình, không viết cứng trong mã')
  assert.ok(calls.search.every((b) => !b.hybrid && !b.queries), 'Meilisearch chỉ tìm từ khóa')
  assert.equal(calls.hasura.at(-1).headers.authorization, 'Bearer token-cua-nguoi-hoi')
  assert.equal(calls.hasura.at(-1).headers['x-hasura-admin-secret'], undefined)
})

test('bền vững: dịch vụ nhúng hoặc Qdrant lỗi thì vẫn tìm được bằng từ khóa, kiểm quyền vẫn chạy', async (t) => {
  fakeBackends(t, { vectorError: true })
  const { permittedHits } = await loadVector(t)
  const out = await permittedHits(asker, 'bảng lương', 10)
  assert.deepEqual(out.map((h) => h.submission_id), ['s1'])
})

test('kiến trúc: Qdrant và dịch vụ nhúng là image chính thức ghim phiên bản, không công bố cổng, nằm trong profile vector', () => {
  const blocks = read('../../docker-compose.optional.yml').split(/\n(?=  [a-z-]+:\n)/)
  for (const [name, image] of [['qdrant', /image: qdrant\/qdrant:v\d+\.\d+\.\d+/], ['embedder', /image: ghcr\.io\/huggingface\/text-embeddings-inference:cpu-\d+\.\d+/], ['embedder-model', /image: alpine:\d+\.\d+/]]) {
    const block = blocks.find((b) => b.startsWith(`  ${name}:`))
    assert.ok(block, `có dịch vụ ${name}`)
    assert.match(block, image)
    assert.doesNotMatch(block, /\n\s+ports:/, `${name}: chỉ workflow-bridge được gọi`)
    assert.match(block, /profiles: \["vector"\]/)
  }
  // Mô hình mặc định tải từ đúng một commit, mỗi tệp đều kiểm sha256: không ai đổi được mô hình chạy trong hệ thống bằng cách sửa kho trên Hugging Face.
  const model = blocks.find((b) => b.startsWith('  embedder-model:'))
  assert.match(model, /resolve\/[0-9a-f]{40}\n/)
  const files = model.match(/^\s+[0-9a-f]{64} \S+ \S+$/gm) ?? []
  assert.deepEqual(files.map((l) => l.trim().split(' ')[1]).sort(), ['1_Pooling/config.json', 'config.json', 'onnx/model.onnx', 'sentence_bert_config.json', 'tokenizer.json'])
  assert.match(model, /sha256sum -c/)
})

test('bền vững: dịch vụ nhúng chết lúc đồng bộ thì Meilisearch vẫn nạp đủ, Qdrant được nạp bù khi dịch vụ sống lại', async (t) => {
  const posted = []
  const upserted = []
  let embedUp = false
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status })
    const u = String(url)
    if (u.endsWith('/v1/graphql')) return reply({ data: { submission: Array.from({ length: 450 }, (_, i) => ({ id: `s${i}`, no: i, data: {}, submitter_name: 'A', app: { name: 'Hồ sơ' }, version: { spec: { fields: [] } }, events: [], attachments: [] })) } })
    const path = new URL(u).pathname
    if (path === '/embed') return embedUp ? reply(JSON.parse(opts.body).inputs.map(() => [1, 0])) : reply({ error: 'down' }, 503)
    if (path.endsWith('/documents')) { posted.push(...JSON.parse(opts.body)); return reply({ taskUid: 1 }) }
    if (path === '/collections/docs/points') { upserted.push(...JSON.parse(opts.body).points); return reply({ result: {} }) }
    return reply({ taskUid: 1, status: 'succeeded' })
  })
  const { syncIndex } = await loadVector(t)
  await syncIndex()
  assert.equal(posted.length, 450, 'từ khóa không bị chặn ở lô đầu')
  assert.equal(upserted.length, 0)
  embedUp = true
  assert.equal(await syncIndex(), 0, 'không nạp lại Meilisearch')
  assert.equal(upserted.length, 450, 'Qdrant được nạp bù đủ')
})

test('#115: tệp mới tải lên SeaweedFS được tự nhúng vào Qdrant ở lần đồng bộ kế tiếp, không cần thao tác tay', async (t) => {
  const upserted = []
  const attachments = []
  t.mock.method(globalThis, 'fetch', async (url, opts = {}) => {
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status })
    if (String(url).endsWith('/v1/graphql')) return reply({ data: { submission: [{ id: 's1', no: 1, data: {}, submitter_name: 'A', app: { name: 'Hồ sơ' }, version: { spec: { fields: [] } }, events: [], attachments }] } })
    const u = new URL(String(url))
    if (u.host === 'seaweedfs:8333') return new Response(u.pathname === '/dxlab/k-moi' ? 'Bảng lương quý ba của phòng kế toán' : '', { status: u.pathname === '/dxlab/k-moi' ? 200 : 404 })
    if (u.pathname === '/embed') return reply(JSON.parse(opts.body).inputs.map(() => [1, 0]))
    if (u.pathname === '/collections/docs/points') { upserted.push(...JSON.parse(opts.body).points); return reply({ result: {} }) }
    return reply({ taskUid: 1, status: 'succeeded' })
  })
  const { syncIndex } = await loadVector(t)
  await syncIndex()
  assert.deepEqual(upserted.map((p) => p.payload.kind), ['submission'])
  attachments.push({ id: 'f1', name: 'luong.txt', size: 40, content_type: 'text/plain', object_key: 'k-moi' }) // người dùng vừa tải tệp lên
  await syncIndex()
  const file = upserted.filter((p) => p.payload.kind === 'file')
  assert.equal(file.length, 1)
  assert.equal(file[0].payload.parent, 'att-f1')
  assert.match(file[0].payload.text, /Bảng lương quý ba/, 'nội dung đọc từ SeaweedFS')
  assert.equal(await syncIndex(), 0, 'đồng bộ lại không nhúng lại thứ không đổi')
})

test('bền vững: dịch vụ nhúng chết thì chỉ câu đầu phải chờ, các câu sau đi thẳng bằng từ khóa', async (t) => {
  const calls = fakeBackends(t, { vectorError: true })
  const later = Date.now() + 60_000 // vượt khoảng tạm ngừng do bài kiểm trước để lại (vector.js nạp một lần cho cả tệp)
  t.mock.method(Date, 'now', () => later)
  const { permittedHits } = await loadVector(t)
  await permittedHits(asker, 'lương tháng này', 10) // câu chưa hỏi lần nào (véc-tơ câu đã hỏi được nhớ lại)
  await permittedHits(asker, 'lương tháng sau', 10)
  assert.equal(calls.embed.length, 1, 'sau lỗi đầu không gọi lại dịch vụ nhúng')
})
