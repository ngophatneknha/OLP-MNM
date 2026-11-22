// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuse, pointId, embed, upsert, vectorPage } from './vector.js'

test('fuse: lấy điểm cao hơn của hai bên, mỗi tệp một kết quả, giữ đoạn trích có đánh dấu', () => {
  const kw = [{ id: 'a-0', parent: 'a', _rankingScore: 0.95, _formatted: { text: '«a»' } }, { id: 'b-0', parent: 'b', _rankingScore: 0.4 }]
  const vec = [{ id: 'c-0', parent: 'c', _score: 0.88 }, { id: 'b-2', parent: 'b', _score: 0.86 }, { id: 'b-3', parent: 'b', _score: 0.85 }, { id: 'a-1', parent: 'a', _score: 0.7 }]
  const out = fuse(kw, vec)
  assert.deepEqual(out.map((h) => h.parent), ['a', 'c', 'b'], 'khớp từ khóa gần tuyệt đối thắng láng giềng ngữ nghĩa')
  assert.equal(out[0]._formatted.text, '«a»')
  assert.equal(fuse(kw, vec, 1)[0].parent, 'c', 'ratio 1: chỉ theo ngữ nghĩa')
  assert.deepEqual(fuse(kw, []).map((h) => h.parent), ['a', 'b'], 'không có ngữ nghĩa: giữ thứ tự từ khóa')
})

test('pointId: UUID cố định theo id, khác id thì khác điểm', () => {
  assert.match(pointId('att-1-0'), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(pointId('att-1-0'), pointId('att-1-0'))
  assert.notEqual(pointId('att-1-0'), pointId('att-1-1'))
})

test('embed: chia lô 32 và gắn tiền tố cấu hình', async (t) => {
  process.env.EMBED_URL = 'http://embed'
  const sizes = []
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    const { inputs } = JSON.parse(opts.body)
    sizes.push(inputs.length)
    assert.ok(inputs.every((s) => s.startsWith('tien-to: ')))
    return new Response(JSON.stringify(inputs.map(() => [1, 0])))
  })
  const out = await embed(Array.from({ length: 70 }, (_, i) => `đoạn ${i}`), 'tien-to: ')
  assert.equal(out.length, 70)
  assert.deepEqual(sizes, [32, 32, 6])
  delete process.env.EMBED_URL
})

test('upsert: lần ghi đầu sau khởi động dựng lại kho (véc-tơ cũ của mô hình khác không sót lại), dịch vụ nhúng chết thì giữ kho cũ', async (t) => {
  Object.assign(process.env, { EMBED_URL: 'http://embed', VECTOR_URL: 'http://qdrant' })
  const calls = []
  let embedUp = false
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    const u = new URL(String(url))
    if (u.pathname === '/embed') return embedUp ? new Response(JSON.stringify(JSON.parse(opts.body).inputs.map(() => [1, 0]))) : new Response('down', { status: 503 })
    calls.push(`${opts.method} ${u.pathname}`)
    return new Response(JSON.stringify({ result: true }))
  })
  const doc = (id) => ({ id, parent: id, title: 't', name: null, text: 'x' })
  await assert.rejects(upsert([doc('a')]))
  assert.deepEqual(calls, [], 'chưa nhúng được thì không đụng tới kho cũ')
  embedUp = true
  await upsert([doc('a')])
  await upsert([doc('b')])
  assert.deepEqual(calls, ['DELETE /collections/docs', 'PUT /collections/docs', 'PUT /collections/docs/points', 'PUT /collections/docs/points'])
  delete process.env.EMBED_URL
  delete process.env.VECTOR_URL
})

test('vectorPage: kho mất sau khi đã dựng thì báo 404 (để nạp lại từ đầu); kho chưa từng dựng thì không; cả hai đều tạm ngừng 30 s', async (t) => {
  Object.assign(process.env, { EMBED_URL: 'http://embed', VECTOR_URL: 'http://qdrant' }) // chạy sau bài upsert: kho đã dựng trong lần chạy này
  let qdrantCalls = 0
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    if (new URL(String(url)).pathname === '/embed') return new Response(JSON.stringify(JSON.parse(opts.body).inputs.map(() => [1, 0])))
    qdrantCalls++
    return new Response('{"status":{"error":"Not found: Collection `docs` doesn\'t exist!"}}', { status: 404 })
  })
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  await assert.rejects(vectorPage('a', 0, 10), (e) => e.status === 404)
  await assert.rejects(vectorPage('b', 0, 10), (e) => e.paused)
  assert.equal(qdrantCalls, 1, 'đang tạm ngừng thì không gọi Qdrant')
  now += 31_000
  await assert.rejects(vectorPage('c', 0, 10), (e) => e.status === undefined && !e.paused)
  delete process.env.EMBED_URL
  delete process.env.VECTOR_URL
})
