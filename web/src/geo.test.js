// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toPoints, project, projectEqual, shapePaths, regionAt } from './geo.js'

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

test('projectEqual: giữ tỉ lệ (1 độ vĩ ≈ 111 km), điểm nằm trong khung, một điểm ở giữa, kmPerPx khớp khoảng cách thật', () => {
  const { points: [a, b], kmPerPx } = projectEqual(toPoints([dev('s', 106, 10), dev('n', 106, 10.1)]), 600, 400)
  assert.ok(a.y > b.y, 'vĩ độ lớn nằm trên')
  assert.ok(Math.abs((a.y - b.y) * kmPerPx - 11.132) < 0.01, 'khoảng cách dọc theo km')
  const east = projectEqual(toPoints([dev('w', 106, 10), dev('e', 106.1, 10)]), 600, 400)
  assert.ok(Math.abs((east.points[1].x - east.points[0].x) * east.kmPerPx - 11.132 * Math.cos((10 * Math.PI) / 180)) < 0.01, 'kinh độ có hệ số cos')
  for (const p of [a, b]) assert.ok(p.x >= 0 && p.x <= 600 && p.y >= 0 && p.y <= 400)
  assert.deepEqual(projectEqual(toPoints([dev('only', 106, 10)]), 600, 400).points.map((p) => [p.x, p.y]), [[300, 200]])
  assert.deepEqual(projectEqual([], 600, 400), { points: [], kmPerPx: 0 })
})


const BASEMAP = JSON.parse(readFileSync(new URL('../public/basemap-vn.json', import.meta.url), 'utf8'))

test('nền bản đồ: điểm ở Hà Nội, TP.HCM, Đà Nẵng rơi vào đúng tỉnh; có Hoàng Sa và Trường Sa; điểm ngoài biển không thuộc tỉnh nào', () => {
  assert.equal(regionAt(BASEMAP, 105.8542, 21.0285), 'Hà Nội')
  assert.equal(regionAt(BASEMAP, 106.6297, 10.8231), 'Thành phố Hồ Chí Minh')
  assert.equal(regionAt(BASEMAP, 108.2022, 16.0544), 'Đà Nẵng')
  const names = BASEMAP.features.map((f) => f.properties.name)
  assert.ok(names.includes('Quần đảo Hoàng Sa (Đà Nẵng)') && names.includes('Quần đảo Trường Sa (Khánh Hòa)'))
  assert.ok(names.length >= 63)
  assert.equal(regionAt(BASEMAP, 110, 14), '')
})

test('nền bản đồ tự chứa: tệp nhỏ, không có địa chỉ http nào để trình duyệt tải thêm', () => {
  const raw = readFileSync(new URL('../public/basemap-vn.json', import.meta.url), 'utf8')
  assert.ok(raw.length < 300 * 1024, `nền ${raw.length} byte, quá lớn`)
  assert.ok(!/https?:\/\//.test(raw))
})

test('shapePaths: vẽ tỉnh chứa các điểm theo cùng phép chiếu; vùng ngoài khung bị bỏ; dữ liệu hỏng không làm lỗi', () => {
  const view = projectEqual(toPoints([dev('a', 105.80, 21.00), dev('b', 105.90, 21.05)]), 720, 460)
  const paths = shapePaths(BASEMAP, view.toXY, 720, 460)
  assert.ok(paths.some((p) => p.name === 'Hà Nội'))
  assert.ok(!paths.some((p) => p.name === 'Cà Mau'), 'Cà Mau ở quá xa khung Hà Nội')
  assert.match(paths[0].d, /^M[-\d.]+,[-\d.]+L/)
  assert.deepEqual(shapePaths(null, view.toXY, 720, 460), [])
  assert.deepEqual(shapePaths({ features: [{ geometry: { type: 'Polygon', coordinates: [[[1, 'x']]] } }, {}] }, view.toXY, 720, 460), [])
  assert.deepEqual(shapePaths(BASEMAP, undefined, 720, 460), [])
})
