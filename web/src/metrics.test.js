// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test web/src/metrics.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeMetrics, formatHours, stepWaits } from './metrics.js'

const at = (h) => new Date(Date.UTC(2026, 0, 1, h)).toISOString()
const spec = { steps: [{ key: 'tp', name: 'Trưởng phòng duyệt', role: 'manager' }, { key: 'gd', name: 'Giám đốc duyệt', role: 'director' }] }
const app = { name: 'Tạm ứng' }
const make = (over) => ({ id: 'x', no: 1, app, version: { spec }, events: [], current_step: null, waiting_role: null, finished_at: null, ...over })

const done = make({
  status: 'approved', created_at: at(0), finished_at: at(30),
  events: [{ step_key: 'tp', created_at: at(2) }, { step_key: 'gd', created_at: at(30) }],
})
const rejected = make({ no: 2, status: 'rejected', created_at: at(0), finished_at: at(4), events: [{ step_key: 'tp', created_at: at(4) }] })
const stuck = make({ no: 3, status: 'running', created_at: at(0), current_step: 'gd', waiting_role: 'director', events: [{ step_key: 'tp', created_at: at(1) }] })

test('thời gian chờ từng bước tính từ lúc vào bước tới lúc có người xử lý', () => {
  assert.deepEqual(stepWaits(done), [{ step_key: 'tp', hours: 2 }, { step_key: 'gd', hours: 28 }])
})

test('tổng hợp trạng thái, thời gian hoàn tất và tỷ lệ duyệt', () => {
  const m = computeMetrics([done, rejected, stuck], Date.parse(at(49)))
  assert.deepEqual(m.status, { running: 1, approved: 1, rejected: 1 })
  assert.equal(m.avgDoneHours, 17) // (30 + 4) / 2
  assert.equal(m.approvedRate, 0.5)
  assert.equal(m.apps[0].total, 3)
})

test('điểm nghẽn là bước có thời gian chờ trung bình cao nhất', () => {
  const m = computeMetrics([done, rejected, stuck], Date.parse(at(49)))
  assert.equal(m.bottleneck.step, 'Giám đốc duyệt')
  assert.equal(m.bottleneck.avgHours, 28)
  assert.equal(m.steps.find((s) => s.step === 'Trưởng phòng duyệt').count, 3)
})

test('hồ sơ đang chờ lâu nhất tính từ hành động gần nhất', () => {
  const m = computeMetrics([done, stuck], Date.parse(at(49)))
  assert.deepEqual(m.longestWaiting.map((w) => [w.no, w.hours, w.role]), [[3, 48, 'director']])
})

test('không có dữ liệu thì không chia cho 0', () => {
  const m = computeMetrics([])
  assert.equal(m.avgDoneHours, 0)
  assert.equal(m.approvedRate, null)
  assert.equal(m.bottleneck, null)
})

test('định dạng thời gian cho người đọc', () => {
  assert.equal(formatHours(0.001), 'vài giây')
  assert.equal(formatHours(0.5), '30 phút')
  assert.equal(formatHours(2), '2 giờ')
  assert.equal(formatHours(36), '1,5 ngày')
})
