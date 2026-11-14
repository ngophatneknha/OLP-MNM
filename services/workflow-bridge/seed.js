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
      body: new URLSearchParams({ grant_type: 'password', client_id: 'dxlab-app', username: user, password: PASSWORD }),
    })
    if (!res.ok) throw new Error(`Không đăng nhập được ${user}: ${res.status}`)
    tokens[user] = (await res.json()).access_token
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
for (const { key, name, spec } of library) {
  await gql('manager1',
    'mutation($o: app_insert_input!) { insert_app_one(object: $o, on_conflict: {constraint: app_pkey, update_columns: [name, spec]}) { key } }',
    { o: { key, name, spec } })
}
for (const { key } of library) {
  await until(`xuất bản ${key}`, async () => {
    const app = (await gql('manager1', 'query($k: String!) { app_by_pk(key: $k) { status error } }', { k: key })).app_by_pk
    if (app.status === 'error') throw new Error(`${key}: ${app.error}`)
    return app.status === 'published'
  })
  console.log(`Đã xuất bản: ${key}`)
}

// 2. Hồ sơ mẫu: [người gửi, ứng dụng, dữ liệu, các hành động lần lượt [người xử lý, hành động, ghi chú]].
const SUBMISSIONS = [
  ['staff1', 'tam_ung', { so_tien: 3000000, ly_do: 'Công tác Đà Nẵng 2 ngày' }, [['manager1', 'approve'], ['accountant1', 'done', 'Đã chuyển khoản']]],
  ['staff2', 'tam_ung', { so_tien: 12000000, ly_do: 'Đặt cọc thuê hội trường tổng kết năm' }, [['manager1', 'approve'], ['director1', 'approve', 'Đồng ý, lưu ý lấy hóa đơn']]],
  ['staff1', 'tam_ung', { so_tien: 8000000, ly_do: 'Mua quà tặng đối tác' }, [['manager1', 'approve']]],
  ['staff2', 'tam_ung', { so_tien: 1500000, ly_do: 'Tiếp khách' }, [['manager1', 'reject', 'Chưa có kế hoạch tiếp khách được duyệt']]],
  ['staff1', 'nghi_phep', { tu_ngay: '2026-11-20', so_ngay: 1, loai: 'Việc riêng' }, [['manager1', 'approve']]],
  ['staff2', 'nghi_phep', { tu_ngay: '2026-12-01', so_ngay: 5, loai: 'Phép năm', ly_do: 'Về quê' }, [['manager1', 'approve']]],
  ['staff1', 'mua_thiet_bi', { ten_thiet_bi: 'Máy in màu văn phòng', loai: 'Máy in', gia_du_kien: 9500000, ly_do: 'Máy cũ hỏng trục cuốn' }, []],
  ['staff2', 'mua_thiet_bi', { ten_thiet_bi: 'Máy trạm dựng video', loai: 'Máy tính', gia_du_kien: 42000000, ly_do: 'Phục vụ sản xuất nội dung' }, [['manager1', 'approve']]],
  ['manager1', 'thanh_toan', { nha_cung_cap: 'Công ty TNHH Văn phòng phẩm An Phát', so_tien: 6400000, so_hoa_don: 'HD-2026-1187' }, [['accountant1', 'approve', 'Chứng từ đủ']]],
]

if (existing.length > 0 && !force) {
  console.log('Đã có hồ sơ trong hệ thống, bỏ qua bước tạo hồ sơ mẫu (thêm --force để vẫn tạo).')
} else {
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
    console.log(`Hồ sơ ${app} của ${user}: ${current.status}${current.waiting_role ? `, chờ ${current.waiting_role}` : ''}`)
  }
}
console.log('Xong.')
