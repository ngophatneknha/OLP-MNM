// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toEntity, entityId, fromEntity, parseQ, checkEndpoint, allowList, deliver } from './ngsi.js'

const S = { key: 'lanh_1', name: 'Tủ lạnh', unit: '°C', threshold: 8, direction: 'above', last_value: 12, last_at: '2026-11-16T01:00:00Z', lat: 10.8, lon: 106.7, alarm: true }

test('NGSI-LD: id dạng URN, kiểu Device, Property có unitCode và observedAt, kinh độ đứng trước trong GeoProperty', () => {
  const e = toEntity('default', S)
  assert.equal(e.id, 'urn:ngsi-ld:Device:default:lanh_1')
  assert.equal(e.id, entityId('default', 'lanh_1'))
  assert.equal(e.type, 'Device')
  assert.deepEqual(e.value, { type: 'Property', value: 12, unitCode: '°C', observedAt: '2026-11-16T01:00:00.000Z' })
  assert.deepEqual(e.location, { type: 'GeoProperty', value: { type: 'Point', coordinates: [106.7, 10.8] } })
  assert.equal(e.alarm.value, true)
  assert.match(e['@context'][0], /ngsi-ld-core-context/)
})

test('NGSI-LD: cảm biến chưa có vị trí hay số đo thì không bịa GeoProperty và observedAt', () => {
  const e = toEntity('orgb', { ...S, lat: null, lon: null, last_value: null, last_at: null, alarm: false })
  assert.equal(e.location, undefined)
  assert.equal(e.value.observedAt, undefined)
  assert.equal(e.value.value, null)
})

const DEVICE = { id: 'urn:ngsi-ld:Device:default:lanh_2', type: 'Device', name: { type: 'Property', value: 'Tủ lạnh 2' }, threshold: { type: 'Property', value: 8, unitCode: '°C' }, direction: { type: 'Property', value: 'above' }, repairApp: { type: 'Property', value: 'sua_chua' }, location: { type: 'GeoProperty', value: { type: 'Point', coordinates: [106.7, 10.8] } } }

test('NGSI-LD ghi: thực thể Device chuyển thành dữ liệu đăng ký cảm biến, vị trí đảo lại thành lat/lon', () => {
  assert.deepEqual(fromEntity('default', DEVICE), { key: 'lanh_2', name: 'Tủ lạnh 2', unit: '°C', threshold: 8, direction: 'above', repair_app: 'sua_chua', lon: 106.7, lat: 10.8 })
})

test('NGSI-LD ghi (nghịch): sai kiểu, id không phải URN, tạo cho tổ chức khác, vị trí sai dạng đều bị từ chối', () => {
  const status = (fn) => { try { fn(); return 0 } catch (e) { return e.status } }
  assert.equal(status(() => fromEntity('default', { ...DEVICE, type: 'Building' })), 400)
  assert.equal(status(() => fromEntity('default', { ...DEVICE, id: 'lanh_2' })), 400)
  assert.equal(status(() => fromEntity('orgb', DEVICE)), 403)
  assert.equal(status(() => fromEntity('default', { ...DEVICE, location: { type: 'GeoProperty', value: { type: 'Point', coordinates: [1] } } })), 400)
  assert.equal(status(() => fromEntity('default', [])), 400)
})

test('NGSI-LD q: so sánh số và đúng/sai, ";" là "và"; thiếu số đo thì không thỏa', () => {
  const e = (value, alarm) => ({ value: { value }, threshold: { value: 8 }, alarm: { value: alarm } })
  assert.equal(parseQ('value>8')(e(9, true)), true)
  assert.equal(parseQ('value>8')(e(8, false)), false)
  assert.equal(parseQ('value>=8;value<30')(e(30, true)), false)
  assert.equal(parseQ('alarm==true')(e(9, true)), true)
  assert.equal(parseQ('value>8')(e(null, false)), false)
  assert.equal(parseQ(undefined)(e(null, false)), true)
})

test('NGSI-LD q (nghịch): cú pháp lạ, thuộc tính lạ, so sánh lớn hơn với đúng/sai bị từ chối ngay khi đăng ký', () => {
  for (const q of ['value>abc', 'name==x', 'alarm>true', 'value>8 OR 1=1', 'x'.repeat(201)]) assert.throws(() => parseQ(q), { status: 400 }, q)
})

test('NGSI-LD endpoint: chỉ máy:cổng trong NGSI_NOTIFY_ALLOW; danh sách rỗng là cấm hết; cấm tài khoản trong URL và giao thức lạ', () => {
  const allow = allowList('ngsi-sink:4000, partner.example')
  assert.equal(checkEndpoint('http://ngsi-sink:4000/notify', allow), 'http://ngsi-sink:4000/notify')
  assert.equal(checkEndpoint('https://partner.example/hook', allow), 'https://partner.example/hook')
  for (const uri of ['http://ngsi-sink:4001/', 'http://postgres:5432/', 'http://partner.example:8080/', 'http://u:p@ngsi-sink:4000/', 'file:///etc/passwd', 'không phải url']) assert.throws(() => checkEndpoint(uri, allow), { status: 400 }, uri)
  assert.throws(() => checkEndpoint('http://ngsi-sink:4000/', allowList('')), { status: 400 })
})

test('NGSI-LD gửi thông báo: thân Notification đúng chuẩn, không chuyển hướng; lỗi mạng và mã 5xx trả lý do thay vì ném', async () => {
  let seen
  const ok = await deliver({ id: 'urn:ngsi-ld:Subscription:a', endpoint: 'http://x/' }, toEntity('default', S), async (url, init) => { seen = init; return { status: 204 } })
  assert.equal(ok, null)
  const body = JSON.parse(seen.body)
  assert.equal(body.type, 'Notification')
  assert.equal(body.subscriptionId, 'urn:ngsi-ld:Subscription:a')
  assert.equal(body.data[0].id, 'urn:ngsi-ld:Device:default:lanh_1')
  assert.equal(body.data[0]['@context'], undefined)
  assert.equal(seen.redirect, 'manual')
  assert.equal(await deliver({ id: 'a', endpoint: 'http://x/' }, toEntity('default', S), async () => ({ status: 302 })), 'HTTP 302')
  assert.match(await deliver({ id: 'a', endpoint: 'http://x/' }, toEntity('default', S), async () => { throw Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } }) }), /ECONNREFUSED/)
})
