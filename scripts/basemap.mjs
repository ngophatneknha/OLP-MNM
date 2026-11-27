#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Dựng nền bản đồ tự chứa web/public/basemap-vn.json (ranh giới 63 tỉnh, thành Việt Nam, quần đảo Hoàng Sa và Trường Sa)
// từ dữ liệu Natural Earth 1:10m, phiên bản ghim v5.1.2 (public domain, xem THIRD_PARTY.md). Chỉ cần chạy lại khi đổi nguồn dữ liệu;
// trang web đọc tệp kết quả cùng nguồn (same-origin), không tải ô bản đồ hay mã từ bên ngoài.
//   node scripts/basemap.mjs                      tải hai tệp GeoJSON gốc (~55 MB) rồi rút gọn
//   node scripts/basemap.mjs <admin1> <admin0>    dùng tệp đã tải sẵn
// Natural Earth vẽ Hoàng Sa trong đa giác của nước khác và Trường Sa thành vùng riêng; tệp kết quả gán cả hai quần đảo cho Việt Nam
// (Hoàng Sa thuộc Đà Nẵng, Trường Sa thuộc Khánh Hòa) và không chứa lãnh thổ nước nào khác.
// shortcut: ranh giới trước khi sắp xếp lại đơn vị hành chính năm 2025 (63 tỉnh); rút gọn còn khoảng 1 km nên chỉ hợp xem tổng quan.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson'
const SRC = { admin1: `${BASE}/ne_10m_admin_1_states_provinces.geojson`, admin0: `${BASE}/ne_10m_admin_0_countries.geojson` }
const OUT = join(ROOT, 'web/public/basemap-vn.json')
const TOLERANCE = 0.01 // độ, khoảng 1,1 km
// Lấy đảo theo cả vùng ghi trong Natural Earth lẫn khung tọa độ, để không lẫn đảo của nước láng giềng (Palawan, bắc Borneo).
const HOANG_SA = { from: 'CHN', minLon: 111, maxLon: 113, minLat: 15.5, maxLat: 17.5 }
const TRUONG_SA = { from: 'PGA', minLon: 111, maxLon: 117, minLat: 6, maxLat: 12.5 }

/** Rút gọn đường gấp khúc bằng thuật toán Ramer-Douglas-Peucker. */
export function simplify(points, tol = TOLERANCE) {
  if (points.length < 3) return points
  const [a, b] = [points[0], points.at(-1)]
  const dist = (p) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
    const len = Math.hypot(dx, dy)
    return len === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
  }
  let [maxD, idx] = [0, 0]
  for (let i = 1; i < points.length - 1; i += 1) { const d = dist(points[i]); if (d > maxD) [maxD, idx] = [d, i] }
  if (maxD <= tol) return [a, b]
  return [...simplify(points.slice(0, idx + 1), tol).slice(0, -1), ...simplify(points.slice(idx), tol)]
}

const round = (p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]
/** Vòng đa giác: rút gọn, làm tròn 3 chữ số, bỏ điểm trùng; vòng quá nhỏ (đảo dưới ngưỡng) thì giữ dạng tam giác tối thiểu. */
function ring(r) {
  const out = []
  for (const p of simplify(r).map(round)) if (!out.length || out.at(-1)[0] !== p[0] || out.at(-1)[1] !== p[1]) out.push(p)
  if (out.length < 4) return r.length >= 4 ? [r[0], r[Math.floor(r.length / 3)], r[Math.floor((2 * r.length) / 3)], r[0]].map(round) : null
  return out
}
const polygons = (g) => (g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [])
const inBox = (poly, b) => poly[0].every(([x, y]) => x >= b.minLon && x <= b.maxLon && y >= b.minLat && y <= b.maxLat)
function shrink(polys) {
  const kept = polys.map((poly) => poly.map(ring).filter(Boolean)).filter((poly) => poly.length)
  return kept.length ? { type: 'MultiPolygon', coordinates: kept } : null
}

async function load(arg, url) {
  if (arg) return JSON.parse(readFileSync(arg, 'utf8'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Không tải được ${url}: HTTP ${res.status}`)
  return res.json()
}

export function build(admin1, admin0) {
  const features = admin1.features
    .filter((f) => f.properties.adm0_a3 === 'VNM')
    .map((f) => ({ type: 'Feature', properties: { name: f.properties.name_vi || f.properties.name, code: f.properties.iso_3166_2 }, geometry: shrink(polygons(f.geometry)) }))
    .filter((f) => f.geometry)
  const islands = (box) => admin0.features.filter((f) => f.properties.ADM0_A3 === box.from).flatMap((f) => polygons(f.geometry).filter((poly) => inBox(poly, box)))
  const add = (name, code, polys) => { const g = shrink(polys); if (g) features.push({ type: 'Feature', properties: { name, code, archipelago: true }, geometry: g }) }
  add('Quần đảo Hoàng Sa (Đà Nẵng)', 'VN-DN-HS', islands(HOANG_SA))
  add('Quần đảo Trường Sa (Khánh Hòa)', 'VN-34-TS', islands(TRUONG_SA))
  features.sort((x, y) => x.properties.code.localeCompare(y.properties.code))
  return { type: 'FeatureCollection', name: 'basemap-vn', source: 'Natural Earth 1:10m v5.1.2 (public domain), rút gọn bởi scripts/basemap.mjs', features }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [admin1, admin0] = await Promise.all([load(process.argv[2], SRC.admin1), load(process.argv[3], SRC.admin0)])
  const out = build(admin1, admin0)
  writeFileSync(OUT, `${JSON.stringify(out)}\n`)
  console.log(`Đã ghi ${OUT}: ${out.features.length} vùng, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`)
}
