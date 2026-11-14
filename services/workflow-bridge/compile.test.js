// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test services/workflow-bridge/compile.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { validateSpec, toBpmn, toViewSql, isKey, simulate } from './compile.js'

const spec = {
  fields: [
    { key: 'so_tien', label: 'Số tiền', type: 'number', required: true },
    { key: 'ly_do', label: 'Lý do', type: 'longtext' },
  ],
  steps: [
    { key: 'truong_phong', name: 'Trưởng phòng duyệt', role: 'manager' },
    { key: 'giam_doc', name: 'Giám đốc duyệt', role: 'director', when: { field: 'so_tien', op: '>', value: 5000000 } },
    { key: 'chi_tien', name: 'Kế toán chi tiền', role: 'accountant', type: 'task' },
  ],
}

test('spec hợp lệ không có lỗi', () => {
  assert.deepEqual(validateSpec(spec), [])
})

test('từ chối định danh và điều kiện có thể chèn mã', () => {
  const bad = (patch) => validateSpec({ ...structuredClone(spec), ...patch })
  assert.notEqual(bad({ fields: [{ key: "x'; DROP TABLE app;--", label: 'a', type: 'text' }] }).length, 0)
  assert.notEqual(bad({ steps: [{ key: 'a1', name: 'a', role: 'root' }] }).length, 0)
  assert.notEqual(bad({ steps: [{ key: 'a1', name: 'a', role: 'manager', when: { field: 'so_tien', op: '> 0 || true', value: 1 } }] }).length, 0)
  assert.notEqual(bad({ steps: [{ key: 'a1', name: 'a', role: 'manager', when: { field: 'ly_do', op: '==', value: 'x' } }] }).length, 0, 'trường không bắt buộc')
  assert.notEqual(bad({ fields: [{ key: 'loai', label: 'Loại', type: 'text', required: true }], steps: [{ key: 'a1', name: 'a', role: 'manager', when: { field: 'loai', op: '==', value: "a'}${x}" } }] }).length, 0)
  assert.notEqual(bad({ fields: [{ key: 'status', label: 'x', type: 'text' }] }).length, 0, 'tên dành riêng')
})

test('BPMN có rẽ nhánh điều kiện, nhánh từ chối và bước task', () => {
  const bpmn = toBpmn('tam_ung', 'Tạm ứng <thử>', spec)
  assert.match(bpmn, /<process id="app_tam_ung" name="Tạm ứng &lt;thử&gt;"/)
  assert.match(bpmn, /<exclusiveGateway id="when_giam_doc" default="skip_giam_doc"\/>/)
  assert.match(bpmn, /\$\{so_tien > 5000000\}/)
  assert.match(bpmn, /id="skip_giam_doc" sourceRef="when_giam_doc" targetRef="step_chi_tien"/)
  assert.match(bpmn, /id="no_truong_phong" sourceRef="ok_truong_phong" targetRef="rejected"/)
  assert.match(bpmn, /sourceRef="step_chi_tien" targetRef="approved"/)
  // mọi targetRef/sourceRef đều trỏ tới phần tử có thật
  const ids = new Set([...bpmn.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))
  for (const [, ref] of bpmn.matchAll(/(?:sourceRef|targetRef|default)="([^"]+)"/g)) assert.ok(ids.has(ref), ref)
})

test('view phẳng ép kiểu số', () => {
  const sql = toViewSql('tam_ung', spec)
  assert.match(sql, /CREATE VIEW bi\.app_tam_ung/)
  assert.match(sql, /\(data->>'so_tien'\)::numeric AS so_tien/)
  assert.throws(() => toViewSql('x; drop', spec))
})

test('mọi quy trình trong kho mẫu library/ đều hợp lệ và biên dịch được', () => {
  const dir = new URL('../../library/', import.meta.url)
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  assert.ok(files.length > 0)
  for (const file of files) {
    const item = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
    assert.equal(`${item.key}.json`, file, 'tên tệp phải trùng mã quy trình')
    assert.ok(isKey(item.key) && item.name && item.description && item.category, file)
    assert.deepEqual(validateSpec(item.spec), [], file)
    toBpmn(item.key, item.name, item.spec)
  }
})

test('chạy thử thay đổi trên hồ sơ cũ: nâng ngưỡng giám đốc từ 5 lên 10 triệu', () => {
  const next = structuredClone(spec)
  next.steps[1].when.value = 10000000
  const at = (h) => new Date(Date.UTC(2026, 0, 1, h)).toISOString()
  const submissions = [
    { data: { so_tien: 8000000 }, created_at: at(0), events: [{ step_key: 'truong_phong', created_at: at(1) }, { step_key: 'giam_doc', created_at: at(25) }] },
    { data: { so_tien: 20000000 }, created_at: at(0), events: [{ step_key: 'truong_phong', created_at: at(3) }] },
    { data: { so_tien: 1000000 }, created_at: at(0), events: [] },
  ]
  const result = simulate(spec, next, submissions)
  assert.equal(result.total, 3)
  assert.equal(result.changed, 1, 'chỉ hồ sơ 8 triệu đổi đường đi')
  const director = result.steps.find((s) => s.key === 'giam_doc')
  assert.deepEqual([director.before, director.after, director.avgHours], [2, 1, 24])
  assert.equal(result.savedHoursPerSubmission, 8, '24 giờ chờ giám đốc / 3 hồ sơ')
  assert.deepEqual(simulate(spec, spec, []), { total: 0, changed: 0, savedHoursPerSubmission: 0, steps: [] })
})
