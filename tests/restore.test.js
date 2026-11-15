// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Sao lưu rồi khôi phục thảm họa trên hệ thống thật (OPS: scripts/backup.sh, scripts/restore.sh).
// Phá dữ liệu và khởi động lại dịch vụ nên KHÔNG chạy cùng các bộ kiểm thử khác:
//   RESTORE_TEST=1 node --test tests/restore.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GW, ROOT, login, publishApp, submit, run, sql, until } from './lib.js'

const skip = process.env.RESTORE_TEST ? false : 'đặt RESTORE_TEST=1 để chạy (phá và khôi phục dữ liệu thật)'
const count = (table) => Number(sql(`SELECT count(*) FROM ${table}`).trim())

test('OPS-RESTORE sao lưu, mất dữ liệu, khôi phục: hồ sơ, tệp đính kèm và tài khoản trở lại đúng như lúc sao lưu', { skip, timeout: 900_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dxlab-backup-'))
  try {
    const sid = (await submit('staff1', await publishApp(), { so_tien: 1 })).data.insert_submission_one.id
    const data = randomBytes(200_000)
    const token = await login('staff1')
    const up = await fetch(`${GW}/files`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-hasura-role': 'staff', 'x-submission-id': sid, 'x-file-name': 'sao-luu.bin', 'content-type': 'application/octet-stream' }, body: data })
    assert.equal(up.status, 200)
    const fileId = (await up.json()).id
    const before = { submissions: count('submission'), attachments: count('attachment') }

    run('sh', ['scripts/backup.sh', dir], { cwd: ROOT, stdio: 'pipe' })

    // Thảm họa: thêm hồ sơ mới sau bản sao lưu, rồi làm mất tệp và bảng hồ sơ.
    await submit('staff1', await publishApp(), { so_tien: 2 })
    sql('DROP TABLE attachment CASCADE')
    assert.ok(count('submission') > before.submissions)

    run('sh', ['scripts/restore.sh', dir], { cwd: ROOT, stdio: 'pipe', timeout: 600_000 })
    run('node', ['tests/wait-ready.js'], { cwd: ROOT, stdio: 'pipe', timeout: 600_000 })

    assert.equal(count('submission'), before.submissions, 'hồ sơ tạo sau bản sao lưu phải biến mất')
    assert.equal(count('attachment'), before.attachments, 'bảng đính kèm phải trở lại')
    // Dịch vụ vừa khởi động lại nên thử lại một lúc trước khi kết luận.
    const back = await until(async () => {
      const r = await fetch(`${GW}/files/${fileId}`, { headers: { authorization: `Bearer ${await login('staff1')}`, 'x-hasura-role': 'staff' } }).catch(() => null)
      return r?.status === 200 ? r : null
    }, 'tải lại tệp sau khi khôi phục', 120_000)
    assert.equal(createHash('sha256').update(Buffer.from(await back.arrayBuffer())).digest('hex'), createHash('sha256').update(data).digest('hex'), 'tệp phải giống từng byte')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
