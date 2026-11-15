// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test services/workflow-bridge/pdftext.test.js
//
// Mọi tệp PDF mẫu được dựng ngay trong mã kiểm thử (kho không chứa tệp nhị phân). Mỗi mẫu tái hiện một cách mà
// các phần mềm thật ghi chữ vào PDF: font một byte, font hai byte kèm ToUnicode, object stream, ActualText,
// chữ vẽ không theo thứ tự đọc; và các tệp cố ý phá: bom nén, vòng tự gọi, lồng sâu, khoá "__proto__".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'
import { isPdf, extractPdfText, extractPdfTextIsolated, glyphText } from './pdftext.js'

/** Dựng tệp PDF có bảng xref. objs[i] là object số i+1: chuỗi (object thường), { dict, data } (stream) hoặc null. */
function buildPdf(objs, trailerExtra = '') {
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
  let size = parts[0].length
  const offsets = []
  objs.forEach((o, i) => {
    if (o === null) { offsets.push(null); return }
    let body
    if (typeof o === 'string') body = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')
    else {
      const data = Buffer.isBuffer(o.data) ? o.data : Buffer.from(o.data, 'latin1')
      const dict = o.dict.replace(/>>\s*$/, `/Length ${data.length} >>`)
      body = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${dict}\nstream\n`, 'latin1'), data, Buffer.from('\nendstream\nendobj\n', 'latin1')])
    }
    offsets.push(size)
    parts.push(body)
    size += body.length
  })
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => (o === null ? '0000000000 65535 f \n' : `${String(o).padStart(10, '0')} 00000 n \n`)).join('')
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R ${trailerExtra}>>\nstartxref\n${size}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(parts)
}

const flate = (s) => deflateSync(Buffer.from(s, 'latin1'))
const HELVETICA = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'

/** Tài liệu một trang: 1 catalog, 2 cây trang, 3 trang, 4 nội dung, 5 font F1, rồi các object thêm từ số 6. */
function onePage(content, { font = HELVETICA, extra = [], resources = '', trailer = '' } = {}) {
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> ${resources} >> >>`,
    typeof content === 'string' ? { dict: '<< >>', data: content } : content,
    font,
    ...extra,
  ], trailer)
}

const text = (buf, opts) => extractPdfText(buf, opts).text

test('nhận diện PDF bằng byte đầu tệp, không bằng tên', () => {
  assert.equal(isPdf(Buffer.from('%PDF-1.4\n...')), true)
  assert.equal(isPdf(Buffer.concat([Buffer.alloc(500, 0x20), Buffer.from('%PDF-1.7')])), true)
  assert.equal(isPdf(Buffer.from('Xin chào, đây là tệp .txt đổi đuôi thành .pdf')), false)
  assert.deepEqual(extractPdfText(Buffer.from('không phải pdf')), { text: '', pages: 0, note: 'not-pdf', skipped: 0 })
})

test('font một byte, không nén và nén FlateDecode', () => {
  const content = 'BT /F1 12 Tf 72 720 Td (Hello World) Tj ET'
  assert.equal(text(onePage(content)), 'Hello World')
  assert.equal(text(onePage({ dict: '<< /Filter /FlateDecode >>', data: flate(content) })), 'Hello World')
  assert.equal(text(onePage({ dict: '<< /Filter [/ASCIIHexDecode] >>', data: Buffer.from(content).toString('hex') + '>' })), 'Hello World')
})

test('chuỗi có ký tự thoát và chữ Latin-1 theo WinAnsi', () => {
  assert.equal(text(onePage('BT /F1 12 Tf 72 720 Td (Gi\\341 tr\\(i\\) \\\\ 100\\045) Tj ET')), 'Giá tr(i) \\ 100%')
})

test('khoảng cách: dấu cách theo vị trí, không theo ký tự', () => {
  // Helvetica không khai báo /Widths: mỗi hình chữ coi rộng 0,5 em.
  assert.equal(text(onePage('BT /F1 12 Tf 72 720 Td (Hop) Tj 30 0 Td (dong) Tj ET')), 'Hop dong', 'hở 12pt: hai từ')
  assert.equal(text(onePage('BT /F1 12 Tf 72 720 Td (Ho) Tj 12 0 Td (p) Tj ET')), 'Hop', 'sát nhau: một từ')
  assert.equal(text(onePage('BT /F1 12 Tf 72 720 Td [(Xin)-333(chao) 20 (ban)] TJ ET')), 'Xin chaoban', 'TJ: lùi lớn là dấu cách, lùi nhỏ là kerning')
  assert.equal(text(onePage('BT /F1 12 Tf 72 720 Td (Dong 1) Tj 0 -14 Td (Dong 2) Tj T* ET')), 'Dong 1\nDong 2')
})

test('dùng /Widths của font để biết chữ kết thúc ở đâu', () => {
  const font = '<< /Type /Font /Subtype /Type1 /BaseFont /Mixed /FirstChar 65 /LastChar 67 /Widths [1000 200 200] >>'
  // "AB" rộng (1000 + 200) / 1000 x 12 = 14,4pt: chữ C đặt ngay sau là cùng một từ.
  // Nếu bỏ qua /Widths và dùng độ rộng trung bình (467) thì "AB" chỉ dài 11,2pt và sẽ thành "AB C".
  assert.equal(text(onePage('BT /F1 12 Tf 72 720 Td (AB) Tj 14.4 0 Td (C) Tj ET', { font })), 'ABC')
})

test('bảng mã /Differences với tên hình chữ tiếng Việt', () => {
  const font = '<< /Type /Font /Subtype /Type1 /BaseFont /X /Encoding << /BaseEncoding /WinAnsiEncoding /Differences [65 /ecircumflexacute /dcroat /uni1EA1 /ohornhookabove] >> >>'
  assert.equal(text(onePage('BT /F1 12 Tf 72 720 Td (ABCD) Tj ET', { font })), 'ếđạở')
  assert.equal(glyphText('uni0110'), 'Đ')
  assert.equal(glyphText('f_f_i'), 'ffi')
  assert.equal(glyphText('A.sc'), 'A')
  assert.equal(glyphText('không-phải-tên'), '')
})

/** Font hai byte (Type0, Identity-H) với bảng ToUnicode, như Word/LibreOffice/Chrome xuất ra. */
function type0(sentence, { extraCMap = '' } = {}) {
  const chars = [...new Set(sentence)]
  const hex = (n) => n.toString(16).padStart(4, '0')
  const cid = new Map(chars.map((c, i) => [c, i + 1]))
  const bfchar = chars.map((c) => `<${hex(cid.get(c))}> <${[...c].map((u) => hex(u.codePointAt(0))).join('')}>`).join('\n')
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CMapName /Adobe-Identity-UCS def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
${chars.length} beginbfchar
${bfchar}
endbfchar
${extraCMap}
endcmap CMapName currentdict /CMap defineresource pop end end`
  const body = [...sentence].map((c) => hex(cid.get(c))).join('')
  return {
    content: `BT /F1 11 Tf 72 720 Td <${body}> Tj ET`,
    font: '<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+DejaVuSans /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>',
    extra: [
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+DejaVuSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 600 /W [1 [${chars.map(() => 600).join(' ')}]] >>`,
      { dict: '<< /Filter /FlateDecode >>', data: flate(cmap) },
    ],
  }
}

test('font hai byte có ToUnicode: tiếng Việt có dấu', () => {
  const s = 'Đề nghị tạm ứng công tác phí đi Hà Nội'
  const t = type0(s)
  assert.equal(text(onePage({ dict: '<< /Filter /FlateDecode >>', data: flate(t.content) }, t)), s)
})

test('ToUnicode: bfrange dạng dải và dạng mảng, chữ ghép, và dấu tách rời được chuẩn hoá NFC', () => {
  const extraCMap = `3 beginbfrange
<0100> <0102> <0061>
<0200> <0201> [<00660069> <0066006C>]
<0300> <0300> <00650302>
endbfrange`
  const t = type0('x', { extraCMap })
  const r = extractPdfText(onePage('BT /F1 11 Tf 72 720 Td <010001010102> Tj 30 0 Td <02000201> Tj 30 0 Td <0300> Tj ET', t))
  assert.equal(r.text, 'abc fifl ê')
  assert.equal(r.text.at(-1), '\u00ea', 'dựng sẵn, không còn dấu mũ đứng riêng')
})

test('font hai byte không có ToUnicode: không bịa chữ', () => {
  const t = type0('abc')
  const font = t.font.replace(' /ToUnicode 7 0 R', '')
  assert.equal(extractPdfText(onePage(t.content, { ...t, font })).note, 'no-text')
})

test('object stream (PDF 1.5+): trang và font nằm trong /ObjStm', () => {
  const inner = [
    [2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [3, '<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'],
    [5, HELVETICA],
  ]
  let header = '', body = ''
  for (const [n, o] of inner) { header += `${n} ${body.length} `; body += o + '\n' }
  const pdf = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>', null, null,
    { dict: '<< /Filter /FlateDecode >>', data: flate('BT /F1 12 Tf 72 720 Td (Trong object stream) Tj ET') },
    null,
    { dict: `<< /Type /ObjStm /N 3 /First ${header.length} /Filter /FlateDecode >>`, data: flate(header + body) },
  ])
  assert.equal(text(pdf), 'Trong object stream')
})

test('cây trang nhiều tầng, /Resources thừa kế từ nút cha, /Contents là mảng', () => {
  const pdf = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 2 /Resources << /Font << /F1 6 0 R >> >> >>',
    '<< /Type /Pages /Parent 2 0 R /Kids [4 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 3 0 R /Contents [7 0 R 8 0 R] >>',
    '<< /Type /Page /Parent 3 0 R /Contents 9 0 R >>',
    HELVETICA,
    { dict: '<< >>', data: 'BT /F1 12 Tf 72 720 Td (Trang mot,) Tj' },
    { dict: '<< >>', data: '( phan hai) Tj ET' },
    { dict: '<< >>', data: 'BT /F1 12 Tf 72 720 Td (Trang hai) Tj ET' },
  ])
  const r = extractPdfText(pdf)
  assert.equal(r.text, 'Trang mot, phan hai\n\nTrang hai')
  assert.equal(r.pages, 2)
})

test('chữ vẽ không theo thứ tự đọc được xếp lại theo vị trí (font dự phòng của LibreOffice)', () => {
  // "gửi": vẽ "g" và "i" bằng font chính trước, chừa chỗ; chữ "ử" vẽ sau cùng bằng font khác, đặt bằng Tm.
  const content = 'BT /F1 12 Tf 72 720 Td (Kinh g) Tj 1 0 0 1 114 720 Tm (i ban) Tj 1 0 0 1 108 720 Tm /F2 12 Tf (U) Tj ET'
  const f2 = '<< /Type /Font /Subtype /Type1 /BaseFont /Fallback /Encoding << /Differences [85 /uhorntilde] >> >>'
  // Khoá /Font thứ hai trong /Resources đè khoá đầu: trang có cả F1 và F2.
  const pdf = onePage(content, { resources: '/Font << /F1 5 0 R /F2 6 0 R >>', extra: [f2] })
  // "Kinh g" dài 6 x 6pt = 36 -> kết thúc ở 108; "ữ" chiếm 108..114; "i ban" bắt đầu ở 114.
  assert.equal(text(pdf), 'Kinh gữi ban')
})

test('/ActualText thay cho các hình chữ bên trong khối', () => {
  const content = 'BT /F1 12 Tf 72 720 Td (de) Tj /Span << /ActualText <feff1ebf> >> BDC (e) Tj (?) Tj EMC (n) Tj ET'
  assert.equal(text(onePage(content)), 'deến')
})

test('Form XObject có chữ, kể cả form tự gọi lại chính nó', () => {
  const form = { dict: '<< /Type /XObject /Subtype /Form /BBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> /XObject << /X1 6 0 R >> >> >>', data: 'BT /F1 12 Tf 72 700 Td (Ben trong form) Tj ET /X1 Do' }
  const r = extractPdfText(onePage('/X1 Do', { resources: '/XObject << /X1 6 0 R >>', extra: [form] }))
  assert.equal(r.text, 'Ben trong form')
})

test('ảnh nhúng thẳng (BI ... ID ... EI) không làm hỏng phần chữ sau nó', () => {
  const content = Buffer.concat([
    Buffer.from('BT /F1 12 Tf 72 720 Td (Truoc anh) Tj ET\nBI /W 4 /H 1 /BPC 8 /CS /G ID ', 'latin1'),
    Buffer.from([0x00, 0x28, 0x29, 0x45, 0x54, 0xff, 0x5b]), // byte rác: ( ) E T ...
    Buffer.from(' EI\nBT /F1 12 Tf 72 700 Td (Sau anh) Tj ET', 'latin1'),
  ])
  assert.equal(text(onePage({ dict: '<< >>', data: content })), 'Truoc anh\nSau anh')
})

test('PDF mã hoá: không đọc, báo rõ', () => {
  const pdf = onePage('BT /F1 12 Tf 72 720 Td (bi mat) Tj ET', { extra: ['<< /Filter /Standard /V 2 /R 3 /O (x) /U (y) /P -4 >>'], trailer: '/Encrypt 6 0 R ' })
  assert.deepEqual(extractPdfText(pdf), { text: '', pages: 0, note: 'encrypted', skipped: 0 })
})

test('PDF scan (trang chỉ có ảnh) báo không có chữ', () => {
  assert.equal(extractPdfText(onePage('q 595 0 0 842 0 0 cm /Im0 Do Q')).note, 'no-text')
})

test('tệp hỏng: thiếu xref, bị cắt cụt, stream nén hỏng — không ném lỗi, lấy được phần còn đọc được', () => {
  const good = onePage({ dict: '<< /Filter /FlateDecode >>', data: flate('BT /F1 12 Tf 72 720 Td (Van doc duoc) Tj ET') })
  const noXref = Buffer.from(good.toString('latin1').replace(/xref[\s\S]*$/, ''), 'latin1')
  assert.equal(text(noXref), 'Van doc duoc')
  const cut = good.subarray(0, good.indexOf('endstream') - 3)
  assert.doesNotThrow(() => extractPdfText(cut))
  const broken = onePage({ dict: '<< /Filter /FlateDecode >>', data: Buffer.from('không phải dữ liệu zlib') })
  assert.equal(extractPdfText(broken).note, 'no-text')
  for (let i = 0; i <= good.length; i += 3) { // cắt ở mọi chỗ
    assert.doesNotThrow(() => extractPdfText(good.subarray(0, i)), `cắt ở byte ${i}`)
  }
})

test('bom nén: dừng ở trần giải nén, vẫn giữ chữ của trang đã đọc', () => {
  const bomb = deflateSync(Buffer.alloc(5_000_000, 0x20)) // vài KB nén, 5 MB khi giải
  const pdf = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /Contents 7 0 R >>',
    HELVETICA,
    { dict: '<< >>', data: 'BT /F1 12 Tf 72 720 Td (Trang dau) Tj ET' },
    { dict: '<< /Filter /FlateDecode >>', data: bomb },
  ])
  assert.ok(bomb.length < 10_000)
  const r = extractPdfText(pdf, { maxDecoded: 1_000_000 })
  assert.equal(r.note, 'limit')
  assert.equal(r.text, 'Trang dau')
})

test('lồng mảng rất sâu và chuỗi ký tự lẻ không làm tràn ngăn xếp', () => {
  assert.doesNotThrow(() => extractPdfText(onePage('['.repeat(200_000) + ' BT /F1 12 Tf (x) Tj ET')))
  assert.doesNotThrow(() => extractPdfText(onePage(')'.repeat(200_000) + '>'.repeat(200_000))))
  assert.doesNotThrow(() => extractPdfText(Buffer.from('%PDF-1.7\n1 0 obj ' + '<<'.repeat(100_000))))
})

test('trần số toán tử và số ký tự đầu ra', () => {
  const many = 'BT /F1 12 Tf 72 720 Td ' + '(ab) Tj '.repeat(50_000) + 'ET'
  assert.equal(extractPdfText(onePage(many), { maxOps: 10_000 }).note, 'limit')
  const r = extractPdfText(onePage(many), { maxChars: 1000 })
  assert.equal(r.note, 'truncated')
  assert.ok(r.text.length <= 1000)
})

test('khoá "__proto__" trong tệp không chạm tới prototype của đối tượng', () => {
  const pdf = onePage('BT /F1 12 Tf 72 720 Td (an toan) Tj ET', { extra: ['<< /__proto__ << /polluted true >> /constructor 1 >>'] })
  assert.equal(text(pdf), 'an toan')
  assert.equal({}.polluted, undefined)
  assert.equal(Object.prototype.polluted, undefined)
})

test('chạy trong worker riêng: cùng kết quả, có hạn giờ', async () => {
  const pdf = onePage('BT /F1 12 Tf 72 720 Td (Trong worker) Tj ET')
  assert.equal((await extractPdfTextIsolated(pdf)).text, 'Trong worker')
  await assert.rejects(extractPdfTextIsolated(pdf, { timeoutMs: 1 }), /quá hạn/)
})
