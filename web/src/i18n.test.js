// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MESSAGES } from './messages.js'

test('hai ngôn ngữ có đúng cùng bộ khoá và không bản dịch rỗng', () => {
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.vi).sort())
  for (const lang of Object.keys(MESSAGES)) for (const [k, v] of Object.entries(MESSAGES[lang])) assert.ok(v.trim(), `${lang}.${k}`)
})
