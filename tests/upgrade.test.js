// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đường nâng cấp CSDL: một CSDL ở lược đồ cũ (02..04, phiên bản 1.8.2) có dữ liệu thật, áp tiếp các migration 05..08
// (đa tổ chức, chữ ký số, vị trí, vai trò BI) theo đúng cách docs/VAN_HANH.md hướng dẫn, rồi áp lại lần nữa (phải chạy lại được).
// Dữ liệu cũ phải còn nguyên và thuộc tổ chức mặc định. Chạy trên CSDL tạm, không đụng CSDL đang dùng. Mã ca: UPG-xx.
// Phần Keycloak của nâng cấp (bộ ánh xạ claim org_id trong realm đã nhập từ trước) là thao tác tay, xem docs/VAN_HANH.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, run, sql, uid } from './lib.js'

const INIT = join(ROOT, 'infra/postgres/init')
const apply = (db, file) => run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'dxlab', '-d', db, '-q', '-v', 'ON_ERROR_STOP=1'], { input: readFileSync(join(INIT, file), 'utf8'), stdio: ['pipe', 'pipe', 'ignore'] })
const files = (from, to) => readdirSync(INIT).filter((f) => f >= from && f < to).sort()

test('UPG-01 nâng cấp từ lược đồ 1.8.2: dữ liệu cũ còn nguyên, mang org_id mặc định; áp lại các migration không lỗi', { timeout: 180_000 }, () => {
  const db = `up_${uid()}`
  sql(`CREATE DATABASE ${db}`, 'postgres')
  try {
    for (const f of files('02', '05')) apply(db, f)
    sql(`INSERT INTO app (key, name, spec, owner_id, owner_name) VALUES ('cu', 'Quy trình cũ', '{"fields":[],"steps":[]}', 'u1', 'U'); UPDATE app SET status = 'published' WHERE key = 'cu'; INSERT INTO submission (app_key, data, submitter_id, submitter_name) VALUES ('cu', '{}', 'u1', 'U')`, db)
    assert.equal(sql('SELECT count(*) FROM submission', db), '1')
    const migrations = files('05', '99')
    assert.deepEqual(migrations.map((f) => f.slice(0, 2)), ['05', '06', '07', '08', '09', '10', '11'], 'thêm migration mới thì cập nhật ca này')
    for (const pass of [1, 2]) for (const f of migrations) assert.doesNotThrow(() => apply(db, f), `lần ${pass}: ${f}`)
    assert.equal(sql("SELECT org_id FROM submission WHERE app_key = 'cu'", db), 'default')
    assert.equal(sql("SELECT org_id FROM app WHERE key = 'cu'", db), 'default')
    assert.equal(sql("SELECT count(*) FROM org WHERE id IN ('default', 'orgb')", db), '2')
    for (const t of ['pki_key', 'event_signature']) assert.equal(sql(`SELECT to_regclass('${t}') IS NOT NULL`, db), 't', t)
    assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'sensor' AND column_name IN ('lat', 'lon', 'org_id')", db), '3')
    // Hồ sơ mới sau nâng cấp vẫn tự mang tổ chức của ứng dụng.
    sql("INSERT INTO submission (app_key, data, submitter_id, submitter_name) VALUES ('cu', '{}', 'u1', 'U')", db)
    assert.equal(sql("SELECT count(*) FROM submission WHERE org_id = 'default'", db), '2')
    // Từ lúc nâng cấp, thay đổi được ghi vào audit_log (dữ liệu cũ không có lịch sử trước đó) và chuỗi băm nguyên vẹn.
    assert.equal(sql("SELECT count(*) FROM audit_log WHERE table_name = 'submission' AND op = 'INSERT' AND org_id = 'default'", db), '1')
    assert.equal(sql('SELECT count(*) FROM audit_broken()', db), '0')
  } finally { sql(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`, 'postgres') }
})
