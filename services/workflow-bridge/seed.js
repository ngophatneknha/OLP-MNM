// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Nạp dữ liệu mẫu cho bản demo: xuất bản các quy trình trong /library rồi tạo hồ sơ ở nhiều trạng thái.
// Chạy:  docker compose exec workflow-bridge node seed.js
// Mọi thao tác đi qua đúng đường người dùng thật (token Keycloak -> Hasura), không dùng quyền quản trị,
// nên nhật ký và phân quyền của dữ liệu mẫu giống hệt dữ liệu thật.

import { readdirSync, readFileSync } from 'node:fs'

const KEYCLOAK = 'http://keycloak:8080/realms/dxlab/protocol/openid-connect/token'
const HASURA = 'http://hasura:8080/v1/graphql'
const PASSWORD = 'dxlab-dev' // mật khẩu tài khoản mẫu trong infra/keycloak/realm (chỉ cho phát triển)
const ROLE = { staff1: 'staff', staff2: 'staff', manager1: 'manager', director1: 'director', accountant1: 'accountant' }

const tokens = {}
async function token(user) {
  if (!tokens[user]) {
    const res = await fetch(KEYCLOAK, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'password', client_id: 'dxlab-cli', username: user, password: PASSWORD }),
    })
    if (!res.ok) throw new Error(`Không đăng nhập được ${user}: ${res.status}`)
    tokens[user] = (await res.json()).access_token
    setTimeout(() => delete tokens[user], 240000) // token sống 5 phút; làm mới trước khi hết hạn
  }
  return tokens[user]
}

async function gql(user, query, variables) {
  const res = await fetch(HASURA, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token(user)}`, 'x-hasura-role': ROLE[user], 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`${user}: ${json.errors[0].message}`)
  return json.data
}

async function until(what, check) {
  for (let i = 0; i < 90; i++) {
    const value = await check()
    if (value) return value
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Hết thời gian chờ: ${what}`)
}

const existing = (await gql('manager1', '{ submission(limit: 1) { id } }')).submission
const force = process.argv.includes('--force')

// 1. Xuất bản các quy trình mẫu.
const library = readdirSync('/library').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`/library/${f}`, 'utf8')))
const have = new Set((await gql('manager1', '{ app { key } }')).app.map((a) => a.key))
for (const { key, name, description, category, spec } of library) {
  // Sửa một quy trình đã có phải đi qua đề xuất thay đổi, nên ở đây chỉ tạo cái còn thiếu.
  if (!have.has(key)) await gql('manager1', 'mutation($o: app_insert_input!) { insert_app_one(object: $o) { key } }', { o: { key, name, description, category, spec } })
}
for (const { key } of library) {
  await until(`xuất bản ${key}`, async () => {
    const app = (await gql('manager1', 'query($k: String!) { app_by_pk(key: $k) { status error } }', { k: key })).app_by_pk
    if (app.status === 'error') throw new Error(`${key}: ${app.error}`)
    return app.status === 'published'
  })
  console.log(`Đã xuất bản: ${key}`)
}

// 1b. Một vòng cải tiến quy trình thật: trưởng phòng đề xuất, giám đốc chấp nhận một đề xuất và từ chối một đề xuất,
// để "Xin tạm ứng" có phiên bản 2 và lịch sử quyết định. Làm trước khi tạo hồ sơ nên mọi hồ sơ mẫu chạy bản mới nhất.
{
  const tamUng = library.find((l) => l.key === 'tam_ung')
  const has = (await gql('manager1', 'query($k: String!) { app_change(where: {app_key: {_eq: $k}}, limit: 1) { id } }', { k: 'tam_ung' })).app_change.length
  if (tamUng && !has) {
    const propose = async (note, mutate) => {
      const spec = JSON.parse(JSON.stringify(tamUng.spec)); mutate(spec)
      const id = (await gql('manager1', 'mutation($o: app_change_insert_input!) { insert_app_change_one(object: $o) { id } }', { o: { app_key: 'tam_ung', name: tamUng.name, spec, note } })).insert_app_change_one.id
      await until('kiểm tra tự động của đề xuất', async () => (await gql('manager1', 'query($i: bigint!) { app_change_by_pk(id: $i) { checks } }', { i: id })).app_change_by_pk.checks)
      return id
    }
    const decide = (id, status) => gql('director1', 'mutation($i: bigint!, $s: String!) { update_app_change_by_pk(pk_columns: {id: $i}, _set: {status: $s}) { id } }', { i: id, s: status })
    await decide(await propose('Thêm ô ghi chú để người gửi nói rõ khoản chi, trưởng phòng đỡ phải hỏi lại', (sp) => { sp.fields.push({ key: 'ghi_chu', label: 'Ghi chú thêm', type: 'text', required: false }) }), 'merged')
    await until('phiên bản 2 của Xin tạm ứng', async () => (await gql('manager1', 'query { app_version(where: {app_key: {_eq: "tam_ung"}, version: {_eq: 2}}) { version } }')).app_version.length)
    await decide(await propose('Bỏ bước kế toán chi tiền cho khoản nhỏ', (sp) => { sp.steps.pop() }), 'rejected')
    console.log('Đã tạo vòng cải tiến mẫu cho tam_ung (phiên bản 2, một đề xuất bị từ chối).')
  }
}

// 2. Hồ sơ mẫu: [người gửi, ứng dụng, dữ liệu, các hành động lần lượt [người xử lý, hành động, ghi chú]].
const SUBMISSIONS = [
  ['staff1', 'tam_ung', { so_tien: 3000000, ly_do: 'Công tác Đà Nẵng 2 ngày' }, [['manager1', 'approve'], ['accountant1', 'done', 'Đã chuyển khoản']]],
  ['staff2', 'tam_ung', { so_tien: 12000000, ly_do: 'Đặt cọc thuê hội trường tổng kết năm' }, [['manager1', 'approve'], ['director1', 'approve', 'Đồng ý, lưu ý lấy hóa đơn']]],
  ['staff1', 'tam_ung', { so_tien: 8000000, ly_do: 'Mua quà tặng đối tác' }, [['manager1', 'approve']]],
  ['staff2', 'tam_ung', { so_tien: 1500000, ly_do: 'Tiếp khách' }, [['manager1', 'reject', 'Chưa có kế hoạch tiếp khách được duyệt']]],
  ['staff1', 'tam_ung', { so_tien: 2200000, ly_do: 'Chi phí đi lại gặp đối tác' }, [['manager1', 'approve'], ['accountant1', 'done', 'Đã chuyển khoản']]],
  ['staff2', 'tam_ung', { so_tien: 6500000, ly_do: 'Tạm ứng hội nghị khách hàng' }, [['manager1', 'approve']]], // đủ 6 hồ sơ để số liệu của quy trình này có nghĩa
  ['staff1', 'nghi_phep', { tu_ngay: '2026-11-20', so_ngay: 1, loai: 'Việc riêng' }, [['manager1', 'approve']]],
  ['staff2', 'nghi_phep', { tu_ngay: '2026-12-01', so_ngay: 5, loai: 'Phép năm', ly_do: 'Về quê' }, [['manager1', 'approve']]],
  ['staff1', 'mua_thiet_bi', { ten_thiet_bi: 'Máy in màu văn phòng', loai: 'Máy in', gia_du_kien: 9500000, ly_do: 'Máy cũ hỏng trục cuốn' }, []],
  ['staff2', 'mua_thiet_bi', { ten_thiet_bi: 'Máy trạm dựng video', loai: 'Máy tính', gia_du_kien: 42000000, ly_do: 'Phục vụ sản xuất nội dung' }, [['manager1', 'approve']]],
  ['manager1', 'thanh_toan', { nha_cung_cap: 'Công ty TNHH Văn phòng phẩm An Phát', so_tien: 6400000, so_hoa_don: 'HD-2026-1187' }, [['accountant1', 'approve', 'Chứng từ đủ']]],
]

if (existing.length > 0 && !force) {
  console.log('Đã có hồ sơ trong hệ thống, bỏ qua bước tạo hồ sơ mẫu (thêm --force để vẫn tạo).')
} else {
  const created = []
  for (const [user, app, data, actions] of SUBMISSIONS) {
    const id = (await gql(user,
      'mutation($a: String!, $d: jsonb!) { insert_submission_one(object: {app_key: $a, data: $d}) { id } }', { a: app, d: data })).insert_submission_one.id
    const state = () => gql(user, 'query($id: uuid!) { submission_by_pk(id: $id) { status current_step waiting_role } }', { id }).then((d) => d.submission_by_pk)
    let current = await until(`hồ sơ ${app} vào bước đầu`, async () => { const s = await state(); return s.current_step && s })
    for (const [actor, action, note] of actions) {
      await gql(actor,
        'mutation($o: submission_event_insert_input!) { insert_submission_event_one(object: $o) { id } }',
        { o: { submission_id: id, step_key: current.current_step, action, note: note ?? null } })
      const before = current.current_step
      current = await until(`hồ sơ ${app} rời bước ${before}`, async () => { const s = await state(); return (s.status !== 'running' || s.current_step !== before) && s })
    }
    created.push(id)
    console.log(`Hồ sơ ${app} của ${user}: ${current.status}${current.waiting_role ? `, chờ ${current.waiting_role}` : ''}`)
  }
  // Dàn thời gian của dữ liệu mẫu ra vài ngày với độ chờ khác nhau ở từng bước, để bảng số liệu có chuyện để kể.
  // Chỉ ghi lên đúng các hồ sơ vừa tạo ở trên; giá trị tự sinh, không có dữ liệu ngoài đi vào câu SQL.
  const ids = created.map((id) => `'${id}'`).join(',')
  const run = await fetch(`${HASURA}`.replace('/v1/graphql', '/v2/query'), {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET, 'content-type': 'application/json' },
    // Nhật ký bất biến chặn UPDATE; riêng dữ liệu mẫu do chính lệnh này tạo ra mới được dàn lại thời gian, trong một giao dịch
    // (trigger được bật lại trước khi giao dịch kết thúc, nên không có khoảng hở cho dữ liệu thật).
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: `
      ALTER TABLE submission_event DISABLE TRIGGER submission_event_immutable;
      WITH s AS (SELECT id, row_number() OVER (ORDER BY no) AS rn FROM submission WHERE id IN (${ids})),
      e AS (SELECT se.id, s.id AS sid, s.rn, row_number() OVER (PARTITION BY s.id ORDER BY se.id) AS ord
            FROM submission_event se JOIN s ON s.id = se.submission_id)
      , u1 AS (UPDATE submission SET created_at = now() - interval '1 hour' * (60 + s.rn * 7) FROM s WHERE submission.id = s.id RETURNING 1)
      , u2 AS (UPDATE submission_event SET created_at = now() - interval '1 hour' * (60 + e.rn * 7)
                 + interval '1 hour' * (e.ord * (2 + (e.rn % 5) * 3)) FROM e WHERE submission_event.id = e.id RETURNING 1)
      SELECT 1;
      ALTER TABLE submission_event ENABLE TRIGGER submission_event_immutable;` } }),
  })
  if (!run.ok) throw new Error(`Không dàn được thời gian dữ liệu mẫu: ${await run.text()}`)
  await fetch(`${HASURA}`.replace('/v1/graphql', '/v2/query'), {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: `
      UPDATE submission s SET created_at = s.created_at, finished_at = (SELECT max(created_at) FROM submission_event WHERE submission_id = s.id)
      WHERE id IN (${ids}) AND status <> 'running';` } }),
  })
}

// --ai-demo: cho trợ lý chạy bóng ở bước trưởng phòng của "Xin tạm ứng" trên 12 hồ sơ có người quyết định thật,
// để có bằng chứng thật (không phải số giả) về độ khớp. Cần trợ lý AI đã cấu hình; mỗi hồ sơ gọi AI một lần.
if (process.argv.includes('--ai-demo')) {
  const KEY = 'tam_ung', STEP = 'truong_phong'
  await gql('director1', `mutation { update_step_autonomy_by_pk(pk_columns: {app_key: "${KEY}", step_key: "${STEP}"}, _set: {level: 2}) { level } }`)
  const CASES = [
    [3000000, 'Công tác Hà Nội 2 ngày'], [1500000, 'Mua văn phòng phẩm quý 4'], [4900000, 'abc', 'Lý do chưa rõ'], [4000000, 'Đặt cọc phòng họp khách hàng'],
    [2000000, 'Chi phí đi lại gặp đối tác'], [3000000, '.', 'Lý do chưa rõ'], [3500000, 'Tạm ứng công tác phí Đà Nẵng'], [1000000, 'Mua tem bưu điện gửi hồ sơ'],
    [2000000, 'không có', 'Lý do chưa rõ'], [2500000, 'Sửa máy in phòng kế toán'], [4000000, 'cần gấp', 'Lý do chưa rõ'], [4500000, 'Vé máy bay công tác TP.HCM'],
  ]
  let hits = 0
  for (const [so_tien, ly_do, rejectNote] of CASES) {
    const id = (await gql('staff1', 'mutation($d: jsonb!) { insert_submission_one(object: {app_key: "tam_ung", data: $d}) { id } }', { d: { so_tien, ly_do } })).insert_submission_one.id
    await until('hồ sơ vào bước trưởng phòng', async () => (await gql('manager1', 'query($id: uuid!) { submission_by_pk(id: $id) { current_step } }', { id })).submission_by_pk.current_step === STEP)
    // Chờ trợ lý cho ý kiến (quá 60 giây thì thôi: người vẫn quyết định bình thường, chỉ là lần này không có ý kiến để so).
    await until('ý kiến của trợ lý', async () => (await gql('director1', 'query($id: uuid!) { ai_opinion(where: {submission_id: {_eq: $id}}) { id } }', { id })).ai_opinion.length > 0).catch(() => {})
    await gql('manager1', 'mutation($o: submission_event_insert_input!) { insert_submission_event_one(object: $o) { id } }',
      { o: { submission_id: id, step_key: STEP, action: rejectNote ? 'reject' : 'approve', note: rejectNote ?? null } })
    const op = (await gql('director1', 'query($id: uuid!) { ai_opinion(where: {submission_id: {_eq: $id}}) { decision matched } }', { id })).ai_opinion[0]
    if (op?.matched) hits++
    console.log(`Hồ sơ ${ly_do}: người ${rejectNote ? 'từ chối' : 'duyệt'}, trợ lý ${op ? (op.decision === 'approve' ? 'duyệt' : 'từ chối') : 'không có ý kiến'}${op ? (op.matched ? ' (khớp)' : ' (lệch)') : ''}`)
  }
  console.log(`Độ khớp chạy bóng: ${hits}/${CASES.length}`)
}
console.log('Xong.')
