// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPoints, project } from './geo.js'

const dev = (id, lon, lat, alarm = false) => ({ id, name: { value: id }, value: { value: 5, unitCode: '°C' }, alarm: { value: alarm }, location: { value: { type: 'Point', coordinates: [lon, lat] } } })

test('toPoints bỏ thực thể không có vị trí và đọc đúng kinh độ, vĩ độ', () => {
  const pts = toPoints([dev('a', 106.7, 10.8, true), { id: 'b', name: { value: 'b' } }])
  assert.equal(pts.length, 1)
  assert.deepEqual([pts[0].lon, pts[0].lat, pts[0].alarm], [106.7, 10.8, true])
})

test('project: vĩ độ lớn nằm trên, kinh độ lớn nằm phải, nằm trong khung; một điểm thì ở giữa', () => {
  const [west, east, north] = project(toPoints([dev('w', 106, 10), dev('e', 107, 10), dev('n', 106.5, 11)]), 400, 300)
  assert.ok(east.x > west.x && north.y < west.y)
  for (const p of [west, east, north]) assert.ok(p.x >= 0 && p.x <= 400 && p.y >= 0 && p.y <= 300)
  assert.deepEqual(project(toPoints([dev('only', 106, 10)]), 400, 300).map((p) => [p.x, p.y]), [[200, 150]])
  assert.deepEqual(project([], 400, 300), [])
})
