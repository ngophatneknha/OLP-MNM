// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Hàng rào chữ cứng: các màn hình đã chuyển sang i18n không được chứa lại chữ tiếng Việt viết thẳng,
// vì bản tiếng Anh sẽ lẫn chữ Việt. Thêm tên tệp vào GUARDED khi chuyển thêm màn hình.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const GUARDED = [
  'pages/Home.vue', 'pages/Submission.vue', 'pages/Processes.vue',
  'components/SignatureRow.vue', 'components/DecisionBar.vue', 'components/ProcessFlow.vue',
]
const VIET = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i

for (const file of GUARDED) {
  test(`${file} không còn chữ Việt viết thẳng`, () => {
    const code = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
    const bad = code.split('\n').filter((line) => VIET.test(line))
    assert.deepEqual(bad, [])
  })
}
