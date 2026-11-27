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
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { ROOT, GW, ROLE, login, until, uid, run } from './lib.js'

const LOGS = process.env.LOGS_URL ?? 'http://127.0.0.1:9428'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const logsSkip = process.env.LOGS_OPTIONAL ? false : 'đặt LOGS_OPTIONAL=1 sau khi bật profile logs'
const logs = async (query) => (await (await fetch(`${LOGS}/select/logsql/query`, { method: 'POST', body: new URLSearchParams({ query }) })).text())
  .split('\n').filter(Boolean).map((l) => JSON.parse(l))
const call = async (user, path, headers = {}) => fetch(`${GW}${path}`, { headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user], ...headers } })

describe('TRACE: nhật ký tập trung và mã truy vết (Z-11)', () => {
  test('TRACE-01 cổng API gắn mã truy vết cho mọi yêu cầu, giữ mã đúng dạng do bên gọi gửi, trả lại trong phản hồi (kể cả khi bị từ chối 401)', async () => {
    const res = await fetch(`${GW}/ngsi-ld/v1/entities`)
    assert.equal(res.status, 401)
    assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/)
    const mine = `ca-thu-${uid()}`
    assert.equal((await fetch(`${GW}/ngsi-ld/v1/entities`, { headers: { 'x-request-id': mine } })).headers.get('x-request-id'), mine)
  })

  test('TRACE-01b (nghịch) mã truy vết sai dạng (ký tự lạ, quá dài, gửi hai lần) bị cổng thay bằng UUID mới, không lọt vào nhật ký', async () => {
    const id = (headers) => fetch(`${GW}/ngsi-ld/v1/entities`, { headers }).then((r) => r.headers.get('x-request-id'))
    for (const bad of ['xau<script>', 'a'.repeat(129), 'hai tu', '{"a":1}']) assert.match(await id({ 'x-request-id': bad }), /^[0-9a-f-]{36}$/, bad)
    const twice = new Headers([['x-request-id', 'mot'], ['x-request-id', 'hai']])
    assert.match(await id(twice), /^[0-9a-f-]{36}$/)
    assert.ok(read('infra/apisix/apisix.yaml').match(/^global_rules:/gm).length === 1, 'apisix.yaml chỉ có một khóa global_rules (khóa trùng sẽ đè nhau)')
  })

  test('TRACE-02 cấu hình: kho nhật ký chỉ mở trên 127.0.0.1, ảnh ghim phiên bản không dùng bản enterprise, socket Docker chỉ đọc, bộ gom che PII', () => {
    const c = read('docker-compose.optional.yml')
    assert.match(c, /victorialogs:[\s\S]*?"127\.0\.0\.1:9428:9428"/)
    assert.match(c, /victoriametrics\/victoria-logs:v\d+\.\d+\.\d+ /)
    assert.doesNotMatch(c, /victoria-logs:[^\s]*enterprise/)
    assert.match(c, /timberio\/vector:\d+\.\d+\.\d+-alpine/)
    assert.match(c, /docker\.sock:\/var\/run\/docker\.sock:ro/)
    const v = read('infra/vector/vector.yaml')
    for (const tag of ['[EMAIL]', '[SỐ THẺ]', '[CCCD]', '[SĐT]', 'Bearer [TOKEN]', '[JWT]', '[VAULT TOKEN]', '[COOKIE]']) assert.ok(v.includes(tag), tag)
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

  test('TRACE-05 nhật ký không lưu bí mật: token Bearer, JWT, token Vault lỡ nằm trong đường dẫn bị che ở cả cổng lẫn bridge', { skip: logsSkip, timeout: 60_000 }, async () => {
    const id = `secret-${uid()}`
    const token = await login('director1')
    const vault = `hvs.${'A1b2C3d4'.repeat(4)}`
    await call('director1', `/ngsi-ld/v1/entities/${encodeURIComponent(`${vault} Bearer ${token} ${token}`)}`, { 'x-request-id': id })
    const rows = await until(async () => { const r = await logs(`request_id:"${id}"`); return r.length >= 2 ? r : null }, 'nhật ký của yêu cầu có bí mật', 30_000)
    for (const r of rows) {
      const raw = JSON.stringify(r)
      for (const bad of [token.split('.')[1].slice(0, 20), token.slice(-20), vault]) assert.ok(!raw.includes(bad), `${r.service} lộ bí mật`)
      assert.match(r.path, /\[VAULT TOKEN\] Bearer \[TOKEN\]/)
    }
    assert.match(rows.find((r) => r.service === 'apisix').path, /\[JWT\]/, 'JWT đứng riêng (không có chữ Bearer) cũng bị che')
  })
})

// Trục sự kiện: máy kiểm thử nghe NATS qua cổng 127.0.0.1:4222 bằng chính máy khách tối giản của bridge.
const streamSkip = process.env.STREAM_OPTIONAL ? false : 'đặt STREAM_OPTIONAL=1 sau khi bật profile stream và NATS_URL=nats://nats:4222'
const NATS = process.env.NATS_TEST_URL ?? 'nats://127.0.0.1:4222'
const TOKEN = process.env.NATS_TOKEN ?? 'change-me'
const ONE_STEP = { fields: [{ key: 'so_tien', label: 'Số tiền', type: 'number', required: true }], steps: [{ key: 'truong_phong', name: 'Trưởng phòng duyệt', role: 'manager' }] }
const compose = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.optional.yml', '--profile', 'stream']

describe('STREAM: trục sự kiện NATS JetStream theo mẫu outbox (Z-11)', { skip: streamSkip }, () => {
  let natsConnect
  let jsPublish
  let nc
  const got = []
  async function approved(amount) {
    const { publishApp, submit, act, waitStatus } = await import('./lib.js')
    const app = await publishApp(ONE_STEP)
    const id = (await submit('staff1', app, { so_tien: amount })).data.insert_submission_one.id
    await waitStatus('manager1', id, { current_step: 'truong_phong' })
    assert.ok(!(await act('manager1', id, 'truong_phong', 'approve')).errors)
    await waitStatus('staff1', id, { status: 'approved' })
    return id
  }

  test('STREAM-01 duyệt hồ sơ thì có tin trên chủ đề dx.<tổ chức>.submission.approve, đúng hồ sơ, không chứa dữ liệu biểu mẫu', { timeout: 90_000 }, async () => {
    ;({ natsConnect, jsPublish } = await import('../services/workflow-bridge/stream.js'))
    nc = await natsConnect(NATS, TOKEN)
    nc.subscribe('dx.default.submission.>', (m) => got.push({ subject: m.subject, data: JSON.parse(m.data) }))
    const id = await approved(7_310_000)
    const msg = await until(() => got.find((m) => m.data.submission_id === id), 'tin sự kiện của hồ sơ vừa duyệt', 30_000)
    assert.equal(msg.subject, 'dx.default.submission.approve')
    assert.deepEqual([msg.data.org, msg.data.action, msg.data.step_key], ['default', 'approve', 'truong_phong'])
    assert.ok(!JSON.stringify(msg.data).includes('7310000'), 'tin lộ dữ liệu biểu mẫu')
  })

  test('STREAM-02 tin được lưu và phát lại được; phát lại cùng mã sự kiện thì JetStream báo trùng, không thêm tin', { timeout: 60_000 }, async () => {
    const last = got.at(-1)
    const res = JSON.parse((await nc.request('$JS.API.STREAM.MSG.GET.DX', JSON.stringify({ last_by_subj: last.subject }))).data)
    assert.equal(JSON.parse(Buffer.from(res.message.data, 'base64').toString()).event_id, last.data.event_id)
    const info = async () => JSON.parse((await nc.request('$JS.API.STREAM.INFO.DX', '')).data).state.messages
    const before = await info()
    const ack = await jsPublish(nc, last.subject, last.data, `submission_event:${last.data.event_id}`)
    assert.equal(ack.duplicate, true)
    assert.equal(await info(), before)
  })

  test('STREAM-03 NATS tắt thì việc duyệt vẫn chạy; bật lại thì tin bù tới (outbox); sai token thì không kết nối được', { timeout: 240_000 }, async () => {
    nc.close()
    run('docker', [...compose, 'stop', 'nats'])
    let id
    try {
      id = await approved(1_000)
    } finally {
      run('docker', [...compose, 'start', 'nats'])
    }
    await until(async () => { try { nc = await natsConnect(NATS, TOKEN); return true } catch { return false } }, 'NATS chạy lại', 60_000)
    // Tin lúc NATS tắt đã nằm trong JetStream (bridge phát bù) dù lúc đó không ai nghe: đọc lại theo chủ đề.
    await until(async () => {
      const r = JSON.parse((await nc.request('$JS.API.STREAM.MSG.GET.DX', JSON.stringify({ last_by_subj: 'dx.default.submission.approve' }))).data)
      return r.message && JSON.parse(Buffer.from(r.message.data, 'base64').toString()).submission_id === id
    }, 'tin của hồ sơ duyệt lúc NATS tắt được phát bù', 90_000)
    nc.close()
    await assert.rejects(natsConnect(NATS, 'sai-token').then((c) => c.request('$JS.API.INFO', '')), /NATS|ECONNRESET|đóng/)
  })

  test('STREAM-04 giao dịch commit trễ (id nhỏ hơn sự kiện đã phát) vẫn được phát, không bị bỏ sót', { timeout: 120_000 }, async () => {
    const { publishApp, submit, waitStatus, sql } = await import('./lib.js')
    const late = []
    nc = await natsConnect(NATS, TOKEN)
    nc.subscribe('dx.default.submission.>', (m) => late.push(JSON.parse(m.data)))
    const app = await publishApp(ONE_STEP)
    const slow = (await submit('staff1', app, { so_tien: 1 })).data.insert_submission_one.id
    await waitStatus('manager1', slow, { current_step: 'truong_phong' })
    // Giao dịch giữ 12 giây: lấy id sự kiện trước, commit sau một lần duyệt khác đã được phát.
    const held = spawn('docker', [...compose, 'exec', '-T', 'postgres', 'psql', '-U', 'dxlab', '-d', 'dxlab', '-v', 'ON_ERROR_STOP=1', '-c',
      `BEGIN; INSERT INTO submission_event (submission_id, step_key, action, actor_id, actor_name) VALUES ('${slow}', 'truong_phong', 'approve', 'ca-thu-stream-04', 'Ca thử'); SELECT pg_sleep(12); COMMIT;`], { cwd: ROOT, stdio: 'ignore' })
    const finished = new Promise((ok) => held.on('exit', ok))
    await new Promise((ok) => setTimeout(ok, 1500))
    const fast = await approved(2_000)
    const first = await until(() => late.find((m) => m.submission_id === fast), 'tin của lần duyệt nhanh', 30_000)
    assert.equal(await finished, 0, 'giao dịch giữ chậm phải commit được')
    const slowMsg = await until(() => late.find((m) => m.submission_id === slow), 'tin của giao dịch commit trễ', 30_000)
    assert.ok(slowMsg.event_id < first.event_id, `sự kiện commit trễ có id nhỏ hơn (${slowMsg.event_id} < ${first.event_id})`)
    assert.ok(Number(sql("SELECT last_id FROM stream_cursor WHERE name = 'submission_event'")) <= Math.max(slowMsg.event_id, first.event_id))
    nc.close()
  })

  test('STREAM-05 chỉ một bản bridge phát: hợp đồng thuê đang có người giữ thì bản khác không lấy được', async () => {
    const { sql } = await import('./lib.js')
    assert.equal(sql("SELECT holder IS NOT NULL AND lease_until > now() FROM stream_cursor WHERE name = 'submission_event'"), 't')
    assert.match(sql("UPDATE stream_cursor SET holder = 'ban-khac', lease_until = now() + interval '30 seconds' WHERE name = 'submission_event' AND (holder IS NULL OR holder = 'ban-khac' OR lease_until < now()) RETURNING 1"), /UPDATE 0/)
  })
})
