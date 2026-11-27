// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Bản đồ cảm biến (WebGIS tối giản): đọc thực thể NGSI-LD, chiếu vị trí WGS84 lên khung SVG.
// Nền bản đồ: ranh giới tỉnh, thành (web/public/basemap-vn.json, dựng bằng scripts/basemap.mjs từ Natural Earth), chiếu cùng phép với các điểm.
// shortcut: chiếu phẳng giữ tỉ lệ quanh vĩ độ giữa vùng (đủ cho một cơ sở, một thành phố hay một miền), nền chỉ tới mức tỉnh, không có đường phố.

/** Thực thể NGSI-LD Device -> điểm trên bản đồ; bỏ cảm biến chưa có vị trí. */
export function toPoints(entities) {
  return entities
    .filter((e) => e.location?.value?.coordinates?.length === 2)
    .map((e) => ({
      id: e.id,
      name: e.name?.value ?? e.id,
      lon: e.location.value.coordinates[0],
      lat: e.location.value.coordinates[1],
      value: e.value?.value ?? null,
      unit: e.value?.unitCode ?? '',
      alarm: e.alarm?.value === true,
    }))
}

/** Chiếu các điểm vào khung width x height, chừa lề; một điểm duy nhất thì đặt giữa khung. Vĩ độ lớn ở phía trên. */
export function project(points, width, height, pad = 40) {
  if (!points.length) return []
  const lons = points.map((p) => p.lon)
  const lats = points.map((p) => p.lat)
  const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)]
  const place = (v, lo, hi, size) => (hi === lo ? size / 2 : pad + ((v - lo) / (hi - lo)) * (size - 2 * pad))
  return points.map((p) => ({ ...p, x: place(p.lon, minLon, maxLon, width), y: height - place(p.lat, minLat, maxLat, height) }))
}

/**
 * Chiếu giữ đúng tỉ lệ (kinh độ nhân cos vĩ độ giữa vùng), để khoảng cách trên bản đồ không méo.
 * Trả về { points, kmPerPx }: kmPerPx dùng cho thanh tỉ lệ. Vùng nhỏ hơn 0,1 km được coi là 0,1 km để một điểm đơn lẻ vẫn có tỉ lệ.
 */
export function projectEqual(points, width, height, pad = 56) {
  if (!points.length) return { points: [], kmPerPx: 0 }
  const KM = 111.32
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length
  const lon0 = points.reduce((s, p) => s + p.lon, 0) / points.length
  const kx = (p) => (p.lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * KM
  const ky = (p) => (p.lat - lat0) * KM
  const span = (f) => Math.max(Math.max(...points.map(f)) - Math.min(...points.map(f)), 0.1)
  const scale = Math.min((width - 2 * pad) / span(kx), (height - 2 * pad) / span(ky)) // px mỗi km
  const mid = (f) => (Math.max(...points.map(f)) + Math.min(...points.map(f))) / 2
  const [mx, my] = [mid(kx), mid(ky)]
  const toXY = (lon, lat) => [width / 2 + (kx({ lon }) - mx) * scale, height / 2 - (ky({ lat }) - my) * scale]
  return { points: points.map((p) => { const [x, y] = toXY(p.lon, p.lat); return { ...p, x, y } }), kmPerPx: 1 / scale, toXY }
}

const polygonsOf = (g) => (g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [])

/**
 * Nền bản đồ: mỗi vùng của GeoJSON (Polygon/MultiPolygon) thành một chuỗi path SVG theo phép chiếu toXY của projectEqual.
 * Bỏ vùng nằm hẳn ngoài khung (chừa lề) để SVG nhẹ; dữ liệu hỏng hay thiếu thì trả mảng rỗng, bản đồ vẫn vẽ các điểm.
 */
export function shapePaths(fc, toXY, width, height, margin = 40) {
  if (!toXY || !Array.isArray(fc?.features)) return []
  const out = []
  for (const f of fc.features) {
    const rings = polygonsOf(f?.geometry).flat().filter((r) => Array.isArray(r) && r.length >= 4 && r.every((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])))
    if (!rings.length) continue
    const xy = rings.map((r) => r.map(([lon, lat]) => toXY(lon, lat)))
    const xs = xy.flat().map((p) => p[0])
    const ys = xy.flat().map((p) => p[1])
    if (Math.max(...xs) < -margin || Math.min(...xs) > width + margin || Math.max(...ys) < -margin || Math.min(...ys) > height + margin) continue
    const d = xy.map((r) => `M${r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`).join('')
    out.push({ code: f.properties?.code ?? '', name: f.properties?.name ?? '', d })
  }
  return out
}

/** Điểm (lon, lat) nằm trong vòng r? Thuật toán tia (ray casting). */
const inRing = (lon, lat, r) => {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
/** Tên vùng (tỉnh, thành) chứa điểm; không thuộc vùng nào thì trả ''. Vòng thứ hai trở đi của đa giác là lỗ thủng. */
export function regionAt(fc, lon, lat) {
  for (const f of fc?.features ?? []) {
    if (polygonsOf(f?.geometry).some((poly) => poly.length && inRing(lon, lat, poly[0]) && !poly.slice(1).some((hole) => inRing(lon, lat, hole)))) return f.properties?.name ?? ''
  }
  return ''
}
