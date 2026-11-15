// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, coerce } from './ingest.js'

test('CSV: ngoặc kép, dấu phẩy và xuống dòng trong ô, BOM, dòng trống', () => {
  const csv = '﻿so_tien,ly_do\r\n1000,"mua, giấy ""A4"""\r\n\r\n2500,"hai\ndòng"\r\n'
  assert.deepEqual(parseCsv(csv), [{ so_tien: '1000', ly_do: 'mua, giấy "A4"' }, { so_tien: '2500', ly_do: 'hai\ndòng' }])
  assert.deepEqual(parseCsv(''), [])
})

test('ép kiểu theo khai báo: số từ CSV thành số, ô trống bị bỏ, cột lạ giữ nguyên để cơ sở dữ liệu từ chối', () => {
  const fields = [{ key: 'so_tien', type: 'number' }, { key: 'ly_do', type: 'text' }]
  assert.deepEqual(coerce({ so_tien: '1500', ly_do: '', la: 'x' }, fields), { so_tien: 1500, la: 'x' })
  assert.deepEqual(coerce({ so_tien: 7, ly_do: 'a' }, fields), { so_tien: 7, ly_do: 'a' })
})
