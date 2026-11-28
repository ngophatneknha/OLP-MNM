#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Dựng nền bản đồ tự chứa web/public/basemap-vn.json (ranh giới 34 tỉnh, thành Việt Nam từ 01/7/2025, quần đảo Hoàng Sa và Trường Sa)
// từ dữ liệu Natural Earth 1:10m, phiên bản ghim v5.1.2 (public domain, xem THIRD_PARTY.md). Chỉ cần chạy lại khi đổi nguồn dữ liệu;
// trang web đọc tệp kết quả cùng nguồn (same-origin), không tải ô bản đồ hay mã từ bên ngoài.
//   node scripts/basemap.mjs                      tải hai tệp GeoJSON gốc (~55 MB) rồi rút gọn
//   node scripts/basemap.mjs <admin1> <admin0>    dùng tệp đã tải sẵn
// Natural Earth vẽ Hoàng Sa trong đa giác của nước khác và Trường Sa thành vùng riêng; tệp kết quả gán cả hai quần đảo cho Việt Nam
// (Hoàng Sa thuộc Đà Nẵng, Trường Sa thuộc Khánh Hòa) và không chứa lãnh thổ nước nào khác.
// Natural Earth còn vẽ 63 tỉnh cũ; tỉnh mới theo Nghị quyết 202/2025/QH15 được dựng bằng cách gộp đa giác các tỉnh cũ (bảng MERGE):
// cạnh chung giữa hai tỉnh cũ xuất hiện hai lần theo hai chiều ngược nhau thì bỏ, phần còn lại nối thành vòng ranh giới mới.
// Mã vùng là mã ISO 3166-2 cũ của tỉnh giữ tên (ISO chưa cấp mã mới), chỉ dùng làm khóa ổn định trong ứng dụng.
// shortcut: ranh giới mới đúng tới mức tỉnh vì các tỉnh gộp nguyên vẹn; không có ranh giới xã sau sắp xếp; rút gọn còn khoảng 1 km nên chỉ hợp xem tổng quan.
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

// Tỉnh, thành mới (tên, mã) <- các tỉnh cũ (mã ISO 3166-2 trong Natural Earth). 11 tỉnh, thành giữ nguyên, 23 đơn vị mới do gộp.
// Natural Earth đặt tên lạ cho ba tỉnh: VN-39 là Đồng Nai, VN-53 là Bắc Kạn, VN-66 là Hưng Yên.
export const MERGE = [
  ['Hà Nội', 'VN-HN', ['VN-HN']], ['Huế', 'VN-26', ['VN-26']], ['Lai Châu', 'VN-01', ['VN-01']], ['Điện Biên', 'VN-71', ['VN-71']],
  ['Sơn La', 'VN-05', ['VN-05']], ['Lạng Sơn', 'VN-09', ['VN-09']], ['Quảng Ninh', 'VN-13', ['VN-13']], ['Thanh Hóa', 'VN-21', ['VN-21']],
  ['Nghệ An', 'VN-22', ['VN-22']], ['Hà Tĩnh', 'VN-23', ['VN-23']], ['Cao Bằng', 'VN-04', ['VN-04']],
  ['Tuyên Quang', 'VN-07', ['VN-07', 'VN-03']], ['Lào Cai', 'VN-02', ['VN-02', 'VN-06']], ['Thái Nguyên', 'VN-69', ['VN-69', 'VN-53']],
  ['Phú Thọ', 'VN-68', ['VN-68', 'VN-70', 'VN-14']], ['Bắc Ninh', 'VN-56', ['VN-56', 'VN-54']], ['Hưng Yên', 'VN-66', ['VN-66', 'VN-20']],
  ['Hải Phòng', 'VN-HP', ['VN-HP', 'VN-61']], ['Ninh Bình', 'VN-18', ['VN-18', 'VN-63', 'VN-67']], ['Quảng Trị', 'VN-25', ['VN-25', 'VN-24']],
  ['Đà Nẵng', 'VN-DN', ['VN-DN', 'VN-27']], ['Quảng Ngãi', 'VN-29', ['VN-29', 'VN-28']], ['Gia Lai', 'VN-30', ['VN-30', 'VN-31']],
  ['Khánh Hòa', 'VN-34', ['VN-34', 'VN-36']], ['Lâm Đồng', 'VN-35', ['VN-35', 'VN-72', 'VN-40']], ['Đắk Lắk', 'VN-33', ['VN-33', 'VN-32']],
  ['Thành phố Hồ Chí Minh', 'VN-SG', ['VN-SG', 'VN-57', 'VN-43']], ['Đồng Nai', 'VN-39', ['VN-39', 'VN-58']], ['Tây Ninh', 'VN-37', ['VN-37', 'VN-41']],
  ['Cần Thơ', 'VN-CT', ['VN-CT', 'VN-52', 'VN-73']], ['Vĩnh Long', 'VN-49', ['VN-49', 'VN-50', 'VN-51']], ['Đồng Tháp', 'VN-45', ['VN-45', 'VN-46']],
  ['Cà Mau', 'VN-59', ['VN-59', 'VN-55']], ['An Giang', 'VN-44', ['VN-44', 'VN-47']],
]

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

const area = (r) => r.reduce((s, p, i) => (i ? s + (r[i - 1][0] * p[1] - p[0] * r[i - 1][1]) : 0), 0) / 2
const inside = ([x, y], r) => {
  let hit = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) hit = !hit
  return hit
}
/**
 * Gộp các đa giác kề nhau (tọa độ gốc, chưa rút gọn) thành một: cạnh a->b có cạnh ngược b->a ở đa giác khác là ranh giới chung, bỏ cả hai;
 * các cạnh còn lại nối thành vòng. Vòng cùng chiều với vòng ngoài gốc là vòng ngoài, ngược chiều là lỗ (gán vào vòng ngoài chứa nó).
 */
export function dissolve(polys) {
  const key = (p) => `${p[0]},${p[1]}`
  const edges = new Map()
  let sign = 0
  for (const poly of polys) {
    for (const [n, r] of poly.entries()) {
      if (n === 0) sign ||= Math.sign(area(r))
      for (let i = 0; i < r.length - 1; i += 1) {
        const [a, b] = [r[i], r[i + 1]]
        const back = `${key(b)}|${key(a)}`
        if (edges.has(back)) edges.delete(back)
        else edges.set(`${key(a)}|${key(b)}`, [a, b])
      }
    }
  }
  const from = new Map()
  for (const [a, b] of edges.values()) from.set(key(a), [...(from.get(key(a)) ?? []), b])
  const rings = []
  for (const [start, nexts] of from) {
    while (nexts.length) {
      const r = [start.split(',').map(Number)]
      let at = nexts.pop()
      for (let guard = 0; guard < 1e6; guard += 1) {
        r.push(at)
        if (key(at) === start) break
        at = from.get(key(at))?.pop()
        if (!at) throw new Error(`gộp đa giác: ranh giới hở tại ${key(r.at(-1))}`)
      }
      if (r.length >= 4) rings.push(r)
    }
  }
  const outers = rings.filter((r) => Math.sign(area(r)) === sign).map((r) => [r])
  for (const hole of rings.filter((r) => Math.sign(area(r)) !== sign)) outers.find(([o]) => inside(hole[0], o))?.push(hole)
  return outers
}

async function load(arg, url) {
  if (arg) return JSON.parse(readFileSync(arg, 'utf8'))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Không tải được ${url}: HTTP ${res.status}`)
  return res.json()
}

export function build(admin1, admin0) {
  const old = new Map(admin1.features.filter((f) => f.properties.adm0_a3 === 'VNM').map((f) => [f.properties.iso_3166_2, f]))
  const used = MERGE.flatMap(([, , codes]) => codes)
  const missing = [...used.filter((c) => !old.has(c)), ...[...old.keys()].filter((c) => !used.includes(c))]
  if (missing.length || used.length !== old.size) throw new Error(`bảng gộp tỉnh không khớp dữ liệu nguồn: ${missing.join(', ')}`)
  const features = MERGE
    .map(([name, code, codes]) => {
      const polys = codes.flatMap((c) => polygons(old.get(c).geometry))
      return { type: 'Feature', properties: { name, code, merged: codes }, geometry: shrink(codes.length > 1 ? dissolve(polys) : polys) }
    })
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
