// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test web/src/maturity.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMaturity, maturityLevel, MIN_SUBMISSIONS } from './maturity.js'

const at = (h) => new Date(Date.UTC(2026, 0, 1, h)).toISOString()
const spec = { steps: [{ key: 'tp', name: 'Trưởng phòng', role: 'manager' }, { key: 'gd', name: 'Giám đốc', role: 'director' }] }
const app = { key: 'tam_ung', spec, versions: [{ version: 1 }, { version: 2 }], changes: [{ status: 'merged' }, { status: 'open' }] }
const sub = (over) => ({
  app: { key: 'tam_ung' }, version: { spec }, app_version: 2, data: {}, status: 'approved', created_at: at(0),
  events: [{ step_key: 'tp', action: 'approve', created_at: at(2) }, { step_key: 'gd', action: 'approve', created_at: at(4) }],
  opinions: [], ...over,
})
const many = (n, over) => Array.from({ length: n }, () => sub(over))

test('ít hồ sơ thì chưa đủ dữ liệu, không bịa điểm', () => {
  const r = computeMaturity({ submissions: many(MIN_SUBMISSIONS - 1), apps: [app], autonomy: [] })
  assert.deepEqual(r, { enough: false, have: MIN_SUBMISSIONS - 1, need: MIN_SUBMISSIONS })
})

test('H: chờ nhanh và đủ vai trò thì điểm tối đa; chờ quá 48 giờ thì mất điểm', () => {
  const fast = computeMaturity({ submissions: many(5), apps: [app], autonomy: [] })
  assert.equal(fast.spaces.H.score, 100)
  const slow = many(5, { events: [{ step_key: 'tp', action: 'approve', created_at: at(100) }, { step_key: 'gd', action: 'approve', created_at: at(102) }] })
  const r = computeMaturity({ submissions: slow, apps: [app], autonomy: [] })
  assert.equal(r.spaces.H.parts[0].value, 0.5) // bước đầu chờ 100 giờ, bước sau 2 giờ
  assert.equal(r.spaces.H.score, 75)
})

test('P: nhiều phiên bản, một nửa đề xuất đã xử lý, không hồ sơ đang chạy thì bỏ thành phần đó', () => {
  const r = computeMaturity({ submissions: many(5), apps: [app], autonomy: [] })
  assert.equal(r.spaces.P.parts.find((p) => p.key === 'current').value, null)
  assert.equal(r.spaces.P.score, 75) // (40*1 + 40*0.5) / 80
})

test('P: hồ sơ đang chạy phiên bản cũ kéo điểm xuống', () => {
  const running = many(5, { status: 'running', app_version: 1, events: [] })
  const r = computeMaturity({ submissions: running, apps: [app], autonomy: [] })
  assert.equal(r.spaces.P.parts.find((p) => p.key === 'current').value, 0)
})

test('D: nhật ký thiếu dấu ở một bước thì hồ sơ đó không tính là đầy đủ', () => {
  const broken = [...many(4), sub({ events: [{ step_key: 'tp', action: 'approve', created_at: at(2) }] })]
  const r = computeMaturity({ submissions: broken, apps: [app], autonomy: [] })
  assert.equal(r.spaces.D.parts.find((p) => p.key === 'complete').value, 0.8)
})

test('I: không có ý kiến AI và không nâng nấc thì 0; có thì tăng', () => {
  assert.equal(computeMaturity({ submissions: many(5), apps: [app], autonomy: [] }).spaces.I.score, 0)
  const r = computeMaturity({
    submissions: many(5, { opinions: [{ step_key: 'tp' }] }),
    apps: [app], autonomy: [{ app_key: 'tam_ung', step_key: 'tp', level: 3 }, { app_key: 'tam_ung', step_key: 'gd', level: 1 }],
  })
  assert.equal(r.spaces.I.score, 50) // 1/2 bước có ý kiến, 1/2 bước đã nâng nấc
})

test('điểm chung là trung bình các không gian có điểm; nhãn mức theo ngưỡng 40 và 70', () => {
  const r = computeMaturity({ submissions: many(5), apps: [app], autonomy: [] })
  const scores = Object.values(r.spaces).map((x) => x.score)
  assert.equal(r.overall, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length))
  assert.equal(maturityLevel(null), 'none')
  assert.equal(maturityLevel(39), 'start')
  assert.equal(maturityLevel(40), 'growing')
  assert.equal(maturityLevel(70), 'mature')
})
