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
