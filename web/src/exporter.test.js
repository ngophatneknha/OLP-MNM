// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test web/src/exporter.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, toCsv, toJson, eventRows } from './exporter.js'
import { incompleteLogs } from './maturity.js'

const sub = (over = {}) => ({
  no: 7, status: 'approved', created_at: '2026-11-01T08:00:00Z', finished_at: '2026-11-01T10:00:00Z', data: { so_tien: 3000000 },
  app: { name: 'Xin tạm ứng' }, version: { spec: { steps: [{ key: 'tp', role: 'manager' }, { key: 'gd', role: 'director', when: { field: 'so_tien', op: '>', value: 5000000 } }] } },
  events: [{ step_key: 'tp', action: 'approve', actor_name: 'Lê, "An"', created_at: '2026-11-01T09:00:00Z', note: 'ok\nđồng ý' }], ...over,
})

test('csvCell bọc nháy kép khi có dấu phẩy, nháy kép hoặc xuống dòng', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('nói "có"'), '"nói ""có"""')
  assert.equal(csvCell('hai\ndòng'), '"hai\ndòng"')
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(5), '5')
})

test('csvCell chặn công thức bảng tính', () => {
  for (const bad of ['=HYPERLINK("http://x")', '+1', '-1', '@SUM(A1)']) assert.ok(csvCell(bad).replaceAll('"', '').startsWith("'"), bad)
})

test('toCsv: tiêu đề, một dòng mỗi sự kiện, hồ sơ chưa có sự kiện vẫn có dòng', () => {
  const lines = toCsv([sub(), sub({ no: 8, events: [] })]).trim().split('\r\n')
  assert.equal(lines[0].split(',')[0], 'no')
  assert.equal(eventRows([sub(), sub({ no: 8, events: [] })]).length, 2)
  assert.ok(lines[1].startsWith('7,Xin tạm ứng,approved,'))
})

test('toJson giữ dữ liệu và sự kiện', () => {
  const [s] = JSON.parse(toJson([sub()]))
  assert.equal(s.data.so_tien, 3000000)
  assert.equal(s.events[0].actor, 'Lê, "An"')
})

test('incompleteLogs: bước không áp dụng không bị tính thiếu; thiếu bước áp dụng thì bị liệt kê', () => {
  assert.equal(incompleteLogs([sub()]).length, 0, 'giám đốc không áp dụng cho 3 triệu')
  assert.equal(incompleteLogs([sub({ data: { so_tien: 9000000 } })]).length, 1, 'trên 5 triệu cần giám đốc')
  assert.equal(incompleteLogs([sub({ status: 'running', data: { so_tien: 9000000 } })]).length, 0, 'hồ sơ đang chạy chưa tính')
})
