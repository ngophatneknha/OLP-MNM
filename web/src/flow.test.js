// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test web/src/flow.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applies, flowLayout, stepStates } from './flow.js'

const spec = {
  fields: [{ key: 'so_tien', label: 'Số tiền' }],
  steps: [
    { key: 'tp', name: 'Trưởng phòng', role: 'manager' },
    { key: 'gd', name: 'Giám đốc', role: 'director', when: { field: 'so_tien', op: '>', value: 5000000 } },
    { key: 'kt', name: 'Kế toán', role: 'accountant', type: 'task' },
  ],
}
const sub = (over) => ({ data: { so_tien: 12000000 }, events: [], current_step: 'tp', ...over })
const states = (s) => stepStates(spec, s).map((x) => x.state)

test('xem trước quy trình: chưa có hồ sơ thì mọi bước là preview', () => {
  assert.deepEqual(states(null), ['preview', 'preview', 'preview'])
})

test('hồ sơ mới: bước hiện tại chờ, các bước sau chưa tới', () => {
  assert.deepEqual(states(sub()), ['waiting', 'upcoming', 'upcoming'])
})

test('duyệt xong bước đầu thì bước sau sáng lên', () => {
  const s = sub({ current_step: 'gd', events: [{ step_key: 'tp', action: 'approve' }] })
  assert.deepEqual(states(s), ['signed', 'waiting', 'upcoming'])
})

test('điều kiện sai thì bước bị bỏ qua, kể cả khi sơ đồ vẫn vẽ nó', () => {
  const s = sub({ data: { so_tien: 1000000 }, current_step: 'kt', events: [{ step_key: 'tp', action: 'approve' }] })
  assert.deepEqual(states(s), ['signed', 'skipped', 'waiting'])
})

test('bị từ chối thì bước đó là refused', () => {
  const s = sub({ events: [{ step_key: 'tp', action: 'reject' }], current_step: null })
  assert.equal(states(s)[0], 'refused')
})

test('phép so sánh điều kiện', () => {
  const step = (op, value) => ({ when: { field: 'so_tien', op, value } })
  assert.equal(applies(step('>', 5), { so_tien: 6 }), true)
  assert.equal(applies(step('>', 5), { so_tien: 5 }), false)
  assert.equal(applies(step('>=', 5), { so_tien: 5 }), true)
  assert.equal(applies({}, {}), true)
})

test('bố cục: số nút, đường nối và đường vòng khớp với quy trình', () => {
  const l = flowLayout(spec.steps)
  assert.equal(l.nodes.length, 3)
  assert.equal(l.links.length, 4) // bắt đầu -> 3 bước -> kết thúc
  assert.deepEqual(l.bypasses.map((b) => b.key), ['gd']) // chỉ bước có điều kiện
  assert.ok(l.nodes.every((n, i) => i === 0 || n.x > l.nodes[i - 1].x + l.nodes[i - 1].w), 'các nút không chồng nhau')
  assert.ok(l.end.cx < l.width)
})
