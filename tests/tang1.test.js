// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đề thi mục 3: nền tảng lõi (Tầng 1) PHẢI có Định danh/SSO, Cổng API, Quản trị dữ liệu cấu trúc và phi cấu trúc,
// Động cơ luồng công việc, và hoàn toàn không có giao diện (headless).
// Mỗi nhóm có ca thuận và ca nghịch (kẻ tấn công, người dùng sai quyền, dữ liệu xấu).
// Mã ca: T1-<dịch vụ>-<số>, dùng để đối chiếu trong docs/KIEM_THU.md.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import net from 'node:net'
import { readFileSync } from 'node:fs'
import { KC, GW, WEB, ROOT, login, as, gqlRaw, publishApp, submit, act, waitStatus, status, sql, until, b64u, run } from './lib.js'

const jwt = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'))
const open = (port) => new Promise((ok) => {
  const s = net.connect({ port, host: '127.0.0.1', timeout: 1500 })
  s.on('connect', () => { s.destroy(); ok(true) }).on('error', () => ok(false)).on('timeout', () => { s.destroy(); ok(false) })
})
const tokenUrl = `${KC}/realms/dxlab/protocol/openid-connect/token`
const form = (o) => ({ method: 'POST', body: new URLSearchParams(o) })

function env() {
  return Object.fromEntries(readFileSync(`${ROOT}/.env`, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
}
async function adminToken() {
  const e = env()
  const r = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, form({ grant_type: 'password', client_id: 'admin-cli', username: e.KEYCLOAK_ADMIN, password: e.KEYCLOAK_ADMIN_PASSWORD }))
  return (await r.json()).access_token
}

describe('T1-SSO: Định danh và đăng nhập một lần (Keycloak, OIDC)', () => {
  test('T1-SSO-01 công bố cấu hình OIDC chuẩn, có JWKS', async () => {
    const d = await (await fetch(`${KC}/realms/dxlab/.well-known/openid-configuration`)).json()
    for (const k of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri', 'end_session_endpoint']) assert.ok(d[k], k)
    assert.ok(d.code_challenge_methods_supported.includes('S256'), 'hỗ trợ PKCE S256')
    const jwks = await (await fetch(d.jwks_uri)).json()
    assert.ok(jwks.keys.some((k) => k.alg === 'RS256' && k.use === 'sig'))
  })
  test('T1-SSO-02 token chứa danh tính và vai trò, ký RS256, sống ngắn', async () => {
    const t = await login('manager1')
    const h = JSON.parse(Buffer.from(t.split('.')[0], 'base64url'))
    const c = jwt(t)
    assert.equal(h.alg, 'RS256')
    assert.match(c.iss, /\/realms\/dxlab$/)
    assert.ok(c.exp - c.iat <= 900, `thời hạn token ${c.exp - c.iat}s phải ≤ 15 phút`)
    assert.ok(c.realm_access.roles.includes('manager'), 'vai trò nằm trong token')
    assert.ok(c.sub)
  })
  test('T1-SSO-03 sai mật khẩu và người dùng không tồn tại bị từ chối, không lộ ai có thật', async () => {
    const f = (u) => fetch(tokenUrl, form({ grant_type: 'password', client_id: 'dxlab-cli', username: u, password: 'sai-mat-khau' }))
    const [a, b] = [await f('staff1'), await f('khong-ton-tai')]
    assert.equal(a.status, 401)
    assert.equal(b.status, 401)
    assert.equal((await a.json()).error_description, (await b.json()).error_description)
  })
  test('T1-SSO-04 ứng dụng web (client công khai) không nhận mật khẩu trực tiếp', async () => {
    const r = await fetch(tokenUrl, form({ grant_type: 'password', client_id: 'dxlab-app', username: 'staff1', password: 'dxlab-dev' }))
    assert.notEqual(r.status, 200)
  })
  test('T1-SSO-05 client công khai bắt buộc PKCE: thiếu code_challenge bị từ chối', async () => {
    const r = await fetch(`${KC}/realms/dxlab/protocol/openid-connect/auth?client_id=dxlab-app&response_type=code&redirect_uri=http://localhost:3000/&scope=openid`, { redirect: 'manual' })
    assert.ok((r.status === 302 && /error=/.test(r.headers.get('location') ?? '')) || r.status === 400, `trạng thái ${r.status}`)
  })
  test('T1-SSO-06 redirect_uri lạ bị từ chối (chống chuyển hướng độc hại)', async () => {
    const r = await fetch(`${KC}/realms/dxlab/protocol/openid-connect/auth?client_id=dxlab-app&response_type=code&redirect_uri=https://evil.example/&scope=openid&code_challenge=x&code_challenge_method=S256`, { redirect: 'manual' })
    assert.ok(r.status === 400 || /error/i.test(r.headers.get('location') ?? ''), `trạng thái ${r.status}`)
  })
  test('T1-SSO-07 chống dò mật khẩu: bật khóa tạm thời khi sai nhiều lần (brute-force detection)', async () => {
    const realm = await (await fetch(`${KC}/admin/realms/dxlab`, { headers: { authorization: `Bearer ${await adminToken()}` } })).json()
    assert.equal(realm.bruteForceProtected, true)
  })
  test('T1-SSO-08 xác thực đa yếu tố (TOTP) có trong luồng đăng nhập (bắt buộc hoặc theo điều kiện)', async () => {
    const h = { authorization: `Bearer ${await adminToken()}` }
    const execs = await (await fetch(`${KC}/admin/realms/dxlab/authentication/flows/browser/executions`, { headers: h })).json()
    assert.ok(execs.some((e) => /otp/i.test(`${e.providerId} ${e.displayName}`) && e.requirement !== 'DISABLED'), 'không có bước OTP đang bật')
  })
  test('T1-SSO-10 MFA bắt buộc cho trưởng phòng và giám đốc, nhân viên chỉ cần mật khẩu (đi qua luồng đăng nhập trình duyệt thật)', async () => {
    // Đăng nhập bằng mật khẩu ở trang đăng nhập của Keycloak rồi xem bước kế tiếp là gì.
    const next = async (username) => {
      const jar = new Map()
      const keep = (res) => { for (const c of res.headers.getSetCookie()) jar.set(c.split('=')[0], c.split(';')[0]) }
      const cookie = () => [...jar.values()].join('; ')
      const auth = await fetch(`${KC}/realms/dxlab/protocol/openid-connect/auth?client_id=dxlab-app&response_type=code&scope=openid&redirect_uri=http://localhost:3000/&code_challenge=${createHash('sha256').update('x'.repeat(43)).digest('base64url')}&code_challenge_method=S256`, { redirect: 'manual' })
      keep(auth)
      const html = await auth.text()
      const action = html.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&')
      const res = await fetch(action, { method: 'POST', redirect: 'manual', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username, password: 'dxlab-dev', credentialId: '' }) })
      return { status: res.status, location: res.headers.get('location') ?? '', body: res.status === 200 ? await res.text() : '' }
    }
    for (const user of ['manager1', 'director1']) {
      const r = await next(user)
      assert.match(r.location, /required-action\?execution=CONFIGURE_TOTP/, `${user} phải bị chuyển sang bước thiết lập OTP, nhận ${r.status} ${r.location}`)
      assert.ok(!/code=/.test(r.location), `${user} không được nhận mã đăng nhập khi chưa có OTP`)
    }
    const staff = await next('staff1')
    assert.equal(staff.status, 302, `nhân viên phải đăng nhập thẳng; nhận ${staff.status}: ${staff.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400)}`)
    assert.match(staff.location, /code=/, 'nhân viên đăng nhập thẳng bằng mật khẩu')
  })
  test('T1-SSO-09 đăng xuất thu hồi phiên làm mới', async () => {
    const { refresh_token } = await (await fetch(tokenUrl, form({ grant_type: 'password', client_id: 'dxlab-cli', username: 'staff2', password: 'dxlab-dev' }))).json()
    const out = await fetch(`${KC}/realms/dxlab/protocol/openid-connect/logout`, form({ client_id: 'dxlab-cli', refresh_token }))
    assert.ok(out.status < 300)
    const again = await fetch(tokenUrl, form({ grant_type: 'refresh_token', client_id: 'dxlab-cli', refresh_token }))
    assert.equal(again.status, 400)
  })
})

describe('T1-GW: Cổng API (Apache APISIX), mô hình không tin cậy tại biên', () => {
  const q = JSON.stringify({ query: '{ app { key } }' })
  const post = (headers) => fetch(`${GW}/v1/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: q })

  test('T1-GW-01 thiếu token → 401', async () => assert.equal((await post({})).status, 401))
  test('T1-GW-02 token rác → 401', async () => assert.equal((await post({ authorization: 'Bearer abc.def.ghi' })).status, 401))
  test('T1-GW-03 token alg=none (giả mạo kinh điển) → 401', async () => {
    const t = await login('staff1')
    const forged = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u(jwt(t))}.`
    assert.equal((await post({ authorization: `Bearer ${forged}`, 'x-hasura-role': 'director' })).status, 401)
  })
  test('T1-GW-04 token bị sửa nội dung (nâng vai trò), giữ chữ ký cũ → 401', async () => {
    const t = await login('staff1')
    const [h, , s] = t.split('.')
    const c = jwt(t)
    c.realm_access.roles = ['director']
    assert.equal((await post({ authorization: `Bearer ${h}.${b64u(c)}.${s}` })).status, 401)
  })
  test('T1-GW-05 tấn công nhầm thuật toán: HS256 ký bằng khóa công khai → 401', async () => {
    const jwks = await (await fetch(`${KC}/realms/dxlab/protocol/openid-connect/certs`)).json()
    const head = b64u({ alg: 'HS256', typ: 'JWT' })
    const body = b64u(jwt(await login('staff1')))
    const sig = createHmac('sha256', JSON.stringify(jwks.keys[0])).update(`${head}.${body}`).digest('base64url')
    assert.equal((await post({ authorization: `Bearer ${head}.${body}.${sig}` })).status, 401)
  })
  test('T1-GW-06 vai trò không có trong token (x-hasura-role: admin) bị từ chối', async () => {
    const r = await gqlRaw(await login('staff1'), '{ app { key } }', undefined, 'admin')
    assert.ok(r.body.errors)
    assert.ok(!r.body.data?.app)
  })
  test('T1-GW-07 không mạo danh quản trị bằng x-hasura-admin-secret qua cổng', async () => {
    const res = await fetch(`${GW}/v1/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await login('staff1')}`, 'x-hasura-admin-secret': 'dxlab', 'x-hasura-role': 'admin' }, body: q })
    const j = await res.json()
    assert.ok(j.errors || res.status >= 400)
  })
  test('T1-GW-08 CORS: chỉ origin của ứng dụng được phép', async () => {
    const ok = await fetch(`${GW}/v1/graphql`, { method: 'OPTIONS', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST' } })
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:3000')
    const bad = await fetch(`${GW}/v1/graphql`, { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } })
    assert.notEqual(bad.headers.get('access-control-allow-origin'), 'https://evil.example')
    assert.notEqual(bad.headers.get('access-control-allow-origin'), '*')
  })
  test('T1-GW-09 chỉ các đường dẫn đã khai báo đi qua cổng; không lộ dịch vụ nội bộ', async () => {
    const t = await login('staff1')
    for (const p of ['/', '/console', '/v1/metadata', '/v2/query', '/service/repository/deployments', '/healthz', '/.env', '/actuator']) {
      const post = p === '/v1/metadata' || p === '/v2/query'
      const r = await fetch(`${GW}${p}`, { method: post ? 'POST' : 'GET', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: post ? '{}' : undefined })
      assert.ok([401, 404].includes(r.status), `${p} → ${r.status}`)
    }
  })
  test('T1-GW-10 thân yêu cầu GraphQL quá lớn không làm treo hệ thống', async () => {
    const t = await login('staff1')
    const big = JSON.stringify({ query: `{ app { key } } #${'a'.repeat(3 << 20)}` })
    await fetch(`${GW}/v1/graphql`, { method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', 'x-hasura-role': 'staff' }, body: big })
    assert.equal((await as('staff1', '{ app { key } }')).status, 200)
  })
  test('T1-GW-11 truy vấn lồng sâu cố ý làm quá tải bị hạn chế (depth/node limit)', async () => {
    const deep = (n) => (n ? `submission { events { submission { ${deep(n - 1)} } } }` : 'id')
    const r = await as('manager1', `{ submission(limit: 50) { ${deep(12)} } }`)
    assert.ok(r.errors, 'truy vấn lồng 12 tầng phải bị chặn')
  })
  test('T1-GW-12 giới hạn tần suất: tràn yêu cầu bị chặn 429, sau đó khôi phục', async () => {
    const t = await login('staff1')
    const hit = () => fetch(`${GW}/files/00000000-0000-0000-0000-000000000000`, { headers: { authorization: `Bearer ${t}` } }).then((r) => r.status)
    const codes = []
    for (let i = 0; i < 70; i += 1) codes.push(await hit())
    assert.ok(codes.includes(429), `không thấy 429 trong ${codes.length} yêu cầu`)
    await new Promise((r) => setTimeout(r, 61_000))
    assert.notEqual(await hit(), 429)
  })
})

describe('T1-HL: Headless — lõi không có giao diện người dùng', () => {
  test('T1-HL-01 chỉ ba cổng mở ra máy chủ: web, cổng API, đăng nhập', () => {
    const rows = run('docker', ['compose', 'ps', '--format', 'json']).trim().split('\n').map((l) => JSON.parse(l))
    const ports = [...new Set(rows.flatMap((r) => (r.Publishers ?? []).filter((p) => p.PublishedPort > 0).map((p) => p.PublishedPort)))].sort((a, b) => a - b)
    assert.deepEqual(ports, [3000, 8081, 9080])
  })
  test('T1-HL-02 Hasura, PostgreSQL, S3, Flowable không tới được từ ngoài', async () => {
    // Cổng 8080 trên máy chủ có thể thuộc chương trình khác của người dùng; việc không công bố cổng đã kiểm ở T1-HL-01.
    for (const port of [5432, 8333, 8888, 9333, 7333]) assert.equal(await open(port), false, `cổng ${port} đang mở`)
  })
  test('T1-HL-03 Hasura console tắt', () => {
    const code = run('docker', ['compose', 'exec', '-T', 'workflow-bridge', 'node', '-e',
      "fetch('http://hasura:8080/console').then(r=>console.log(r.status)).catch(()=>console.log('down'))"]).trim()
    assert.equal(code, '404')
  })
  test('T1-HL-04 Keycloak chạy chế độ production, không phải dev', () => {
    const logs = run('docker', ['compose', 'logs', 'keycloak', '--no-color'])
    assert.ok(!/Profile dev activated/i.test(logs))
    assert.match(logs, /Profile\(s\) prod activated|Profile prod activated|production/i)
  })
})

describe('T1-DB: Quản trị dữ liệu có cấu trúc (PostgreSQL + Hasura)', () => {
  test('T1-DB-01 phân quyền theo dòng: nhân viên chỉ thấy hồ sơ của mình, trưởng phòng thấy tất cả', async () => {
    const app = await publishApp()
    const a = await submit('staff1', app, { so_tien: 1000 })
    const b = await submit('staff2', app, { so_tien: 2000 })
    const mine = await as('staff1', 'query($a: String!) { submission(where: {app_key: {_eq: $a}}) { id } }', { a: app })
    assert.deepEqual(mine.data.submission.map((s) => s.id), [a.data.insert_submission_one.id])
    const peek = await as('staff1', 'query($i: uuid!) { submission_by_pk(id: $i) { id } }', { i: b.data.insert_submission_one.id })
    assert.equal(peek.data.submission_by_pk, null)
    const mgr = await as('manager1', 'query($a: String!) { submission(where: {app_key: {_eq: $a}}) { id } }', { a: app })
    assert.equal(mgr.data.submission.length, 2)
  })
  test('T1-DB-02 không gửi hồ sơ thay người khác (submitter_id bị ràng buộc theo token)', async () => {
    const app = await publishApp()
    const r = await as('staff1', 'mutation($o: submission_insert_input!) { insert_submission_one(object: $o) { id } }', { o: { app_key: app, data: { so_tien: 1 }, submitter_id: '00000000-0000-0000-0000-000000000001' } })
    assert.ok(r.errors)
  })
  test('T1-DB-03 rào chắn dữ liệu: thiếu trường, sai kiểu, trường lạ, null đều bị CSDL từ chối', async () => {
    const app = await publishApp()
    for (const data of [{}, { so_tien: 'nhieu' }, { so_tien: 1, tu_chen: 'x' }, { so_tien: null }, []]) {
      assert.ok((await submit('staff1', app, data)).errors, `phải từ chối ${JSON.stringify(data)}`)
    }
  })
  test('T1-DB-04 chống injection: giá trị nhập độc hại được lưu nguyên văn, không thực thi', async () => {
    const app = await publishApp({ fields: [{ key: 'ghi_chu', label: 'Ghi chú', type: 'text', required: true }], steps: [{ key: 'tp', name: 'Duyệt', role: 'manager' }] })
    const evil = `x'); DROP TABLE submission; --"}{ <script>alert(1)</script>`
    const r = await submit('staff1', app, { ghi_chu: evil })
    assert.ok(r.data?.insert_submission_one?.id, JSON.stringify(r.errors))
    const back = await as('staff1', 'query($i: uuid!) { submission_by_pk(id: $i) { data } }', { i: r.data.insert_submission_one.id })
    assert.equal(back.data.submission_by_pk.data.ghi_chu, evil)
    assert.equal(sql("select to_regclass('public.submission') is not null"), 't')
  })
  test('T1-DB-05 không ai sửa hay xóa hồ sơ và nhật ký qua API', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 1 })).data.insert_submission_one.id
    for (const u of ['staff1', 'manager1', 'director1']) {
      for (const m of [`mutation { delete_submission_by_pk(id: "${s}") { id } }`, `mutation { update_submission_by_pk(pk_columns: {id: "${s}"}, _set: {status: "approved"}) { id } }`, 'mutation { delete_submission_event(where: {}) { affected_rows } }']) {
        assert.ok((await as(u, m)).errors, `${u}: ${m.slice(0, 55)}`)
      }
    }
  })
  test('T1-DB-06 nhật ký kiểm toán bất biến ở tầng CSDL: chủ sở hữu CSDL cũng không sửa/xóa được sự kiện', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 1 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    await act('manager1', s, 'truong_phong', 'approve')
    const works = (q) => { try { sql(q); return true } catch { return false } }
    assert.equal(works(`update submission_event set note = 'sửa lén' where submission_id = '${s}'`), false, 'UPDATE phải bị chặn')
    assert.equal(works(`delete from submission_event where submission_id = '${s}'`), false, 'DELETE phải bị chặn')
  })
  test('T1-DB-07 mỗi hồ sơ ghi phiên bản quy trình lúc gửi; mỗi sự kiện có người thực hiện và thời điểm', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 1 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    await act('manager1', s, 'truong_phong', 'approve', 'ok')
    const r = await as('manager1', 'query($i: uuid!) { submission_by_pk(id: $i) { app_version events { actor_name action created_at } } }', { i: s })
    assert.ok(r.data.submission_by_pk.app_version >= 1)
    assert.ok(r.data.submission_by_pk.events.length >= 1 && r.data.submission_by_pk.events.every((e) => e.actor_name && e.created_at))
  })
})

describe('T1-OBJ: Quản trị dữ liệu phi cấu trúc (kho đối tượng S3, SeaweedFS)', () => {
  let sid
  const upload = async (user, id, body, name = 'bao-cao.bin', type = 'application/octet-stream') => fetch(`${GW}/files`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': user.replace(/\d/g, ''), 'x-submission-id': id, 'x-file-name': encodeURIComponent(name), 'content-type': type },
    body,
  })
  const download = async (user, id) => fetch(`${GW}/files/${id}`, { headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': user.replace(/\d/g, '') } })

  test('chuẩn bị hồ sơ', async () => { sid = (await submit('staff1', await publishApp(), { so_tien: 1 })).data.insert_submission_one.id })

  test('T1-OBJ-01 tải lên rồi tải về: nội dung giống từng byte (SHA-256)', async () => {
    const data = randomBytes(1_500_000)
    const up = await upload('staff1', sid, data)
    assert.ok(up.status === 200 || up.status === 201, await up.clone().text())
    const down = await download('staff1', (await up.json()).id)
    assert.equal(down.status, 200)
    assert.equal(createHash('sha256').update(Buffer.from(await down.arrayBuffer())).digest('hex'), createHash('sha256').update(data).digest('hex'))
  })
  test('T1-OBJ-02 người ngoài hồ sơ không tải được, không đính kèm được; không token → 401', async () => {
    const { id } = await (await upload('staff1', sid, Buffer.from('bí mật'))).json()
    assert.ok([403, 404].includes((await download('staff2', id)).status), 'không được lộ tệp (404 cũng không lộ sự tồn tại)')
    assert.ok((await upload('staff2', sid, Buffer.from('x'))).status >= 400)
    assert.equal((await fetch(`${GW}/files/${id}`)).status, 401)
  })
  test('T1-OBJ-03 giới hạn 10 MB: vượt 1 byte bị từ chối (413), tệp rỗng bị từ chối (400)', async () => {
    assert.equal((await upload('staff1', sid, Buffer.alloc(10 * 1024 * 1024 + 1, 1))).status, 413)
    assert.equal((await upload('staff1', sid, Buffer.alloc(0))).status, 400)
  })
  test('T1-OBJ-04 tên tệp độc hại được làm sạch (không đi lên thư mục cha)', async () => {
    const up = await upload('staff1', sid, Buffer.from('x'), '../../etc/passwd')
    assert.ok(up.status < 300)
    const rows = (await as('staff1', 'query($i: uuid!) { attachment(where: {submission_id: {_eq: $i}}) { name } }', { i: sid })).data.attachment
    assert.ok(rows.every((r) => !/[\\/]/.test(r.name)))
  })
  test('T1-OBJ-05 tệp HTML tải về luôn là tệp đính kèm, không bao giờ được trình duyệt chạy', async () => {
    const up = await upload('staff1', sid, Buffer.from('<script>alert(1)</script>'), 'x.html', 'text/html')
    const d = await download('staff1', (await up.json()).id)
    assert.match(d.headers.get('content-disposition') ?? '', /attachment/)
    assert.equal(d.headers.get('x-content-type-options'), 'nosniff')
    assert.ok(!/html/.test(d.headers.get('content-type') ?? ''))
  })
  test('T1-OBJ-06 kho S3 không truy cập được trực tiếp từ ngoài', async () => {
    assert.equal(await open(8333), false)
    assert.equal(await open(8888), false)
  })
  test('T1-OBJ-09 kho S3 bắt buộc chữ ký SigV4: không ký hoặc ký sai bị 403, chỉ cầu nối có khóa mới đọc/ghi được', () => {
    // Chạy trong container cầu nối (cùng mạng nội bộ với kho S3): thử không ký, ký sai, rồi ký đúng.
    const script = `
      import { s3fetch } from '/app/s3.js'
      const u = 'http://seaweedfs:8333/dxlab/obj09-probe'
      const bad = { authorization: 'AWS4-HMAC-SHA256 Credential=x/20260101/us-east-1/s3/aws4_request, SignedHeaders=host, Signature=00' }
      const out = [(await fetch(u)).status, (await fetch(u, { method: 'PUT', body: 'x' })).status, (await fetch(u, { headers: bad })).status,
        (await s3fetch('/dxlab/obj09-probe', { method: 'PUT', body: 'ok' })).status, await (await s3fetch('/dxlab/obj09-probe')).text()]
      console.log(JSON.stringify(out))`
    const out = JSON.parse(run('docker', ['compose', 'exec', '-T', 'workflow-bridge', 'node', '--input-type=module', '-e', script]).trim())
    assert.deepEqual(out, [403, 403, 403, 200, 'ok'])
  })
  test('T1-OBJ-07 tải lên lỗi không để lại dòng dữ liệu mồ côi', async () => {
    const count = () => sql(`select count(*) from attachment where submission_id = '${sid}'`)
    const before = count()
    assert.equal((await upload('staff1', sid, Buffer.alloc(10 * 1024 * 1024 + 1, 1))).status, 413)
    assert.equal(count(), before)
  })
  test('T1-OBJ-08 kiểm dịch mã độc tại biên: tệp thử EICAR bị từ chối khi tải lên', async () => {
    const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
    const r = await upload('staff1', sid, Buffer.from(eicar), 'eicar.com')
    assert.ok(r.status >= 400, `tệp mã độc thử đã được nhận (${r.status})`)
  })
})

describe('T1-WF: Động cơ luồng công việc (Flowable, BPMN)', () => {
  test('T1-WF-01 mỗi quy trình xuất bản được triển khai thành định nghĩa BPMN thật trong Flowable', async () => {
    const app = await publishApp()
    await until(() => Number(sql(`select count(*) from act_re_procdef where key_ like '%${app}%'`, 'flowable')) >= 1, 'định nghĩa BPMN')
  })
  test('T1-WF-02 nhánh thấp (≤ 5 triệu): trưởng phòng → kế toán, bỏ qua giám đốc', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 3_000_000 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { status: 'running', current_step: 'truong_phong', waiting_role: 'manager' })
    assert.ok(!(await act('manager1', s, 'truong_phong', 'approve')).errors)
    await waitStatus('manager1', s, { current_step: 'chi_tien', waiting_role: 'accountant' })
    assert.ok(!(await act('accountant1', s, 'chi_tien', 'done')).errors)
    await waitStatus('staff1', s, { status: 'approved' })
  })
  test('T1-WF-03 nhánh cao (> 5 triệu): phải qua giám đốc rồi mới tới kế toán', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 9_000_000 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    await act('manager1', s, 'truong_phong', 'approve')
    await waitStatus('director1', s, { current_step: 'giam_doc', waiting_role: 'director' })
    await act('director1', s, 'giam_doc', 'approve')
    await waitStatus('manager1', s, { current_step: 'chi_tien' })
  })
  test('T1-WF-04 từ chối kết thúc quy trình và bắt buộc có lý do', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 100 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    assert.ok((await act('manager1', s, 'truong_phong', 'reject')).errors, 'từ chối không lý do phải bị chặn')
    assert.ok(!(await act('manager1', s, 'truong_phong', 'reject', 'Thiếu chứng từ')).errors)
    await waitStatus('staff1', s, { status: 'rejected' })
  })
  test('T1-WF-05 chặn sai người: nhân viên, giám đốc, kế toán không duyệt thay bước của trưởng phòng', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 100 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    for (const u of ['staff1', 'staff2', 'director1', 'accountant1']) assert.ok((await act(u, s, 'truong_phong', 'approve')).errors, `${u} không được duyệt`)
    assert.equal((await status('manager1', s)).current_step, 'truong_phong')
  })
  test('T1-WF-06 chặn sai thứ tự: không nhảy cóc sang bước sau', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 9_000_000 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    assert.ok((await act('director1', s, 'giam_doc', 'approve')).errors, 'giám đốc duyệt trước trưởng phòng')
    assert.ok((await act('accountant1', s, 'chi_tien', 'done')).errors, 'kế toán chi tiền trước khi duyệt')
  })
  test('T1-WF-07 không duyệt lại bước cũ; không tác động lên hồ sơ đã kết thúc', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 100 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    await act('manager1', s, 'truong_phong', 'approve')
    await waitStatus('manager1', s, { current_step: 'chi_tien' })
    assert.ok((await act('manager1', s, 'truong_phong', 'approve')).errors, 'duyệt lại bước cũ')
    await act('accountant1', s, 'chi_tien', 'done')
    await waitStatus('staff1', s, { status: 'approved' })
    assert.ok((await act('accountant1', s, 'chi_tien', 'done')).errors, 'tác động lên hồ sơ đã xong')
  })
  test('T1-WF-08 người gửi là trưởng phòng không tự duyệt hồ sơ của chính mình', async () => {
    const app = await publishApp()
    const s = (await submit('manager1', app, { so_tien: 100 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    assert.ok((await act('manager1', s, 'truong_phong', 'approve')).errors, 'tự duyệt hồ sơ của mình')
  })
  test('T1-WF-09 chịu tải: 20 hồ sơ nộp đồng thời đều vào quy trình, không mất hồ sơ nào', async () => {
    const app = await publishApp()
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => submit(i % 2 ? 'staff1' : 'staff2', app, { so_tien: i * 1_000_000 })))
    assert.ok(rs.every((r) => r.data?.insert_submission_one?.id), JSON.stringify(rs.find((r) => !r.data?.insert_submission_one)))
    await until(() => Number(sql(`select count(*) from submission where app_key = '${app}' and status = 'running' and current_step is not null`)) === 20, 'cả 20 hồ sơ vào quy trình', 90_000)
  })
})

describe('T1-WEB: Máy chủ web (Tầng 2) bảo vệ cơ bản', () => {
  test('T1-WEB-01 trang chủ phục vụ được; config.json không lộ bí mật', async () => {
    assert.equal((await fetch(WEB)).status, 200)
    const cfg = await (await fetch(`${WEB}/config.json`)).text()
    assert.ok(!/secret|password|api[_-]?key/i.test(cfg), cfg)
  })
  test('T1-WEB-02 tiêu đề bảo mật: nosniff, chống nhúng khung, CSP, Referrer-Policy', async () => {
    const h = (await fetch(WEB)).headers
    assert.equal(h.get('x-content-type-options'), 'nosniff')
    assert.ok(h.get('x-frame-options') || /frame-ancestors/.test(h.get('content-security-policy') ?? ''), 'chống clickjacking')
    assert.ok(h.get('content-security-policy'), 'Content-Security-Policy')
    assert.ok(h.get('referrer-policy'), 'Referrer-Policy')
  })
  test('T1-WEB-03 không lộ tệp cấu hình hay tệp ẩn', async () => {
    for (const p of ['/.env', '/.git/config', '/nginx.conf', '/docker-compose.yml']) {
      const body = await (await fetch(`${WEB}${p}`)).text()
      assert.ok(!/POSTGRES_PASSWORD|\[core\]|services:/.test(body), `${p} lộ nội dung`)
    }
  })
})
