// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đầu ra NGSI-LD (ETSI GS CIM 009) cho cảm biến, để hệ thống bên ngoài đọc theo chuẩn không gian dữ liệu (data space):
//  - GET /ngsi-ld/v1/entities[?type=Device&limit=N]   danh sách thực thể của tổ chức người gọi
//  - GET /ngsi-ld/v1/entities/<id>                    một thực thể
// Chỉ trưởng phòng và giám đốc đọc được (cùng quyền với GET /sensors). Kiểu Device theo Smart Data Models.
// shortcut: chỉ đọc (không có POST/PATCH thực thể, không có đăng ký thuê bao, lọc theo type và id); cảm biến vẫn gửi số đo qua /telemetry.
import { HttpError } from './files.js'
import { claimsOf, rolesOf, orgOf } from './cold.js'
import { listSensors } from './sensors.js'

const CONTEXT = ['https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld', { '@vocab': 'https://dxlab.example/ns#' }]

export const entityId = (org, key) => `urn:ngsi-ld:Device:${org}:${key}`

/** Một dòng của listSensors -> thực thể NGSI-LD (Property, GeoProperty, observedAt theo chuẩn). */
export function toEntity(org, s) {
  const e = {
    id: entityId(org, s.key),
    type: 'Device',
    name: { type: 'Property', value: s.name },
    value: { type: 'Property', value: s.last_value, unitCode: s.unit, ...(s.last_at ? { observedAt: new Date(s.last_at).toISOString() } : {}) },
    threshold: { type: 'Property', value: s.threshold, unitCode: s.unit },
    direction: { type: 'Property', value: s.direction },
    alarm: { type: 'Property', value: s.alarm },
    '@context': CONTEXT,
  }
  if (s.lat !== null && s.lon !== null) e.location = { type: 'GeoProperty', value: { type: 'Point', coordinates: [s.lon, s.lat] } } // NGSI-LD/GeoJSON: kinh độ trước
  return e
}

const send = (res, status, body) => res.writeHead(status, { 'content-type': 'application/ld+json', link: `<${CONTEXT[0]}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"` }).end(JSON.stringify(body))

export async function handleNgsi(req, res) {
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Chỉ hỗ trợ đọc (GET)')
    if (!claimsOf(req).sub) throw new HttpError(401, 'Thiếu thông tin đăng nhập')
    if (!rolesOf(req).some((r) => ['director', 'manager'].includes(r))) throw new HttpError(403, 'Chỉ trưởng phòng và giám đốc xem thực thể')
    const url = new URL(req.url, 'http://x')
    const org = orgOf(req)
    const all = (await listSensors(org)).map((s) => toEntity(org, s))
    const one = url.pathname.match(/^\/ngsi-ld\/v1\/entities\/(.+)$/)
    if (one) {
      const found = all.find((e) => e.id === decodeURIComponent(one[1]))
      if (!found) throw new HttpError(404, 'Không tìm thấy thực thể')
      return send(res, 200, found)
    }
    if (url.pathname !== '/ngsi-ld/v1/entities') throw new HttpError(404, 'Không tìm thấy')
    const type = url.searchParams.get('type')
    if (type && type !== 'Device') return send(res, 200, [])
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 1000)
    return send(res, 200, all.slice(0, limit))
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'https://uri.etsi.org/ngsi-ld/errors/InvalidRequest', title: status === 500 ? 'Lỗi máy chủ' : err.message, status }))
  }
}
