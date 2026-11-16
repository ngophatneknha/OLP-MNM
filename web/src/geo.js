// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Bản đồ cảm biến (WebGIS tối giản): đọc thực thể NGSI-LD, chiếu vị trí WGS84 lên khung SVG.
// shortcut: chiếu phẳng (kinh độ/vĩ độ tuyến tính, đủ cho vùng nhỏ như một cơ sở hay một thành phố), không có nền bản đồ; cần nền thì thêm Leaflet và ô bản đồ.

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
  return { points: points.map((p) => ({ ...p, x: width / 2 + (kx(p) - mx) * scale, y: height / 2 - (ky(p) - my) * scale })), kmPerPx: 1 / scale }
}
