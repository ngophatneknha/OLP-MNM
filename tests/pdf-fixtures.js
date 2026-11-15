// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Tạo PDF và ảnh thử bằng mã (không kèm tệp nhị phân trong kho) cho ca đọc PDF/OCR của tìm kiếm.
import { deflateSync } from 'node:zlib'
import { run } from './lib.js'

const NL = '\n'

function pdfFrom(objects) {
  let out = Buffer.from(`%PDF-1.4${NL}`)
  const offsets = objects.map((o, i) => {
    const at = out.length
    out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj${NL}`), o, Buffer.from(`${NL}endobj${NL}`)])
    return at
  })
  const xref = out.length
  const rows = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n ${NL}`).join('')
  const tail = `xref${NL}0 ${objects.length + 1}${NL}0000000000 65535 f ${NL}${rows}trailer${NL}<< /Size ${objects.length + 1} /Root 1 0 R >>${NL}startxref${NL}${xref}${NL}%%EOF${NL}`
  return Buffer.concat([out, Buffer.from(tail)])
}

const stream = (dict, data) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>${NL}stream${NL}`), data, Buffer.from(`${NL}endstream`)])

/** PDF một trang có lớp chữ (phông Helvetica, chỉ ký tự ASCII). */
export const textPdf = (text) => pdfFrom([
  Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
  Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
  Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'),
  stream('', Buffer.from(`BT /F1 28 Tf 20 100 Td (${text}) Tj ET`)),
  Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
])

const inExtractor = (cmd, input) => run('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.optional.yml', '--profile', 'search', 'exec', '-T', 'extractor', 'sh', '-c', cmd], { input, encoding: 'buffer', stdio: ['pipe', 'pipe', 'ignore'] })

/** Chụp PDF thành ảnh bằng poppler trong container extractor: 'png' hoặc 'pgm' (xám). */
export const rasterise = (pdf, fmt) => inExtractor(`cat > /tmp/a.pdf && pdftoppm -r 150 ${fmt === 'png' ? '-png' : '-gray'} -singlefile /tmp/a.pdf /tmp/a && cat /tmp/a.${fmt}`, pdf)

/** PDF chỉ có ảnh (không lớp chữ), giống bản quét: nhúng ảnh xám PGM (P5) đã nén. */
export function scannedPdf(pgm) {
  const head = pgm.toString('latin1', 0, 40).match(/^P5\s+(\d+)\s+(\d+)\s+255\s/)
  const [, w, h] = head
  return pdfFrom([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents 4 0 R /Resources << /XObject << /Im 5 0 R >> >> >>`),
    stream('', Buffer.from(`q ${w} 0 0 ${h} 0 0 cm /Im Do Q`)),
    stream(`/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, deflateSync(pgm.subarray(head[0].length))),
  ])
}
