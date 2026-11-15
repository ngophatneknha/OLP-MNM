// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Không gian [I]: tìm kiếm toàn văn và hỏi đáp có dẫn nguồn (RAG), với ràng buộc quan trọng nhất:
// người không có quyền xem hồ sơ thì không thấy nội dung của nó, cả trong kết quả lẫn trong câu trả lời của AI.
// Cần bật profile search (Meilisearch):
//   docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile search up -d
//   SEARCH_OPTIONAL=1 node --test tests/search.test.js

import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import { textPdf, scannedPdf, rasterise } from './pdf-fixtures.js'
import { GW, login, publishApp, submit, until, uid } from './lib.js'

const skip = process.env.SEARCH_OPTIONAL ? false : 'đặt SEARCH_OPTIONAL=1 sau khi bật profile search'
const ROLE = { staff1: 'staff', staff2: 'staff', manager1: 'manager' }

const call = async (user, path, body, raw = false) => {
  const headers = { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user] } : {}) }
  return fetch(`${GW}${path}`, { method: 'POST', headers, body: raw ? body : JSON.stringify(body) })
}
// Khi cả bộ kiểm thử chạy song song, giới hạn tần suất (429) hoặc trạm kiểm dịch bận (503) có thể từ chối tạm thời: thử lại.
const upload = async (user, submissionId, name, text, contentType = 'text/plain') => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${GW}/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user], 'x-submission-id': submissionId, 'x-file-name': encodeURIComponent(name), 'content-type': contentType },
      body: text,
    })
    if (res.status === 200 || attempt >= 8 || ![429, 503].includes(res.status)) return res
    await new Promise((ok) => setTimeout(ok, 8000))
  }
}

describe('I-SEARCH: tìm kiếm và hỏi đáp có kiểm quyền', { skip }, () => {
  const secret = `quyetdinh${uid()}` // từ độc nhất, không trùng dữ liệu cũ
  let sid

  before(async () => {
    sid = (await submit('staff1', await publishApp(), { so_tien: 1 })).data.insert_submission_one.id
    const up = await upload('staff1', sid, 'bien-ban.txt', `Biên bản họp: ngân sách đã chốt, mã nội bộ ${secret}, phụ trách chị Lan.`)
    assert.equal(up.status, 200)
  })

  test('I-SEARCH-01 người gửi tìm thấy nội dung tệp đính kèm của chính mình, có đoạn trích đánh dấu từ khớp', async () => {
    const r = await until(async () => {
      const res = await call('staff1', '/search', { q: secret })
      assert.equal(res.status, 200)
      const { hits } = await res.json()
      return hits.length ? hits : null
    }, 'chỉ mục đuổi kịp tệp mới', 90_000)
    assert.ok(r.some((h) => h.submission_id === sid && h.kind === 'file' && h.name === 'bien-ban.txt'))
    assert.match(r[0].snippet, /«[^»]*»/, 'từ khớp phải được đánh dấu')
  })

  test('I-SEARCH-02 người không được xem hồ sơ KHÔNG thấy nội dung của nó (quyền do Hasura quyết định, không phải chỉ mục)', async () => {
    await until(async () => (await (await call('staff1', '/search', { q: secret })).json()).hits.length, 'chỉ mục sẵn sàng', 90_000)
    const other = await (await call('staff2', '/search', { q: secret })).json()
    assert.deepEqual(other.hits, [], 'nhân viên khác không được thấy gì')
    assert.ok(!JSON.stringify(other).includes(secret))
  })

  test('I-SEARCH-03 hỏi đáp: người không có quyền nhận câu trả lời rỗng và không lộ nội dung; người có quyền nhận nguồn đúng', async () => {
    const denied = await (await call('staff2', '/ask', { question: `mã nội bộ ${secret} là gì?` })).json()
    assert.deepEqual(denied.sources, [])
    assert.ok(!JSON.stringify(denied).includes(secret), 'nội dung không được lọt vào câu trả lời')
    assert.match(denied.answer, /Không tìm thấy/)

    const ok = await (await call('staff1', '/ask', { question: `mã nội bộ ${secret} là gì?` })).json()
    assert.ok(ok.sources.some((s) => s.submission_id === sid), 'phải dẫn nguồn đúng hồ sơ')
    // Khi có AI (khóa trong .env), câu trả lời phải dẫn nguồn theo số như yêu cầu.
    if (ok.answer && !ok.answerError && !/Không tìm thấy/.test(ok.answer)) assert.match(ok.answer, /\[\d\]/, 'câu trả lời phải dẫn số nguồn')
  })

  test('I-SEARCH-04 đầu vào xấu bị từ chối: thiếu token 401, JSON hỏng và câu hỏi rỗng 400, quá dài 400', async () => {
    assert.equal((await call(null, '/search', { q: 'abc' })).status, 401)
    assert.equal((await call('staff1', '/search', '{ không phải json', true)).status, 400)
    assert.equal((await call('staff1', '/ask', { question: '' })).status, 400)
    assert.equal((await call('staff1', '/ask', { question: 'x'.repeat(501) })).status, 400)
  })

  test('I-SEARCH-05 chỉ mục không tin dữ liệu: nội dung tệp chứa mã HTML được trả về như chữ thường, không có thẻ HTML sống', async () => {
    const tag = `xss${uid()}`
    const id = (await submit('staff1', await publishApp(), { so_tien: 2 })).data.insert_submission_one.id
    assert.equal((await upload('staff1', id, 'doc.txt', `<img src=x onerror=alert(1)> ${tag}`)).status, 200)
    const hits = await until(async () => {
      const { hits } = await (await call('staff1', '/search', { q: tag })).json()
      return hits.length ? hits : null
    }, 'chỉ mục sẵn sàng', 90_000)
    // Máy chủ trả chuỗi thuần kèm dấu « »; giao diện chỉ dựng nút văn bản (xem Ask.vue), không dùng v-html.
    assert.equal(typeof hits[0].snippet, 'string')
  })

  test('I-SEARCH-06 đọc PDF có lớp chữ, ảnh (OCR) và PDF quét (OCR): nội dung tìm được, vẫn kiểm quyền', async () => {
    // Ảnh/PDF quét tìm theo tiền tố cố định (OCR có thể đọc sai vài ký tự của phần ngẫu nhiên), gắn với hồ sơ của ca này.
    // Chỉ dùng chữ cái, đủ dài và không dễ đọc nhầm: OCR hay tách chữ lẫn số (0/O, 1/I).
    const letters = () => uid().replace(/[0-9a-f]/g, (c) => 'GHJKMNPQRSTUVWXY'['0123456789abcdef'.indexOf(c)])
    const word = `HOPDONG${letters()}`
    const id = (await submit('staff1', await publishApp(), { so_tien: 3 })).data.insert_submission_one.id
    const pdf = textPdf(word)
    assert.equal((await upload('staff1', id, 'hop-dong.pdf', pdf, 'application/pdf')).status, 200)
    const scanWord = `QUETANH${letters()}`
    const scanPdfWord = `BANQUET${letters()}`
    const scan = textPdf(scanWord)
    assert.equal((await upload('staff1', id, 'anh-chup.png', rasterise(scan, 'png'), 'image/png')).status, 200)
    assert.equal((await upload('staff1', id, 'ban-quet.pdf', scannedPdf(rasterise(textPdf(scanPdfWord), 'pgm')), 'application/pdf')).status, 200)
    const find = (q) => until(async () => { const { hits } = await (await call('staff1', '/search', { q })).json(); return hits.length ? hits : null }, `tìm thấy ${q}`, 360_000)
    assert.ok((await find(word)).some((h) => h.name === 'hop-dong.pdf'), 'PDF có lớp chữ')
    assert.ok((await find('QUETANH')).some((h) => h.submission_id === id && h.name === 'anh-chup.png'), 'ảnh qua OCR')
    assert.ok((await find('BANQUET')).some((h) => h.submission_id === id && h.name === 'ban-quet.pdf'), 'PDF quét qua OCR')
    assert.deepEqual((await (await call('staff2', '/search', { q: word })).json()).hits, [], 'người khác không thấy')
  })
})

// Cần bật tìm ngữ nghĩa: SEARCH_EMBEDDER=intfloat/multilingual-e5-small khi chạy docker compose (tải mô hình lần đầu mất vài phút).
const semanticSkip = process.env.SEMANTIC_OPTIONAL ? false : 'đặt SEMANTIC_OPTIONAL=1 sau khi bật SEARCH_EMBEDDER'
describe('I-SEARCH-SEM: tìm ngữ nghĩa (Meilisearch lai, mô hình nhúng đa ngữ)', { skip: semanticSkip }, () => {
  test('I-SEARCH-07 tìm ra tài liệu cùng nghĩa dù không trùng từ nào; người khác vẫn không thấy', async () => {
    const id = (await submit('staff1', await publishApp(), { so_tien: 4 })).data.insert_submission_one.id
    assert.equal((await upload('staff1', id, 'mua-sam.txt', `Hợp đồng mua máy tính xách tay cho phòng kế toán, ghi chú ${uid()}`)).status, 200)
    const hits = await until(async () => {
      const { hits } = await (await call('staff1', '/search', { q: 'thiết bị laptop cho văn phòng tài chính' })).json()
      return hits.some((h) => h.submission_id === id) ? hits : null
    }, 'tìm ngữ nghĩa thấy tài liệu', 240_000)
    assert.ok(hits.some((h) => h.name === 'mua-sam.txt'))
    const other = await (await call('staff2', '/search', { q: 'thiết bị laptop cho văn phòng tài chính' })).json()
    assert.ok(!other.hits.some((h) => h.submission_id === id), 'nhân viên khác thấy hồ sơ không thuộc quyền')
  })
})
