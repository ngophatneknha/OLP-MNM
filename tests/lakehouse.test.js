// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// SQL trên kho lạnh bằng DuckDB (scripts/cold-sql.sh, profile lakehouse): hồ sơ đã xuất truy vấn được mà không nạp lại PostgreSQL.
// Mã ca: LAKE-xx. Dựng ảnh DuckDB nặng máy nên chạy riêng, không chung với bộ song song:
//   LAKE_OPTIONAL=1 node --test tests/lakehouse.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GW, ROLE, login, publishApp, submit, act, waitStatus, run } from './lib.js'

const ONE_STEP = { fields: [{ key: 'so_tien', label: 'Số tiền', type: 'number', required: true }], steps: [{ key: 'truong_phong', name: 'Trưởng phòng duyệt', role: 'manager' }] }
const archive = async (user) => fetch(`${GW}/archive?days=0`, { method: 'POST', headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user] } })
const cold = (query) => JSON.parse(run('sh', ['scripts/cold-sql.sh', query], { stdio: ['ignore', 'pipe', 'ignore'] }))

test('LAKE-01 SQL trên kho lạnh: hồ sơ đã xuất hiện trong bảng ảo cold theo đúng tổ chức, đọc được dữ liệu và nhật ký sự kiện', { timeout: 400_000, skip: process.env.LAKE_OPTIONAL ? false : 'đặt LAKE_OPTIONAL=1 (dựng ảnh DuckDB nặng, chạy riêng)' }, async () => {
  const app = await publishApp(ONE_STEP)
  const id = (await submit('staff1', app, { so_tien: 4_200_000 })).data.insert_submission_one.id
  await waitStatus('manager1', id, { current_step: 'truong_phong' })
  assert.ok(!(await act('manager1', id, 'truong_phong', 'approve')).errors)
  await waitStatus('staff1', id, { status: 'approved' })
  assert.equal((await archive('director1')).status, 200)
  const rows = cold(`SELECT org, status, app_key, CAST(data->>'so_tien' AS BIGINT) AS so_tien, json_array_length(events) AS n_events FROM cold WHERE id = '${id}'`)
  assert.deepEqual(rows, [{ org: 'default', status: 'approved', app_key: app, so_tien: 4_200_000, n_events: rows[0].n_events }])
  assert.ok(rows[0].n_events >= 1)
  assert.deepEqual(cold(`SELECT count(*) AS n FROM cold WHERE id = '${id}' AND org <> 'default'`), [{ n: 0 }])
})
