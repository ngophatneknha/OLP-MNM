// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Z-11: nhật ký truy vết tập trung (Vector -> VictoriaLogs, mã X-Request-Id) và trục sự kiện streaming (NATS JetStream).
// Mã ca: TRACE-xx (nhật ký), STREAM-xx (sự kiện). Thành phần tùy chọn, ca chạy thật chỉ chạy khi đã bật:
//   docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile logs --profile stream up -d
//   LOGS_OPTIONAL=1 STREAM_OPTIONAL=1 node --test tests/trace.test.js
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, GW, ROLE, login, until, uid } from './lib.js'

const LOGS = process.env.LOGS_URL ?? 'http://127.0.0.1:9428'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const logsSkip = process.env.LOGS_OPTIONAL ? false : 'đặt LOGS_OPTIONAL=1 sau khi bật profile logs'
const logs = async (query) => (await (await fetch(`${LOGS}/select/logsql/query`, { method: 'POST', body: new URLSearchParams({ query }) })).text())
  .split('\n').filter(Boolean).map((l) => JSON.parse(l))
const call = async (user, path, headers = {}) => fetch(`${GW}${path}`, { headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user], ...headers } })

describe('TRACE: nhật ký tập trung và mã truy vết (Z-11)', () => {
  test('TRACE-01 cổng API gắn mã truy vết cho mọi yêu cầu, giữ mã do bên gọi gửi, trả lại trong phản hồi (kể cả khi bị từ chối 401)', async () => {
    const res = await fetch(`${GW}/ngsi-ld/v1/entities`)
    assert.equal(res.status, 401)
    assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/)
    const mine = `ca-thu-${uid()}`
    assert.equal((await fetch(`${GW}/ngsi-ld/v1/entities`, { headers: { 'x-request-id': mine } })).headers.get('x-request-id'), mine)
  })

  test('TRACE-02 cấu hình: kho nhật ký chỉ mở trên 127.0.0.1, ảnh ghim phiên bản không dùng bản enterprise, socket Docker chỉ đọc, bộ gom che PII', () => {
    const c = read('docker-compose.optional.yml')
    assert.match(c, /victorialogs:[\s\S]*?"127\.0\.0\.1:9428:9428"/)
    assert.match(c, /victoriametrics\/victoria-logs:v\d+\.\d+\.\d+ /)
    assert.doesNotMatch(c, /victoria-logs:[^\s]*enterprise/)
    assert.match(c, /timberio\/vector:\d+\.\d+\.\d+-alpine/)
    assert.match(c, /docker\.sock:\/var\/run\/docker\.sock:ro/)
    const v = read('infra/vector/vector.yaml')
    for (const tag of ['[EMAIL]', '[SỐ THẺ]', '[CCCD]', '[SĐT]']) assert.ok(v.includes(tag), tag)
  })

  test('TRACE-03 một yêu cầu đi qua cổng tới workflow-bridge: tìm theo mã truy vết thấy nhật ký của cả hai dịch vụ', { skip: logsSkip, timeout: 60_000 }, async () => {
    const id = `trace-${uid()}`
    assert.equal((await call('director1', '/ngsi-ld/v1/entities?type=Device', { 'x-request-id': id })).status, 200)
    const rows = await until(async () => {
      const r = await logs(`request_id:"${id}"`)
      return new Set(r.map((x) => x.service)).size >= 2 ? r : null
    }, 'nhật ký của apisix và workflow-bridge có cùng mã truy vết', 30_000)
    const by = Object.fromEntries(rows.map((r) => [r.service, r]))
    assert.equal(by.apisix.path, '/ngsi-ld/v1/entities')
    assert.equal(by['workflow-bridge'].path, '/ngsi-ld/v1/entities')
    assert.equal(String(by['workflow-bridge'].status), '200')
  })

  test('TRACE-04 nhật ký không lưu PII hay token: email, số điện thoại trong đường dẫn bị che ở cả cổng lẫn bridge; không có chuỗi truy vấn và tiêu đề xác thực', { skip: logsSkip, timeout: 60_000 }, async () => {
    const id = `pii-${uid()}`
    const token = await login('director1')
    await call('director1', `/ngsi-ld/v1/entities/${encodeURIComponent('an.nguyen@congty.vn-0912345678')}?token=bimat`, { 'x-request-id': id })
    const rows = await until(async () => { const r = await logs(`request_id:"${id}"`); return r.length >= 2 ? r : null }, 'nhật ký của yêu cầu có PII', 30_000)
    for (const r of rows) {
      const raw = JSON.stringify(r)
      for (const bad of ['an.nguyen@congty.vn', '0912345678', 'bimat', token.slice(-20)]) assert.ok(!raw.includes(bad), `${r.service} lộ ${bad}`)
      assert.match(r.path, /\[EMAIL\]/)
    }
  })
})
