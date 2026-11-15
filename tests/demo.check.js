// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kiểm dữ liệu mẫu của bản demo: sau `node seed.js`, điểm H-P-D-I tính riêng trên các quy trình mẫu (library/) phải
// hợp lý. Không nằm trong tests/*.test.js vì cần dữ liệu mẫu đã nạp:
//   docker compose exec -T workflow-bridge node seed.js --force && node --test tests/demo.check.js
// Điểm I luôn là 0 ở đây vì ý kiến AI chỉ có khi cấu hình AI và chạy `seed.js --ai-demo`; không làm giả số.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, as } from './lib.js'
import { computeMaturity, maturityLevel } from '../web/src/maturity.js'

const KEYS = readdirSync(join(ROOT, 'library')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(ROOT, 'library', f), 'utf8')).key)

test('demo: điểm trưởng thành của các quy trình mẫu hợp lý và có phiên bản cải tiến thật', async () => {
  const where = `{_in: ${JSON.stringify(KEYS)}}`
  const subs = (await as('director1', `{ submission(where: {app_key: ${where}}) {
    id status data app { key } app_version version { spec } created_at finished_at events { step_key action created_at } opinions { step_key } } }`)).data.submission
  const extra = (await as('director1', `{ apps: app(where: {key: ${where}}) { key spec versions { version } changes { status } }
    autonomy: step_autonomy(where: {app_key: ${where}}) { app_key step_key level } }`)).data
  const r = computeMaturity({ submissions: subs, apps: extra.apps, autonomy: extra.autonomy })
  assert.equal(r.enough, true, 'seed.js chưa nạp đủ hồ sơ mẫu')
  assert.ok(extra.apps.find((a) => a.key === 'tam_ung').versions.length >= 2, 'tam_ung phải có phiên bản 2 từ vòng cải tiến mẫu')
  assert.ok(r.spaces.H.score >= 80, `H ${r.spaces.H.score}`)
  assert.ok(r.spaces.P.score >= 60, `P ${r.spaces.P.score}`)
  assert.ok(r.spaces.D.score >= 60, `D ${r.spaces.D.score}`)
  assert.ok(['growing', 'mature'].includes(maturityLevel(r.overall)), `chung ${r.overall}`)
})
