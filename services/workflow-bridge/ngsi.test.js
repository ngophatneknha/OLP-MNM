// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toEntity, entityId } from './ngsi.js'

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
