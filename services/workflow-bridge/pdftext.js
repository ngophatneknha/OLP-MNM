// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Trích chữ từ PDF có lớp chữ (không OCR), chỉ dùng thư viện chuẩn của Node.js.
// Mục tiêu là đủ chữ cho tìm kiếm và hỏi đáp, không dựng lại bố cục trang.
//
// Một tệp PDF giữ chữ ở bốn lớp, và bộ đọc này đi qua đúng bốn lớp đó:
//   1. Các object được đánh số ("12 0 obj ... endobj"), có thể nằm gọn trong object stream (/ObjStm).
//   2. Content stream của từng trang, thường nén bằng FlateDecode (zlib).
//   3. Các lệnh vẽ chữ trong content stream: Tj, TJ, ', " giữa BT ... ET.
//   4. Byte trong lệnh vẽ là mã hình chữ của font, chưa phải Unicode: phải tra bảng /ToUnicode của font
//      (hoặc bảng mã /Encoding với font một byte). PDF tiếng Việt xuất từ Word/LibreOffice gần như luôn
//      dùng font hai byte (Type0, Identity-H) nên bảng ToUnicode là bắt buộc.
//
// Tệp PDF do người dùng tải lên là dữ liệu không tin cậy. Vì vậy bộ đọc này:
//   - không dùng eval/Function, không đọc tệp hay gọi mạng: chỉ biến byte thành chữ;
//   - đặt trần cho mọi thứ có thể phình to theo đầu vào: byte giải nén, số object, độ lồng, số toán tử, số ký tự;
//   - không tin bảng xref: quét tuần tự cả tệp, nên tệp hỏng xref vẫn đọc được phần còn lại;
//   - từ điển dùng Object.create(null), nên khoá "__proto__" trong tệp không chạm được tới prototype.
// Bridge gọi qua extractPdfTextIsolated: chạy trong một worker riêng, có trần bộ nhớ, có hạn giờ, không có biến
// môi trường, để một tệp nặng hay tệp độc không làm đứng luồng chính đang xử lý hồ sơ.
//
// Chưa hỗ trợ (không gây lỗi): PDF mã hoá và PDF scan cho ra không có chữ; font không có ToUnicode mà dùng bảng mã riêng
// (kể cả font tiếng Việt cũ TCVN3/VNI), bảng mã MacRoman ngoài phần ASCII và chữ viết dọc cho ra chữ sai.

import { inflateSync, constants as zlibConstants } from 'node:zlib'
import { Worker } from 'node:worker_threads'

/** Trần mặc định cho một tệp. */
export const LIMITS = Object.freeze({
  maxDecoded: 32 * 1024 * 1024, // tổng byte sau giải nén của cả tệp (chống "bom nén")
  maxObjects: 200_000,
  maxDepth: 64, // độ lồng của mảng/từ điển
  maxOps: 10_000_000, // tổng số token và byte chữ đọc trong các content stream
  maxFormDepth: 8, // Form XObject gọi lồng nhau
  maxChars: 200_000, // số ký tự đầu ra
})

class LimitError extends Error {} // vượt trần của cả tệp: dừng, trả phần chữ đã có
class Malformed extends Error {} // một phần tệp hỏng: bỏ phần đó, đọc tiếp phần khác
class Full extends Error {} // đã đủ số ký tự cần

/** Tệp có phải PDF không: dựa vào byte đầu tệp, không tin tên tệp hay MIME do trình duyệt gửi. */
export function isPdf(buf) {
  return Buffer.isBuffer(buf) && buf.subarray(0, 1024).includes('%PDF-')
}

// ---------------------------------------------------------------- Từ vựng

class Name { constructor(name) { this.name = name } }
class Ref { constructor(num, gen) { this.num = num; this.gen = gen } }
class Op { constructor(op) { this.op = op } }
const EOF = Symbol('EOF')
const LBR = Symbol('[')
const RBR = Symbol(']')
const LDICT = Symbol('<<')
const RDICT = Symbol('>>')

const isWs = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0
const isDelim = (c) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37
const hexVal = (c) => (c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1)
const isDict = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === null
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** Mảng byte -> chuỗi latin1 (mỗi ký tự một byte), theo từng khúc để không tràn ngăn xếp. */
function bytesToStr(arr) {
  let s = ''
  for (let i = 0; i < arr.length; i += 8192) s += String.fromCharCode.apply(null, arr.slice(i, i + 8192))
  return s
}

function isNumberWord(w) {
  if (w.length === 0 || w.length > 32) return false
  let i = w[0] === '+' || w[0] === '-' ? 1 : 0
  let digits = 0, dots = 0
  for (; i < w.length; i++) {
    const c = w.charCodeAt(i)
    if (c >= 48 && c <= 57) digits++
    else if (c === 46 && ++dots === 1) continue
    else return false
  }
  return digits > 0
}

/**
 * Tách token trên một chuỗi latin1. Trả về: số, chuỗi PDF (chuỗi JS mỗi ký tự là một byte), Name, Op (từ khoá trần),
 * hoặc một trong các ký hiệu LBR, RBR, LDICT, RDICT, EOF. Mọi vòng lặp đều đi tới, không đệ quy.
 */
class Lexer {
  constructor(s, p = 0, end = s.length) { this.s = s; this.p = p; this.end = end }

  skipWs() {
    const s = this.s
    while (this.p < this.end) {
      const c = s.charCodeAt(this.p)
      if (isWs(c)) this.p++
      else if (c === 37) { // % chú thích tới hết dòng
        while (this.p < this.end && s.charCodeAt(this.p) !== 10 && s.charCodeAt(this.p) !== 13) this.p++
      } else break
    }
  }

  next() {
    const s = this.s
    for (;;) {
      this.skipWs()
      if (this.p >= this.end) return EOF
      const c = s.charCodeAt(this.p)
      if (c === 40) return this.literal()
      if (c === 60) {
        if (s.charCodeAt(this.p + 1) === 60) { this.p += 2; return LDICT }
        return this.hex()
      }
      if (c === 62) {
        this.p++
        if (s.charCodeAt(this.p) === 62) { this.p++; return RDICT }
        continue // '>' lẻ
      }
      if (c === 91) { this.p++; return LBR }
      if (c === 93) { this.p++; return RBR }
      if (c === 47) return this.name()
      if (c === 41 || c === 123 || c === 125) { this.p++; continue } // ')' lẻ, '{' '}' (chỉ có trong hàm PostScript)
      const start = this.p
      while (this.p < this.end) {
        const d = s.charCodeAt(this.p)
        if (isWs(d) || isDelim(d)) break
        this.p++
      }
      const word = s.slice(start, this.p)
      return isNumberWord(word) ? Number(word) : new Op(word)
    }
  }

  literal() {
    const s = this.s, end = this.end, out = []
    let depth = 1
    this.p++
    while (this.p < end) {
      const c = s.charCodeAt(this.p++)
      if (c === 92) { // dấu \ thoát
        if (this.p >= end) break
        const n = s.charCodeAt(this.p++)
        if (n >= 48 && n <= 55) { // \ddd bát phân
          let v = n - 48
          for (let k = 0; k < 2 && this.p < end; k++) {
            const d = s.charCodeAt(this.p)
            if (d < 48 || d > 55) break
            v = v * 8 + d - 48
            this.p++
          }
          out.push(v & 0xff)
        } else if (n === 110) out.push(10)
        else if (n === 114) out.push(13)
        else if (n === 116) out.push(9)
        else if (n === 98) out.push(8)
        else if (n === 102) out.push(12)
        else if (n === 13) { if (s.charCodeAt(this.p) === 10) this.p++ } // \ cuối dòng: nối dòng
        else if (n !== 10) out.push(n)
      } else if (c === 40) { depth++; out.push(c) }
      else if (c === 41) { if (--depth === 0) break; out.push(c) }
      else out.push(c)
    }
    return bytesToStr(out)
  }

  hex() {
    const s = this.s, end = this.end, out = []
    let hi = -1
    this.p++
    while (this.p < end) {
      const c = s.charCodeAt(this.p++)
      if (c === 62) break
      const v = hexVal(c)
      if (v < 0) continue
      if (hi < 0) hi = v
      else { out.push(hi * 16 + v); hi = -1 }
    }
    if (hi >= 0) out.push(hi * 16)
    return bytesToStr(out)
  }

  name() {
    const s = this.s
    const start = ++this.p
    while (this.p < this.end) {
      const d = s.charCodeAt(this.p)
      if (isWs(d) || isDelim(d)) break
      this.p++
    }
    const raw = s.slice(start, this.p)
    return new Name(raw.includes('#') ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : raw)
  }
}

/** Đọc một object. refs=false trong content stream (ở đó không có tham chiếu "n g R"). */
function parseObject(lx, tok = lx.next(), depth = 0, refs = true) {
  if (depth > LIMITS.maxDepth) throw new Malformed('lồng quá sâu')
  if (typeof tok === 'number') {
    if (refs && Number.isInteger(tok) && tok >= 0) {
      const save = lx.p
      const t2 = lx.next()
      if (typeof t2 === 'number' && Number.isInteger(t2)) {
        const t3 = lx.next()
        if (t3 instanceof Op && t3.op === 'R') return new Ref(tok, t2)
      }
      lx.p = save
    }
    return tok
  }
  if (tok === LBR) {
    const arr = []
    for (;;) {
      const t = lx.next()
      if (t === RBR || t === EOF) return arr
      if (t === RDICT) continue
      arr.push(parseObject(lx, t, depth + 1, refs))
    }
  }
  if (tok === LDICT) {
    const dict = Object.create(null)
    for (;;) {
      const k = lx.next()
      if (k === RDICT || k === EOF) return dict
      if (!(k instanceof Name)) continue // khoá hỏng: bỏ qua
      const v = lx.next()
      if (v === RDICT || v === EOF) { dict[k.name] = null; return dict }
      dict[k.name] = parseObject(lx, v, depth + 1, refs)
    }
  }
  if (tok instanceof Op) {
    if (tok.op === 'true') return true
    if (tok.op === 'false') return false
    if (tok.op === 'null') return null
  }
  return tok
}

/** "12 0 obj": kiểm tra ngược từ vị trí chữ "obj". Mọi vòng lặp đều có trần để không thành bậc hai. */
function objHeader(src, at) {
  const after = src.charCodeAt(at + 3)
  if (!(Number.isNaN(after) || isWs(after) || isDelim(after))) return null
  let i = at - 1
  const wsBack = () => { const from = i; while (i >= 0 && from - i < 256 && isWs(src.charCodeAt(i))) i--; return i < from }
  const digitsBack = () => {
    const from = i
    while (i >= 0 && from - i < 10 && src.charCodeAt(i) >= 48 && src.charCodeAt(i) <= 57) i--
    return i < from ? Number(src.slice(i + 1, from + 1)) : null
  }
  if (!wsBack()) return null
  const gen = digitsBack()
  if (gen === null || !wsBack()) return null
  const objNum = digitsBack()
  if (objNum === null) return null
  if (i >= 0 && !(isWs(src.charCodeAt(i)) || isDelim(src.charCodeAt(i)))) return null
  return { num: objNum, gen }
}

function endstreamAt(src, i) {
  for (let k = 0; k < 4 && i < src.length && isWs(src.charCodeAt(i)); k++) i++
  return src.startsWith('endstream', i)
}

/** Vị trí dữ liệu của stream ngay sau từ khoá "stream". Ưu tiên /Length nếu khớp, không thì tìm "endstream". */
function streamBounds(src, dict, p) {
  let start = p + 6
  if (src.charCodeAt(start) === 13) start++
  if (src.charCodeAt(start) === 10) start++
  const len = dict.Length
  if (Number.isInteger(len) && len >= 0 && start + len <= src.length && endstreamAt(src, start + len)) {
    return { start, end: start + len, next: start + len }
  }
  const found = src.indexOf('endstream', start)
  let end = found < 0 ? src.length : found
  if (end > start && src.charCodeAt(end - 1) === 10) end--
  if (end > start && src.charCodeAt(end - 1) === 13) end--
  return { start, end, next: found < 0 ? src.length : found + 9, lenRef: len instanceof Ref ? len : null }
}

// ---------------------------------------------------------------- Bộ lọc nén

function asciiHex(data) {
  const out = []
  let hi = -1
  for (const c of data) {
    if (c === 62) break
    const v = hexVal(c)
    if (v < 0) continue
    if (hi < 0) hi = v
    else { out.push(hi * 16 + v); hi = -1 }
  }
  if (hi >= 0) out.push(hi * 16)
  return Buffer.from(out)
}

function ascii85(data) {
  const out = []
  let group = []
  const flush = (g, n) => {
    let v = 0
    for (const d of g) v = v * 85 + d
    for (let k = 0; k < n; k++) out.push(Math.floor(v / 256 ** (3 - k)) % 256)
  }
  let i = data[0] === 60 && data[1] === 126 ? 2 : 0 // "<~"
  for (; i < data.length; i++) {
    const c = data[i]
    if (c === 126) break // "~>"
    if (isWs(c)) continue
    if (c === 122 && group.length === 0) { out.push(0, 0, 0, 0); continue } // z = bốn byte 0
    if (c < 33 || c > 117) continue
    group.push(c - 33)
    if (group.length === 5) { flush(group, 4); group = [] }
  }
  if (group.length > 1) {
    const n = group.length - 1
    while (group.length < 5) group.push(84)
    flush(group, n)
  }
  return Buffer.from(out)
}

// ---------------------------------------------------------------- Bảng mã và tên hình chữ

/** WinAnsiEncoding: ASCII, khối 0x80-0x9F riêng của Windows, phần còn lại trùng Latin-1. */
const WIN_ANSI = (() => {
  const hi = [0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
    0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178]
  return Array.from({ length: 256 }, (_, i) => {
    if (i < 32 || i === 127) return ''
    if (i >= 128 && i < 160) return hi[i - 128] ? String.fromCharCode(hi[i - 128]) : ''
    return String.fromCharCode(i)
  })
})()

function baseEncoding(name) {
  const t = WIN_ANSI.slice()
  if (name === 'StandardEncoding') { t[0x27] = '\u2019'; t[0x60] = '\u2018' }
  return t
}

const GLYPHS = new Map(Object.entries({
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'",
  quoteright: '\u2019', quoteleft: '\u2018', parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',',
  hyphen: '-', minus: '\u2212', period: '.', slash: '/', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>',
  question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_',
  grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', endash: '\u2013', emdash: '\u2014',
  bullet: '\u2022', quotedblleft: '\u201c', quotedblright: '\u201d', quotesinglbase: '\u201a', quotedblbase: '\u201e',
  ellipsis: '\u2026', dagger: '\u2020', daggerdbl: '\u2021', perthousand: '\u2030', guilsinglleft: '\u2039',
  guilsinglright: '\u203a', guillemotleft: '\u00ab', guillemotright: '\u00bb', trademark: '\u2122', copyright: '\u00a9',
  registered: '\u00ae', degree: '\u00b0', section: '\u00a7', paragraph: '\u00b6', Euro: '\u20ac', euro: '\u20ac',
  nbspace: '\u00a0', nonbreakingspace: '\u00a0', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl',
  dotlessi: '\u0131', dcroat: '\u0111', Dcroat: '\u0110', dmacron: '\u0111', Dslash: '\u0110', germandbls: '\u00df',
  ae: '\u00e6', AE: '\u00c6', oe: '\u0153', OE: '\u0152', oslash: '\u00f8', Oslash: '\u00d8', eth: '\u00f0',
  Eth: '\u00d0', thorn: '\u00fe', Thorn: '\u00de', lslash: '\u0142', Lslash: '\u0141', multiply: '\u00d7',
  divide: '\u00f7', plusminus: '\u00b1', periodcentered: '\u00b7', exclamdown: '\u00a1', questiondown: '\u00bf',
  cent: '\u00a2', sterling: '\u00a3', yen: '\u00a5', currency: '\u00a4', dong: '\u20ab',
}))

// Tên dấu trong tên hình chữ ("ecircumflexacute" = e + mũ + sắc), ghép lại rồi chuẩn hoá NFC ra chữ dựng sẵn.
const MARKS = [['circumflex', '\u0302'], ['dieresis', '\u0308'], ['dotbelow', '\u0323'], ['hookabove', '\u0309'],
  ['cedilla', '\u0327'], ['acute', '\u0301'], ['grave', '\u0300'], ['tilde', '\u0303'], ['breve', '\u0306'],
  ['caron', '\u030c'], ['macron', '\u0304'], ['ring', '\u030a'], ['ogonek', '\u0328'], ['dotaccent', '\u0307'],
  ['hungarumlaut', '\u030b'], ['horn', '\u031b'], ['commaaccent', '\u0326']]

/** Tên hình chữ (Adobe Glyph List và các dạng uniXXXX, uXXXX) -> chữ Unicode. Không biết thì trả chuỗi rỗng. */
export function glyphText(raw) {
  if (raw.length > 64) return ''
  const name = raw.split('.')[0]
  if (name.includes('_')) return name.split('_').map(glyphText).join('')
  if (GLYPHS.has(name)) return GLYPHS.get(name)
  let m = /^uni((?:[0-9A-Fa-f]{4})+)$/.exec(name)
  if (m) return m[1].match(/.{4}/g).map((h) => String.fromCharCode(parseInt(h, 16))).join('')
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(name)
  if (m) { const cp = parseInt(m[1], 16); return cp <= 0x10ffff ? String.fromCodePoint(cp) : '' }
  if (/^[A-Za-z]$/.test(name)) return name
  if (name.endsWith('comb')) { // dấu đứng riêng: "gravecomb", "hookabovecomb"
    const mark = MARKS.find(([n]) => n === name.slice(0, -4))
    if (mark) return mark[1]
  }
  if (/^[A-Za-z]/.test(name)) {
    let rest = name.slice(1), out = name[0]
    while (rest) {
      const mark = MARKS.find(([n]) => rest.startsWith(n))
      if (!mark) return ''
      out += mark[1]
      rest = rest.slice(mark[0].length)
    }
    return out.normalize('NFC')
  }
  return ''
}

/**
 * Font bitmap Type3 (vd. pdfTeX khi máy không có font Type1) đặt tên hình chữ theo số mã: /a65 là mã 65.
 * Chỉ nhận phần ASCII in được, giống cách pdftotext đoán; phần còn lại phụ thuộc bảng mã TeX nên bỏ qua.
 */
function numberedGlyph(name) {
  const m = /^[A-Za-z]{1,2}(\d{2,3})$/.exec(name)
  const code = m ? Number(m[1]) : 0
  return code >= 32 && code <= 126 ? String.fromCharCode(code) : ''
}

// ---------------------------------------------------------------- Bảng ToUnicode (CMap)

const bytesInt = (s) => { let v = 0; for (let i = 0; i < s.length; i++) v = v * 256 + s.charCodeAt(i); return v }
const intBytes = (v, len) => { let s = ''; for (let k = len - 1; k >= 0; k--) s += String.fromCharCode(Math.floor(v / 256 ** k) % 256); return s }

/** Chuỗi byte UTF-16BE -> chuỗi JS; k cộng vào đơn vị cuối (dùng cho bfrange). */
function utf16be(b, k = 0) {
  const u = []
  for (let i = 0; i + 1 < b.length; i += 2) u.push((b.charCodeAt(i) << 8) | b.charCodeAt(i + 1))
  if (b.length % 2) u.push(b.charCodeAt(b.length - 1))
  if (!u.length) return ''
  u[u.length - 1] = (u[u.length - 1] + k) & 0xffff
  return String.fromCharCode(...u)
}

function parseCMap(str) {
  const cm = { space: [], chars: new Map(), ranges: [] }
  const lx = new Lexer(str)
  let budget = 200_000 // trần số mục, chống bảng phình to
  for (let t = lx.next(); t !== EOF; t = lx.next()) {
    if (!(t instanceof Op)) continue
    if (t.op === 'begincodespacerange') {
      for (;;) {
        const a = lx.next()
        if (typeof a !== 'string') break
        const b = lx.next()
        if (typeof b !== 'string') break
        if (a.length >= 1 && a.length <= 4 && a.length === b.length) cm.space.push({ len: a.length, lo: a, hi: b })
      }
    } else if (t.op === 'beginbfchar') {
      for (;;) {
        const a = lx.next()
        if (typeof a !== 'string' || --budget < 0) break
        const b = lx.next()
        if (typeof b === 'string') cm.chars.set(a, utf16be(b))
        else if (b instanceof Name) cm.chars.set(a, glyphText(b.name))
        else break
      }
    } else if (t.op === 'beginbfrange') {
      for (;;) {
        const a = lx.next()
        if (typeof a !== 'string') break
        const b = lx.next()
        if (typeof b !== 'string' || b.length !== a.length || a.length > 4) break
        let d = lx.next()
        if (d === LBR) {
          try { d = parseObject(lx, LBR, 0, false) } catch { break }
        }
        if (typeof d !== 'string' && !Array.isArray(d)) break
        const lo = bytesInt(a), hi = bytesInt(b)
        if (hi < lo) continue
        if (hi - lo < 256 && budget > hi - lo) {
          budget -= hi - lo + 1
          for (let c = lo; c <= hi; c++) cm.chars.set(intBytes(c, a.length), rangeText(d, c - lo))
        } else if (cm.ranges.length < 10_000) cm.ranges.push({ len: a.length, lo, hi, dst: d })
      }
    }
  }
  return cm
}

function rangeText(dst, k) {
  if (!Array.isArray(dst)) return utf16be(dst, k)
  const v = dst[k]
  return typeof v === 'string' ? utf16be(v) : v instanceof Name ? glyphText(v.name) : ''
}

function lookupCMap(cm, key, code, len) {
  const hit = cm.chars.get(key)
  if (hit !== undefined) return hit
  for (const r of cm.ranges) if (r.len === len && code >= r.lo && code <= r.hi) return rangeText(r.dst, code - r.lo)
  return undefined
}

// ---------------------------------------------------------------- Font

class Font {
  constructor({ codeLen = 1, codespace = null, cmap = null, enc = null, ucs2 = false, widths = { fn: null, dw: 500 }, scale = 0.001 }) {
    Object.assign(this, { codeLen, codespace, cmap, enc, ucs2, scale })
    this.wfn = widths.fn
    this.dw = widths.dw
    this.cache = new Map()
  }

  codeLength(bytes, i) {
    const sp = this.codespace
    if (sp) {
      for (let len = 1; len <= 4 && i + len <= bytes.length; len++) {
        for (const r of sp) {
          if (r.len !== len) continue
          let ok = true
          for (let k = 0; k < len && ok; k++) {
            const c = bytes.charCodeAt(i + k)
            ok = c >= r.lo.charCodeAt(k) && c <= r.hi.charCodeAt(k)
          }
          if (ok) return len
        }
      }
    }
    return Math.max(1, Math.min(this.codeLen, bytes.length - i))
  }

  text(key, code, len) {
    let t = this.cache.get(key)
    if (t !== undefined) return t
    t = this.cmap ? lookupCMap(this.cmap, key, code, len) : undefined
    if (t === undefined) {
      if (this.enc && len === 1) t = this.enc[code] ?? ''
      else if (this.ucs2) t = String.fromCharCode(code)
      else t = '' // font hai byte không có ToUnicode: không biết mã ứng với chữ nào
    }
    if (this.cache.size < 65_536) this.cache.set(key, t)
    return t
  }

  /** Chuỗi byte của lệnh vẽ -> chữ, độ rộng (theo cỡ chữ 1), số hình chữ, số dấu cách một byte (cho Tw). */
  decode(bytes) {
    let text = '', w = 0, n = 0, spaces = 0
    for (let i = 0; i < bytes.length;) {
      const len = this.codeLength(bytes, i)
      const key = bytes.slice(i, i + len)
      const code = bytesInt(key)
      i += len
      text += this.text(key, code, len)
      const gw = this.wfn ? this.wfn(code) : undefined
      w += gw === undefined ? this.dw : gw
      n++
      if (len === 1 && code === 32) spaces++
    }
    return { text, w: w * this.scale, n, spaces }
  }
}

const DEFAULT_FONT = new Font({ enc: WIN_ANSI })

// ---------------------------------------------------------------- Tài liệu

const IDENT = [1, 0, 0, 1, 0, 0]
const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
]
const NL = Buffer.from('\n')

class Doc {
  constructor(buf, lim) {
    this.buf = buf
    this.lim = lim
    this.src = buf.toString('latin1') // mỗi ký tự đúng một byte, vị trí trong chuỗi = vị trí trong tệp
    this.objs = new Map() // số object -> { value, stream, inStm }
    this.trailers = []
    this.left = lim.maxDecoded
    this.ops = 0
    this.decoded = new Map()
    this.fonts = new Map()
    this.out = []
    this.chars = 0
    this.lines = [] // các dòng của trang đang đọc
    this.seq = 0
    this.pageCount = 0
    this.skipped = 0
  }

  get(v) {
    for (let i = 0; i < 8 && v instanceof Ref; i++) v = this.objs.get(v.num)?.value ?? null
    return v instanceof Ref ? null : v
  }

  entry(v) { return v instanceof Ref ? this.objs.get(v.num) ?? null : null }

  name(v) { v = this.get(v); return v instanceof Name ? v.name : null }

  /** Quét tuần tự cả tệp tìm "n g obj". Object xuất hiện sau đè object trước (cập nhật tăng dần). */
  scan() {
    const src = this.src
    let pos = 0, count = 0
    for (;;) {
      const at = src.indexOf('obj', pos)
      if (at < 0) break
      pos = at + 3
      if (at >= 3 && src.startsWith('end', at - 3)) continue
      const head = objHeader(src, at)
      if (!head) continue
      if (++count > this.lim.maxObjects) throw new LimitError('quá nhiều object')
      const lx = new Lexer(src, at + 3)
      let value
      try { value = parseObject(lx) } catch (err) { if (err instanceof Malformed) continue; throw err }
      let stream = null
      if (isDict(value)) {
        lx.skipWs()
        if (src.startsWith('stream', lx.p)) {
          stream = streamBounds(src, value, lx.p)
          pos = stream.next
        }
      }
      if (!stream) pos = Math.max(pos, lx.p)
      this.objs.set(head.num, { value, stream, inStm: false })
      if (isDict(value) && this.name(value.Type) === 'XRef') this.trailers.push(value)
    }
    for (let at = src.indexOf('trailer'); at >= 0; at = src.indexOf('trailer', at + 7)) {
      try {
        const t = parseObject(new Lexer(src, at + 7))
        if (isDict(t)) this.trailers.push(t)
      } catch (err) { if (!(err instanceof Malformed)) throw err }
    }
  }

  /** Mở các object stream (/ObjStm): PDF đời mới cất font, trang... trong đó. Object trần được ưu tiên. */
  expandObjStms() {
    let count = this.objs.size
    for (const e of [...this.objs.values()]) {
      if (!e.stream || this.name(e.value.Type) !== 'ObjStm') continue
      const data = this.streamData(e)
      if (!data) continue
      const s = data.toString('latin1')
      const lx = new Lexer(s)
      const n = Math.min(num(this.get(e.value.N), 0), this.lim.maxObjects)
      const first = num(this.get(e.value.First), 0)
      const pairs = []
      for (let i = 0; i < n; i++) {
        const a = lx.next(), b = lx.next()
        if (typeof a !== 'number' || typeof b !== 'number') break
        pairs.push([a, b])
      }
      count += pairs.length
      if (count > this.lim.maxObjects) throw new LimitError('quá nhiều object')
      for (const [objNum, off] of pairs) {
        const old = this.objs.get(objNum)
        if (old && !old.inStm) continue
        try {
          this.objs.set(objNum, { value: parseObject(new Lexer(s, first + off)), stream: null, inStm: true })
        } catch (err) { if (!(err instanceof Malformed)) throw err }
      }
    }
  }

  encrypted() {
    return this.trailers.some((t) => t.Encrypt !== undefined && t.Encrypt !== null)
  }

  inflate(data) {
    if (this.left <= 0) throw new LimitError('vượt trần giải nén')
    let out
    try {
      // Z_SYNC_FLUSH: stream bị cắt cụt vẫn cho ra phần đã giải được thay vì ném lỗi.
      out = inflateSync(data, { maxOutputLength: this.left, finishFlush: zlibConstants.Z_SYNC_FLUSH })
    } catch (err) {
      if (err.code === 'ERR_BUFFER_TOO_LARGE') throw new LimitError('vượt trần giải nén')
      return null // dữ liệu nén hỏng
    }
    this.left -= out.length
    return out
  }

  /** Dữ liệu đã giải nén của một stream (nhớ lại để không giải nén hai lần, không tính trần hai lần). */
  streamData(e) {
    if (this.decoded.has(e)) return this.decoded.get(e)
    this.decoded.set(e, null)
    let { start, end } = e.stream
    if (e.stream.lenRef) {
      const L = this.get(e.stream.lenRef)
      if (Number.isInteger(L) && L >= 0 && start + L <= this.src.length && endstreamAt(this.src, start + L)) end = start + L
    }
    let data = this.buf.subarray(start, end)
    const f = this.get(e.value.Filter)
    const filters = f === null || f === undefined ? [] : Array.isArray(f) ? f.map((x) => this.name(x)) : [this.name(f)]
    for (const name of filters) {
      if (data === null) break
      if (name === 'FlateDecode' || name === 'Fl') data = this.inflate(data)
      else if (name === 'ASCIIHexDecode' || name === 'AHx') data = asciiHex(data)
      else if (name === 'ASCII85Decode' || name === 'A85') data = ascii85(data)
      else data = null // ảnh (DCT, JPX, CCITT, JBIG2), LZW, RunLength: không cần cho chữ
    }
    this.decoded.set(e, data)
    return data
  }

  /** Các trang theo thứ tự cây trang; /Resources thừa kế từ nút cha. Tệp hỏng cây trang thì lấy mọi /Page. */
  pages() {
    const out = []
    const seen = new Set()
    const walk = (ref, inherited, depth) => {
      if (depth > 64 || out.length >= 100_000) return
      if (ref instanceof Ref) {
        if (seen.has(ref.num)) return
        seen.add(ref.num)
      }
      const node = this.get(ref)
      if (!isDict(node)) return
      const resources = node.Resources ?? inherited
      const kids = this.get(node.Kids)
      if (Array.isArray(kids)) for (const k of kids) walk(k, resources, depth + 1)
      else if (this.name(node.Type) !== 'Pages') out.push({ node, resources })
    }
    for (const t of [...this.trailers].reverse()) {
      const root = this.get(t.Root)
      if (isDict(root) && root.Pages) { walk(root.Pages, null, 0); break }
    }
    if (!out.length) {
      const nums = [...this.objs.keys()].sort((a, b) => a - b)
      for (const n of nums) {
        const v = this.objs.get(n).value
        if (isDict(v) && this.name(v.Type) === 'Page') out.push({ node: v, resources: v.Resources ?? null })
      }
    }
    return out
  }

  contents(node) {
    const c = node.Contents
    const arr = this.get(c)
    const parts = []
    for (const r of Array.isArray(arr) ? arr : [c]) {
      const e = this.entry(r)
      if (!e?.stream) continue
      const d = this.streamData(e)
      if (d) parts.push(d, NL)
    }
    return parts
  }

  font(resources, name) {
    const res = this.get(resources)
    const fonts = isDict(res) ? this.get(res.Font) : null
    const ref = isDict(fonts) ? fonts[name] : undefined
    if (ref === undefined || ref === null) return DEFAULT_FONT
    const key = ref instanceof Ref ? ref.num : ref
    let f = this.fonts.get(key)
    if (!f) {
      f = this.buildFont(this.get(ref))
      this.fonts.set(key, f)
    }
    return f
  }

  cmapOf(v) {
    const e = this.entry(v)
    if (!e?.stream) return null
    const d = this.streamData(e)
    return d ? parseCMap(d.toString('latin1')) : null
  }

  buildFont(fd) {
    if (!isDict(fd)) return DEFAULT_FONT
    const subtype = this.name(fd.Subtype)
    const cmap = this.cmapOf(fd.ToUnicode)
    if (subtype === 'Type0') {
      const encName = this.name(fd.Encoding) ?? ''
      let codespace = null
      const embedded = this.cmapOf(fd.Encoding) // bảng mã nhúng quyết định độ dài mã
      if (embedded?.space.length) codespace = embedded.space
      else if (!encName.startsWith('Identity') && cmap?.space.length) codespace = cmap.space
      const desc = this.get(this.get(fd.DescendantFonts)?.[0])
      return new Font({ codeLen: 2, codespace, cmap, ucs2: /UCS2|UTF16/i.test(encName), widths: this.cidWidths(desc) })
    }
    const fm = this.get(fd.FontMatrix)
    const scale = subtype === 'Type3' && Array.isArray(fm) ? num(this.get(fm[0]), 0.001) : 0.001
    return new Font({ codeLen: 1, cmap, enc: this.simpleEncoding(fd, subtype === 'Type3'), widths: this.simpleWidths(fd), scale })
  }

  simpleEncoding(fd, type3) {
    const e = this.get(fd.Encoding)
    const base = e instanceof Name ? e.name : isDict(e) ? this.name(e.BaseEncoding) : null
    const table = baseEncoding(base)
    const diffs = isDict(e) ? this.get(e.Differences) : null
    if (Array.isArray(diffs)) {
      let code = 0
      for (const d of diffs) {
        if (typeof d === 'number') code = d
        else if (d instanceof Name) {
          if (code >= 0 && code < 256) table[code] = glyphText(d.name) || (type3 ? numberedGlyph(d.name) : '')
          code++
        }
      }
    }
    return table
  }

  simpleWidths(fd) {
    const first = num(this.get(fd.FirstChar), 0)
    const arr = this.get(fd.Widths)
    const desc = this.get(fd.FontDescriptor)
    const missing = isDict(desc) ? num(this.get(desc.MissingWidth), 0) : 0
    if (Array.isArray(arr) && arr.length) {
      const ws = arr.map((w) => num(this.get(w), NaN))
      const valid = ws.filter((w) => w > 0)
      const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 500
      return { fn: (c) => (ws[c - first] >= 0 ? ws[c - first] : undefined), dw: missing || avg }
    }
    return { fn: null, dw: /courier/i.test(this.name(fd.BaseFont) ?? '') ? 600 : 500 }
  }

  cidWidths(desc) {
    if (!isDict(desc)) return { fn: null, dw: 1000 }
    const dw = num(this.get(desc.DW), 1000)
    const W = this.get(desc.W)
    const map = new Map(), ranges = []
    if (Array.isArray(W)) {
      for (let i = 0; i < W.length;) {
        const c = num(this.get(W[i]), NaN)
        const next = this.get(W[i + 1])
        if (Array.isArray(next)) {
          next.forEach((w, k) => { if (map.size < 65_536) map.set(c + k, num(this.get(w), dw)) })
          i += 2
        } else {
          const c2 = num(next, NaN)
          if (Number.isFinite(c) && Number.isFinite(c2) && ranges.length < 10_000) ranges.push([c, c2, num(this.get(W[i + 2]), dw)])
          i += 3
        }
      }
    }
    return { fn: (code) => map.get(code) ?? ranges.find((r) => code >= r[0] && code <= r[1])?.[2], dw }
  }

  /**
   * Ghi một đoạn chữ đã vẽ (từ x0 tới x1 trên đường chân chữ y) vào dòng của nó.
   * Thứ tự trong content stream không phải lúc nào cũng là thứ tự đọc: LibreOffice vẽ hết chữ của font chính trước,
   * rồi mới vẽ các chữ font chính không có (thường là chữ tiếng Việt như "ử", "ạ") vào chỗ trống. Vì vậy:
   *   - đoạn tiếp nối bên phải dòng vừa vẽ thì nối vào dòng đó (luồng bình thường, kể cả ô bảng, tab);
   *   - đoạn rơi vào khoảng ngang của một dòng gần đây cùng chân chữ thì chèn vào dòng đó (chữ vẽ bù);
   *   - còn lại là dòng mới. Cột thứ hai của trang hai cột cách cột đầu cả khoảng lề nên không bị nhập vào cột đầu.
   */
  addRun(text, x0, y, x1, size) {
    if (!text) return
    if (x1 < x0) [x0, x1] = [x1, x0]
    const lines = this.lines
    const near = (l) => Math.abs(l.y - y) <= 0.5 * Math.max(size, l.size)
    let target = null
    const last = lines[lines.length - 1]
    if (last && near(last) && x0 >= last.maxX - 0.5 * size) target = last
    else {
      for (let i = lines.length - 1; i >= 0 && i >= lines.length - 30; i--) {
        const l = lines[i]
        if (near(l) && x0 <= l.maxX + size && x1 >= l.minX - size) { target = l; break }
      }
    }
    if (!target) {
      target = { y, size, minX: x0, maxX: x1, runs: [] }
      lines.push(target)
    }
    target.runs.push({ text, x0, x1, size, seq: this.seq++ })
    if (x0 < target.minX) target.minX = x0
    if (x1 > target.maxX) target.maxX = x1
    this.chars += text.length
    if (this.chars > this.lim.maxChars * 2) throw new Full()
  }

  /** Dựng chữ của trang: trong mỗi dòng xếp các đoạn theo vị trí ngang, khoảng hở đủ rộng thì thành dấu cách. */
  flushPage() {
    const out = []
    for (const l of this.lines) {
      l.runs.sort((a, b) => a.x0 - b.x0 || a.seq - b.seq)
      let s = '', prev = null
      for (const r of l.runs) {
        if (prev) {
          const gap = r.x0 - prev.x1, sz = Math.max(r.size, prev.size)
          if (gap > 0.18 * sz || gap < -sz) s += ' '
        }
        s += r.text
        if (!prev || r.x1 > prev.x1) prev = r
      }
      out.push(s)
    }
    this.lines = []
    if (out.length) this.out.push(out.join('\n'), '\n\n')
  }

  /** Chạy một content stream. g là trạng thái đồ hoạ (ma trận, font, cỡ chữ...), được q/Q lưu và khôi phục. */
  run(data, resources, depth, path, g) {
    const lx = new Lexer(data.toString('latin1'))
    const args = []
    const stack = []
    const marked = [] // các khối nội dung đánh dấu đang mở (BMC/BDC ... EMC)
    let tm = IDENT, tlm = IDENT
    // /ActualText thay cho chữ của các hình chữ bên trong khối: LibreOffice ghép "ế" từ hình "ê" và một dấu vẽ riêng
    // (dấu không có mã Unicode), chữ đúng chỉ có trong ActualText. Lấy khối ActualText ngoài cùng đang mở.
    const actual = () => marked.find((m) => m !== null)
    const show = (bytes) => {
      if (typeof bytes !== 'string') return
      // Một chuỗi chữ dài cũng tốn công như nhiều toán tử: tính cả vào trần.
      if ((this.ops += bytes.length) > this.lim.maxOps) throw new LimitError('quá nhiều chữ')
      const trm = mul(tm, g.ctm)
      const size = Math.abs(g.size * Math.hypot(trm[2], trm[3])) || 1
      const d = (g.font ?? DEFAULT_FONT).decode(bytes)
      tm = mul([1, 0, 0, 1, (d.w * g.size + d.n * g.tc + d.spaces * g.tw) * g.th, 0], tm)
      const x1 = mul(tm, g.ctm)[4]
      const act = actual()
      if (!act) this.addRun(d.text, trm[4], trm[5], x1, size)
      else {
        if (act.x0 === undefined) Object.assign(act, { x0: trm[4], y: trm[5], size })
        act.x1 = x1
      }
    }
    const props = (v) => {
      if (v instanceof Name) {
        const res = this.get(resources)
        const all = isDict(res) ? this.get(res.Properties) : null
        v = isDict(all) ? this.get(all[v.name]) : null
      }
      return isDict(v) && typeof v.ActualText === 'string' ? { text: textString(v.ActualText) } : null
    }
    const nextLine = () => { tlm = mul([1, 0, 0, 1, 0, -g.tl], tlm); tm = tlm }
    const matrix = () => (args.length >= 6 && args.slice(0, 6).every((v) => typeof v === 'number' && Number.isFinite(v)) ? args.slice(0, 6) : null)
    for (;;) {
      const t = lx.next()
      if (t === EOF) break
      if (++this.ops > this.lim.maxOps) throw new LimitError('quá nhiều toán tử')
      if (!(t instanceof Op)) {
        if (t === LBR || t === LDICT) args.push(parseObject(lx, t, 0, false))
        else if (t !== RBR && t !== RDICT) args.push(t)
        if (args.length > 64) args.splice(0, args.length - 64)
        continue
      }
      switch (t.op) {
        case 'q': if (stack.length < 64) stack.push({ ...g }); break
        case 'Q': if (stack.length) g = stack.pop(); break
        case 'cm': { const m = matrix(); if (m) g.ctm = mul(m, g.ctm); break }
        case 'BT': tm = tlm = IDENT; break
        case 'Tf':
          g.font = this.font(resources, args[0] instanceof Name ? args[0].name : '')
          g.size = num(args[1], g.size)
          break
        case 'Tc': g.tc = num(args[0], 0); break
        case 'Tw': g.tw = num(args[0], 0); break
        case 'Tz': g.th = num(args[0], 100) / 100; break
        case 'TL': g.tl = num(args[0], 0); break
        case 'TD': g.tl = -num(args[1], 0) // rơi xuống Td
        // falls through
        case 'Td': tlm = mul([1, 0, 0, 1, num(args[0], 0), num(args[1], 0)], tlm); tm = tlm; break
        case 'Tm': { const m = matrix(); if (m) tm = tlm = m; break }
        case 'T*': nextLine(); break
        case 'Tj': show(args[0]); break
        case "'": nextLine(); show(args[0]); break
        case '"': g.tw = num(args[0], 0); g.tc = num(args[1], 0); nextLine(); show(args[2]); break
        case 'TJ':
          if (Array.isArray(args[0])) {
            for (const el of args[0]) {
              if (typeof el === 'string') show(el)
              else if (typeof el === 'number' && Number.isFinite(el)) tm = mul([1, 0, 0, 1, (-el / 1000) * g.size * g.th, 0], tm)
            }
          }
          break
        case 'Do': if (args[0] instanceof Name) this.form(resources, args[0].name, depth, path, g); break
        case 'BI': skipInlineImage(lx); break
        case 'BMC': if (marked.length < 64) marked.push(null); break
        case 'BDC': if (marked.length < 64) marked.push(props(args[1])); break
        case 'EMC': {
          const m = marked.pop()
          if (m && m.x0 !== undefined && !actual()) this.addRun(m.text, m.x0, m.y, m.x1, m.size)
          break
        }
      }
      args.length = 0
    }
  }

  /** Form XObject: một content stream con có thể chứa chữ. Có trần độ sâu và chặn vòng tự gọi lại chính nó. */
  form(resources, name, depth, path, g) {
    if (depth >= this.lim.maxFormDepth) return
    const res = this.get(resources)
    const xobjs = isDict(res) ? this.get(res.XObject) : null
    const e = this.entry(isDict(xobjs) ? xobjs[name] : undefined)
    if (!e?.stream || this.name(e.value.Subtype) !== 'Form' || path.includes(e)) return
    const data = this.streamData(e)
    if (!data) return
    const m = this.get(e.value.Matrix)
    const ok = Array.isArray(m) && m.length === 6 && m.every((v) => typeof v === 'number' && Number.isFinite(v))
    this.run(data, e.value.Resources ?? resources, depth + 1, [...path, e], { ...g, ctm: ok ? mul(m, g.ctm) : g.ctm })
  }
}

/** Ảnh nhúng thẳng trong content stream (BI ... ID <nhị phân> EI): bỏ qua phần nhị phân. */
function skipInlineImage(lx) {
  for (let i = 0; i < 1000; i++) {
    const t = lx.next()
    if (t === EOF) return
    if (t instanceof Op && t.op === 'ID') break
    if (t === LBR || t === LDICT) parseObject(lx, t, 0, false)
  }
  const s = lx.s
  let p = lx.p + 1
  for (;;) {
    const at = s.indexOf('EI', p)
    if (at < 0) { lx.p = lx.end; return }
    const after = at + 2 >= lx.end ? 32 : s.charCodeAt(at + 2)
    if (isWs(s.charCodeAt(at - 1)) && (isWs(after) || isDelim(after))) { lx.p = at + 2; return }
    p = at + 2
  }
}

const freshState = () => ({ ctm: IDENT, font: null, size: 0, tc: 0, tw: 0, th: 1, tl: 0 })

/** "Chuỗi văn bản" của PDF (như ActualText): UTF-16BE có BOM, UTF-8 có BOM (PDF 2.0), hoặc PDFDocEncoding. */
function textString(s) {
  if (s.startsWith('\xfe\xff')) return utf16be(s.slice(2))
  if (s.startsWith('\xef\xbb\xbf')) return Buffer.from(s.slice(3), 'latin1').toString('utf8')
  return s
}

function tidy(s) {
  return s.normalize('NFC')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\ufeff\ufffd]/g, ' ')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Trích chữ từ một tệp PDF trong luồng hiện tại. Trả { text, pages, note, skipped }.
 * note: null (bình thường) | 'not-pdf' | 'encrypted' | 'no-text' (vd. PDF scan) | 'limit' (chạm trần, text là phần
 * đã đọc được) | 'truncated' (đủ maxChars). skipped: số trang hỏng đã bỏ qua.
 * Không ném lỗi với tệp hỏng; chỉ ném khi chính bộ đọc có lỗi lập trình.
 */
export function extractPdfText(input, options = {}) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (!isPdf(buf)) return { text: '', pages: 0, note: 'not-pdf', skipped: 0 }
  const doc = new Doc(buf, { ...LIMITS, ...options })
  let note = null
  try {
    doc.scan()
    doc.expandObjStms()
    if (doc.encrypted()) return { text: '', pages: 0, note: 'encrypted', skipped: 0 }
    for (const page of doc.pages()) {
      doc.pageCount++
      try {
        const parts = doc.contents(page.node)
        if (parts.length) doc.run(Buffer.concat(parts), page.resources, 0, [], freshState())
      } catch (err) {
        if (err instanceof LimitError || err instanceof Full) throw err
        doc.skipped++ // trang hỏng hoặc dạng chưa hiểu: bỏ trang này, đọc tiếp
      } finally {
        doc.flushPage() // kể cả khi chạm trần giữa trang: giữ phần chữ đã đọc
      }
    }
  } catch (err) {
    if (err instanceof LimitError) note = 'limit'
    else if (err instanceof Full) note = 'truncated'
    else throw err
  }
  const text = tidy(doc.out.join('')).slice(0, doc.lim.maxChars)
  return { text, pages: doc.pageCount, note: note ?? (text ? null : 'no-text'), skipped: doc.skipped }
}

/**
 * Như extractPdfText nhưng chạy trong một worker riêng: có trần bộ nhớ heap, có hạn giờ (quá hạn thì dừng hẳn worker),
 * và worker không nhận biến môi trường nào (không thấy HASURA_ADMIN_SECRET, khoá AI...). Một tệp nặng chỉ làm chậm
 * chính nó, không làm đứng luồng chính của bridge đang xử lý hồ sơ.
 */
export function extractPdfTextIsolated(buf, { timeoutMs = 20_000, heapMb = 192, limits = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = new Uint8Array(buf) // bản sao, chuyển hẳn sang worker
    const worker = new Worker(new URL('./pdftext-worker.js', import.meta.url), {
      workerData: { data, limits },
      transferList: [data.buffer],
      env: {},
      resourceLimits: { maxOldGenerationSizeMb: heapMb, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
    })
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('trích chữ PDF quá hạn')) }, timeoutMs)
    worker.once('message', (result) => { clearTimeout(timer); resolve(result); worker.terminate() })
    worker.once('error', (err) => { clearTimeout(timer); reject(err) })
    worker.once('exit', (code) => { clearTimeout(timer); if (code !== 0) reject(new Error(`worker trích chữ PDF dừng với mã ${code}`)) })
  })
}
