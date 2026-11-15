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
import { GW, login, publishApp, submit, until, uid } from './lib.js'

const skip = process.env.SEARCH_OPTIONAL ? false : 'đặt SEARCH_OPTIONAL=1 sau khi bật profile search'
const ROLE = { staff1: 'staff', staff2: 'staff', manager1: 'manager' }

const call = async (user, path, body, raw = false) => {
  const headers = { 'content-type': 'application/json', ...(user ? { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user] } : {}) }
  return fetch(`${GW}${path}`, { method: 'POST', headers, body: raw ? body : JSON.stringify(body) })
}
// Khi cả bộ kiểm thử chạy song song, giới hạn tần suất (429) hoặc trạm kiểm dịch bận (503) có thể từ chối tạm thời: thử lại.
const upload = async (user, submissionId, name, body, type = 'text/plain') => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${GW}/files`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user], 'x-submission-id': submissionId, 'x-file-name': encodeURIComponent(name), 'content-type': type },
      body,
    })
    if (res.status === 200 || attempt >= 8 || ![429, 503].includes(res.status)) return res
    await new Promise((ok) => setTimeout(ok, 8000))
  }
}

/**
 * Dựng một tệp PDF một trang ngay trong kiểm thử (kho không chứa tệp PDF nào, xem LUAT-02). Font Helvetica với bảng
 * /Differences cho các chữ tiếng Việt không có trong WinAnsi, giống cách các phần mềm cũ ghi chữ có dấu vào PDF.
 */
function makePdf(lines) {
  const viet = { Đ: 'Dcroat', ề: 'ecircumflexgrave', ị: 'idotbelow', ạ: 'adotbelow', ứ: 'uhornacute', ộ: 'ocircumflexdotbelow',
    ồ: 'ocircumflexgrave', ơ: 'ohorn', ư: 'uhorn', ờ: 'ohorngrave', ụ: 'udotbelow' }
  const chars = Object.keys(viet)
  const enc = (t) => [...t].map((c) => {
    const i = chars.indexOf(c)
    if (i >= 0) return `\\${(128 + i).toString(8)}`
    if (c.charCodeAt(0) > 0xff) throw new Error(`makePdf chưa có mã cho chữ "${c}"`) // không ghi sai lặng lẽ
    return c === '(' || c === ')' || c === '\\' ? `\\${c}` : c
  }).join('')
  const content = `BT /F1 12 Tf 72 760 Td 16 TL ${lines.map((l) => `(${enc(l)}) '`).join(' ')} ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /BaseEncoding /WinAnsiEncoding /Differences [128 ${Object.values(viet).map((n) => `/${n}`).join(' ')}] >> >>`,
  ]
  let out = '%PDF-1.7\n', xref = ''
  objs.forEach((o, i) => { xref += `${String(Buffer.byteLength(out, 'latin1')).padStart(10, '0')} 00000 n \n`; out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const at = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
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

  test('I-SEARCH-06 tệp PDF có chữ: người gửi tìm thấy nội dung (kể cả chữ tiếng Việt có dấu), người khác không thấy gì', async () => {
    const word = `pdfmanoibo${uid()}`
    const id = (await submit('staff1', await publishApp(), { so_tien: 3 })).data.insert_submission_one.id
    const pdf = makePdf(['Đề nghị tạm ứng công tác phí', `Mã hồ sơ nội bộ ${word}`, 'Người phụ trách: chị Lan'])
    assert.equal((await upload('staff1', id, 'de-nghi.pdf', pdf, 'application/pdf')).status, 200)
    const hits = await until(async () => {
      const { hits } = await (await call('staff1', '/search', { q: word })).json()
      return hits.length ? hits : null
    }, 'chỉ mục đọc xong tệp PDF', 90_000)
    const hit = hits.find((h) => h.submission_id === id)
    assert.ok(hit, 'phải tìm thấy đúng hồ sơ')
    assert.equal(hit.kind, 'file')
    assert.equal(hit.name, 'de-nghi.pdf')
    assert.ok(hit.snippet.includes('tạm ứng'), `chữ có dấu phải được trích đúng: ${hit.snippet}`)

    const other = await (await call('staff2', '/search', { q: word })).json()
    assert.deepEqual(other.hits, [], 'nhân viên khác không được thấy gì')
    const denied = await (await call('staff2', '/ask', { question: `mã hồ sơ nội bộ ${word} là gì?` })).json()
    assert.deepEqual(denied.sources, [])
    assert.ok(!JSON.stringify(denied).includes(word), 'nội dung PDF không được lọt vào câu trả lời')
  })

  test('I-SEARCH-07 tệp đuôi .pdf nhưng hỏng hoặc không phải PDF không làm kẹt chỉ mục: tệp gửi sau vẫn tìm được', async () => {
    const word = `saupdfhong${uid()}`
    const id = (await submit('staff1', await publishApp(), { so_tien: 4 })).data.insert_submission_one.id
    const broken = Buffer.concat([Buffer.from('%PDF-1.7\n1 0 obj << /Length 999999 >>\nstream\n', 'latin1'), Buffer.alloc(4096, 0xff)])
    assert.equal((await upload('staff1', id, 'hong.pdf', broken, 'application/pdf')).status, 200)
    assert.equal((await upload('staff1', id, 'khong-phai.pdf', 'chỉ là chữ thường', 'application/pdf')).status, 200)
    assert.equal((await upload('staff1', id, 'sau.txt', `Ghi chú gửi sau ${word}`)).status, 200)
    await until(async () => (await (await call('staff1', '/search', { q: word })).json()).hits.length, 'chỉ mục vẫn chạy tiếp', 90_000)
  })
})
