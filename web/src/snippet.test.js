// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snippetParts } from './snippet.js'

test('tách từ khớp và giữ nguyên mã HTML như chữ thường', () => {
  assert.deepEqual(snippetParts('mã «nội» bộ <b>x</b>'), [
    { text: 'mã ', hit: false }, { text: 'nội', hit: true }, { text: ' bộ <b>x</b>', hit: false },
  ])
  assert.deepEqual(snippetParts(''), [])
  assert.deepEqual(snippetParts('không có dấu'), [{ text: 'không có dấu', hit: false }])
})
