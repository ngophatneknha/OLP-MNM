// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// SQL trên kho lạnh bằng DuckDB (scripts/cold-sql.sh, profile lakehouse): hồ sơ đã xuất truy vấn được mà không nạp lại PostgreSQL.
// Mã ca: LAKE-xx. Dựng ảnh DuckDB nặng máy nên chạy riêng, không chung với bộ song song:
//   LAKE_OPTIONAL=1 node --test tests/lakehouse.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GW, ROLE, login, publishApp, submit, act, waitStatus, run, uid } from './lib.js'

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

// Bảng Apache Iceberg của kho lạnh (scripts/lake.sh): tệp Parquet trong S3, lược đồ có phiên bản, ảnh chụp để du hành thời gian. Mã ca LAKE-02 trở đi.
const lake = (...args) => JSON.parse(run('sh', ['scripts/lake.sh', ...args], { stdio: ['ignore', 'pipe', 'ignore'] }))
// Ghi thẳng một tệp vào bucket kho lạnh (giả lập tệp hỏng hay tệp trái kiểu) bằng chính ảnh lakehouse, rồi xóa sau ca thử.
const PUT = "import os,sys,pyarrow.fs as f;fs=f.S3FileSystem(endpoint_override='seaweedfs:8333',scheme='http',access_key=os.environ['S3_ACCESS_KEY'],secret_key=os.environ['S3_SECRET_KEY'],region='us-east-1')\nif sys.argv[2]=='-': fs.delete_file('dxlab-cold/'+sys.argv[1])\nelse:\n  s=fs.open_output_stream('dxlab-cold/'+sys.argv[1]); s.write(sys.argv[2].encode()); s.close()"
const put = (key, body) => run('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.optional.yml', '--profile', 'lakehouse', 'run', '--rm', '-T', '--no-deps', '--entrypoint', 'python', 'lakehouse', '-c', PUT, key, body], { stdio: ['ignore', 'pipe', 'ignore'] })
const LAKE = { timeout: 600_000, skip: process.env.LAKE_OPTIONAL ? false : 'đặt LAKE_OPTIONAL=1 (dựng ảnh DuckDB nặng, chạy riêng)' }
async function approvedAndArchived(spec, data) {
  const app = await publishApp(spec)
  const id = (await submit('staff1', app, data)).data.insert_submission_one.id
  await waitStatus('manager1', id, { current_step: 'truong_phong' })
  assert.ok(!(await act('manager1', id, 'truong_phong', 'approve')).errors)
  await waitStatus('staff1', id, { status: 'approved' })
  assert.equal((await archive('director1')).status, 200)
  return { app, id }
}

let first
test('LAKE-02 nạp kho lạnh vào bảng Iceberg: hồ sơ có đủ cột, trường dữ liệu thành cột có kiểu, phân vùng theo tổ chức, mỗi lần nạp là một ảnh chụp', LAKE, async () => {
  first = await approvedAndArchived(ONE_STEP, { so_tien: 4_200_000 })
  const r = lake('sync')
  assert.ok(r.loaded_files >= 1, JSON.stringify(r))
  const rows = lake('sql', `SELECT org, status, app_key, data_so_tien, typeof(data_so_tien) AS t, events IS NOT NULL AS has_events FROM lake WHERE id = '${first.id}'`)
  assert.deepEqual(rows, [{ org: 'default', status: 'approved', app_key: first.app, data_so_tien: 4_200_000, t: 'DOUBLE', has_events: true }])
  const info = lake('info')
  assert.equal(info.format_version, 2)
  assert.deepEqual(info.partition, ['org'])
  assert.ok(info.snapshots.length >= 1)
  first.snapshot = info.snapshots.at(-1).snapshot_id
  assert.equal(typeof first.snapshot, 'string', 'mã ảnh chụp 64 bit phải là chuỗi')
  first.schema = info.schema_id
})

test('LAKE-03 lược đồ có phiên bản: trường mới thêm cột và tăng schema-id, hàng cũ có cột đó là null; đọc lại ảnh chụp cũ ra đúng dữ liệu cũ', LAKE, async () => {
  const field = `ghi_chu_${uid()}`
  const spec = { fields: [...ONE_STEP.fields, { key: field, label: 'Ghi chú', type: 'text' }], steps: ONE_STEP.steps }
  const second = await approvedAndArchived(spec, { so_tien: 900_000, [field]: 'mua mực in' })
  const r = lake('sync')
  assert.ok(r.added_columns.includes(`data_${field}`), JSON.stringify(r))
  const info = lake('info')
  assert.ok(info.schema_id > first.schema, 'schema-id phải tăng')
  assert.ok(info.schemas.some((s) => s.schema_id === first.schema && !s.columns.includes(`data_${field}`)), 'phiên bản lược đồ cũ vẫn được giữ')
  assert.deepEqual(lake('sql', `SELECT data_${field} AS v FROM lake WHERE id IN ('${first.id}', '${second.id}') ORDER BY data_so_tien`), [{ v: 'mua mực in' }, { v: null }])
  const old = lake('sql', `SELECT count(*) AS n, count(*) FILTER (WHERE id = '${second.id}') AS second FROM lake`, first.snapshot)
  assert.equal(old[0].second, 0, 'ảnh chụp cũ không được thấy hồ sơ mới')
  assert.ok(old[0].n >= 1)
})

test('LAKE-04 nạp lại không nhân đôi; tệp hỏng và tệp trái kiểu cột bị bỏ qua có báo lý do, bảng không bị hỏng', LAKE, async () => {
  const before = lake('sql', 'SELECT count(*) AS n FROM lake')[0].n
  const again = lake('sync')
  assert.equal(again.loaded_files, 0)
  assert.equal(lake('sql', 'SELECT count(*) AS n FROM lake')[0].n, before)
  const t = uid()
  const broken = `zz_lake_test/hong-${t}.jsonl`
  const wrong = `zz_lake_test/trai-kieu-${t}.jsonl`
  put(broken, '{"id": "x", "data": {')
  put(wrong, JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', status: 'approved', data: { so_tien: 'rất nhiều' } }))
  try {
    const r = lake('sync')
    const skipped = Object.fromEntries(r.skipped.map((s) => [s.object_key, s.reason]))
    assert.match(skipped[broken] ?? '', /tệp hỏng/)
    assert.match(skipped[wrong] ?? '', /lược đồ không tương thích/)
    assert.equal(r.loaded_files, 0)
    assert.equal(lake('sql', 'SELECT count(*) AS n FROM lake')[0].n, before)
    assert.deepEqual(lake('sql', "SELECT count(*) AS n FROM lake WHERE org = 'zz_lake_test'"), [{ n: 0 }])
  } finally {
    put(broken, '-')
    put(wrong, '-')
  }
})

test('LAKE-05 quyền xóa dữ liệu cá nhân: forget bỏ hồ sơ khỏi bảng và khỏi MỌI ảnh chụp cũ, tệp cũ bị xóa, nạp lại không đưa hồ sơ về', LAKE, async () => {
  const gone = await approvedAndArchived(ONE_STEP, { so_tien: 3_100_000 })
  lake('sync')
  const before = lake('info').snapshots.map((s) => s.snapshot_id)
  assert.deepEqual(lake('sql', `SELECT count(*) AS n FROM lake WHERE id = '${gone.id}'`), [{ n: 1 }])
  const r = lake('forget', gone.id)
  assert.equal(r.deleted_rows, 1)
  assert.ok(r.expired_snapshots >= 1 && r.removed_files >= 1, JSON.stringify(r))
  assert.deepEqual(lake('sql', `SELECT count(*) AS n FROM lake WHERE id = '${gone.id}'`), [{ n: 0 }])
  const after = lake('info').snapshots.map((s) => s.snapshot_id)
  assert.equal(after.length, 1, 'chỉ còn ảnh chụp hiện tại')
  assert.ok(!before.includes(after[0]))
  assert.throws(() => lake('sql', 'SELECT count(*) AS n FROM lake', before.at(-1)), 'ảnh chụp cũ (còn hồ sơ) không đọc lại được nữa')
  // Tìm thẳng trong S3: không còn tệp Parquet nào của bảng chứa mã hồ sơ.
  const left = JSON.parse(run('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.optional.yml', '--profile', 'lakehouse', 'run', '--rm', '-T', '--no-deps', '--entrypoint', 'python', 'lakehouse', '-c',
    "import os,sys,json,pyarrow.fs as f,pyarrow.parquet as pq;fs=f.S3FileSystem(endpoint_override='seaweedfs:8333',scheme='http',access_key=os.environ['S3_ACCESS_KEY'],secret_key=os.environ['S3_SECRET_KEY'],region='us-east-1')\nhit=[i.path for i in fs.get_file_info(f.FileSelector('dxlab-cold/lake',recursive=True)) if i.path.endswith('.parquet') and sys.argv[1] in pq.ParquetFile(fs.open_input_file(i.path)).read(columns=['id']).column('id').to_pylist()]\nprint(json.dumps(hit))", gone.id], { stdio: ['ignore', 'pipe', 'ignore'] }))
  assert.deepEqual(left, [])
  const again = lake('sync')
  assert.deepEqual(lake('sql', `SELECT count(*) AS n FROM lake WHERE id = '${gone.id}'`), [{ n: 0 }], JSON.stringify(again))
})

test('LAKE-06 hạn giữ ảnh chụp và gộp tệp: expire giữ ảnh hiện tại, compact giảm số tệp mà không đổi dữ liệu; mã hồ sơ sai dạng bị từ chối', LAKE, async () => {
  await approvedAndArchived(ONE_STEP, { so_tien: 10 })
  lake('sync')
  const n = lake('sql', 'SELECT count(*) AS n, sum(data_so_tien) AS s FROM lake')[0]
  const c = lake('compact')
  assert.ok(c.files_after <= c.files_before, JSON.stringify(c))
  assert.deepEqual(lake('sql', 'SELECT count(*) AS n, sum(data_so_tien) AS s FROM lake')[0], n)
  const e = lake('expire', '0')
  assert.ok(e.expired_snapshots >= 1, JSON.stringify(e))
  assert.equal(lake('info').snapshots.length, 1)
  assert.deepEqual(lake('sql', 'SELECT count(*) AS n, sum(data_so_tien) AS s FROM lake')[0], n)
  assert.throws(() => lake('forget', "x' OR 1=1"))
})

test('LAKE-07 hai lệnh ghi cùng lúc: lệnh sau dừng ngay vì khóa pg_advisory_lock, không ghi chồng', LAKE, async () => {
  const { spawn } = await import('node:child_process')
  const { ROOT, sql } = await import('./lib.js')
  // Giữ khóa bằng psql trong 15 giây (cùng khóa lake.py dùng), rồi chạy sync.
  const held = spawn('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'dxlab', '-d', 'dxlab', '-c', "SELECT pg_advisory_lock(hashtext('dxlab-lake')), pg_sleep(15)"], { cwd: ROOT, stdio: 'ignore' })
  try {
    await new Promise((ok) => setTimeout(ok, 2000))
    assert.equal(sql("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objid = hashtext('dxlab-lake')::oid"), '1')
    assert.throws(() => run('sh', ['scripts/lake.sh', 'sync'], { stdio: ['ignore', 'pipe', 'pipe'] }), /pg_advisory_lock/)
  } finally { held.kill(); await new Promise((ok) => held.on('exit', ok)) }
})
