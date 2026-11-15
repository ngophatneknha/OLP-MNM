// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Chữ ký số cho phê duyệt (PKI phần mềm, không phụ thuộc gói ngoài, chỉ node:crypto).
//  - Mỗi tổ chức có một CA riêng (chứng thư X.509 tự ký, khóa ECDSA P-256).
//  - Mỗi người duyệt có chứng thư riêng do CA của tổ chức cấp ở lần ký đầu tiên (hiệu lực 1 năm).
//  - Mỗi hành động duyệt/từ chối được ký ECDSA-SHA256 trên bản tóm tắt chuẩn hóa (hồ sơ, bước, hành động, ghi chú, người ký, mã băm dữ liệu hồ sơ).
//  - GET /signatures/verify?submission=<id> kiểm từng chữ ký theo chuỗi chứng thư tới CA; GET /pki/ca tải chứng thư CA của tổ chức mình.
// shortcut: PKI phần mềm. Khóa riêng nằm trong CSDL, mã hóa AES-256-GCM bằng khóa chủ PKI_MASTER_KEY (chưa đặt thì dùng HASURA_ADMIN_SECRET),
// ký thay người dùng ngay tại máy chủ sau khi họ đăng nhập và duyệt. Chưa có HSM, chưa thu hồi chứng thư (CRL/OCSP), chưa có dấu thời gian
// của bên thứ ba. Cần giá trị pháp lý cao thì ký ở thiết bị người dùng và giữ khóa CA trong HSM hoặc két (OpenBao transit).
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, scryptSync, createCipheriv, createDecipheriv, sign, verify, X509Certificate } from 'node:crypto'
import { HttpError, asUser } from './files.js'
import { claimsOf, orgOf } from './cold.js'
import { sql, lit } from './db.js'

const MASTER = () => process.env.PKI_MASTER_KEY || process.env.HASURA_ADMIN_SECRET
const CA_YEARS = 10
const LEAF_YEARS = 1
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// ---- DER tối thiểu để dựng chứng thư X.509 v3 ----
const len = (n) => (n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]))
const der = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(body.length), body]) }
const seq = (...p) => der(0x30, ...p)
const set = (...p) => der(0x31, ...p)
const oid = (s) => {
  const n = s.split('.').map(Number)
  const out = [40 * n[0] + n[1]]
  for (const v of n.slice(2)) { const stack = [v & 127]; for (let x = v >> 7; x; x >>= 7) stack.unshift((x & 127) | 128); out.push(...stack) }
  return der(0x06, Buffer.from(out))
}
const int = (buf) => { const b = Buffer.from(buf); return der(0x02, b[0] & 128 ? Buffer.concat([Buffer.from([0]), b]) : b) }
const utf8 = (s) => der(0x0c, Buffer.from(s, 'utf8'))
const bits = (bytes, unused) => der(0x03, Buffer.from([unused]), Buffer.from(bytes))
const time = (d) => { const p = (v) => String(v).padStart(2, '0'); const y = d.getUTCFullYear(); return y < 2050 ? der(0x17, Buffer.from(`${String(y).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`)) : der(0x18, Buffer.from(`${y}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`)) }
const ECDSA_SHA256 = '1.2.840.10045.4.3.2'
const name = (cn, org, uid) => seq(
  set(seq(oid('2.5.4.10'), utf8(org))),
  ...(uid ? [set(seq(oid('0.9.2342.19200300.100.1.1'), utf8(uid)))] : []),
  set(seq(oid('2.5.4.3'), utf8(cn))))
const ext = (id, critical, value) => seq(oid(id), ...(critical ? [der(0x01, Buffer.from([0xff]))] : []), der(0x04, value))
const pem = (buf, label) => `-----BEGIN ${label}-----\n${buf.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`

/** Dựng chứng thư X.509 v3: `issuer` = { name DER, privateKey } hoặc null nếu tự ký. */
function buildCert({ subjectName, publicKey, isCa, signerKey, issuerName, notBefore, notAfter }) {
  const serial = randomBytes(16); serial[0] &= 0x7f; if (!serial[0]) serial[0] = 1
  const alg = seq(oid(ECDSA_SHA256))
  const usage = isCa ? bits([0x06], 1) : bits([0xc0], 6) // CA: keyCertSign, cRLSign; người ký: digitalSignature, nonRepudiation
  const tbs = seq(
    der(0xa0, int(Buffer.from([2]))), int(serial), alg, issuerName ?? subjectName,
    seq(time(notBefore), time(notAfter)), subjectName,
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, seq(
      ext('2.5.29.19', true, seq(...(isCa ? [der(0x01, Buffer.from([0xff]))] : []))),
      ext('2.5.29.15', true, usage))))
  const signature = sign('sha256', tbs, { key: signerKey, dsaEncoding: 'der' })
  return pem(seq(tbs, alg, bits(signature, 0)), 'CERTIFICATE')
}

// ---- Khóa riêng mã hóa khi lưu ----
export function encryptKey(privatePem, secret = MASTER()) {
  const salt = randomBytes(16); const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', scryptSync(secret, salt, 32), iv)
  const body = Buffer.concat([cipher.update(privatePem, 'utf8'), cipher.final()])
  return ['v1', salt, iv, cipher.getAuthTag(), body].map((p) => (Buffer.isBuffer(p) ? p.toString('base64') : p)).join(':')
}
export function decryptKey(stored, secret = MASTER()) {
  const [v, salt, iv, tag, body] = stored.split(':')
  if (v !== 'v1') throw new Error('Định dạng khóa lạ')
  const decipher = createDecipheriv('aes-256-gcm', scryptSync(secret, Buffer.from(salt, 'base64'), 32), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8')
}

const years = (n) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() + n); return d }
const keyPair = () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
export const fingerprint = (certPem) => new X509Certificate(certPem).fingerprint256.replaceAll(':', '').toLowerCase()

// Tên chủ thể chỉ dùng mã tổ chức (không đổi), để tên người cấp trong chứng thư người ký luôn trùng từng byte với tên chủ thể của CA.
const caName = (org) => name(`DX-Lab CA ${org}`, org)

export function newCa(org, now = new Date()) {
  const { publicKey, privateKey } = keyPair()
  const certPem = buildCert({ subjectName: caName(org), publicKey, isCa: true, signerKey: privateKey, notBefore: new Date(now - 60_000), notAfter: years(CA_YEARS) })
  return { certPem, keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
}
export function newLeaf(ca, org, actorId, actorName, now = new Date()) {
  const { publicKey, privateKey } = keyPair()
  const certPem = buildCert({
    subjectName: name(actorName || actorId, org, actorId), publicKey, isCa: false,
    signerKey: createPrivateKey(ca.keyPem), issuerName: caName(org), notBefore: new Date(now - 60_000), notAfter: years(LEAF_YEARS),
  })
  return { certPem, keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
}

// ---- Kho khóa và chứng thư trong CSDL ----
async function loadKey(subject) {
  const row = (await sql(`SELECT cert_pem, key_enc FROM pki_key WHERE subject = ${lit(subject)}`))[0]
  return row ? { certPem: row[0], keyPem: decryptKey(row[1]) } : null
}
async function storeKey(subject, org, kind, k) {
  // Hai tiến trình cùng lần ký đầu tiên: bên đến sau không ghi đè, rồi dùng bản của bên đến trước.
  await sql(`INSERT INTO pki_key (subject, org_id, kind, cert_pem, key_enc) VALUES (${lit(subject)}, ${lit(org)}, ${lit(kind)}, ${lit(k.certPem)}, ${lit(encryptKey(k.keyPem))}) ON CONFLICT DO NOTHING`)
  return loadKey(subject)
}
export async function ensureCa(org) {
  return (await loadKey(`ca:${org}`)) ?? storeKey(`ca:${org}`, org, 'ca', newCa(org))
}
export async function ensureLeaf(org, actorId, actorName) {
  const subject = `user:${org}:${actorId}`
  const have = await loadKey(subject)
  if (have && new X509Certificate(have.certPem).validTo && Date.parse(new X509Certificate(have.certPem).validTo) > Date.now() + 86_400_000) return have
  if (have) throw new Error('Chứng thư người ký đã hết hạn; cần cấp lại')
  const ca = await ensureCa(org)
  const k = newLeaf(ca, org, actorId, actorName)
  return storeKey(subject, org, 'user', k)
}

// ---- Ký và kiểm ----
/** Bản tóm tắt chuẩn hóa của một hành động duyệt: thứ tự khóa cố định, nên ký và kiểm luôn trên đúng một chuỗi. */
export function canonicalPayload(ev, dataSha256) {
  return JSON.stringify({
    v: 1, event: Number(ev.id), submission: ev.submission_id, step: ev.step_key, action: ev.action, note: ev.note ?? '',
    actor: ev.actor_id, at: new Date(ev.created_at).toISOString(), data: dataSha256,
  })
}
export const signPayload = (payload, keyPem) => sign('sha256', Buffer.from(payload), { key: createPrivateKey(keyPem), dsaEncoding: 'der' }).toString('base64')

/** Kiểm một chữ ký: chứng thư do CA cấp, chữ ký đúng với khóa công khai trong chứng thư, và lúc ký chứng thư còn hiệu lực. */
export function verifySignature({ payload, signature, certPem, caPem, signedAt }) {
  try {
    const cert = new X509Certificate(certPem)
    const ca = new X509Certificate(caPem)
    if (!ca.ca) return { valid: false, reason: 'Chứng thư gốc không phải CA' }
    if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) return { valid: false, reason: 'Chứng thư người ký không do CA của tổ chức cấp' }
    const at = new Date(signedAt).getTime()
    if (at < Date.parse(cert.validFrom) || at > Date.parse(cert.validTo)) return { valid: false, reason: 'Lúc ký chứng thư không còn hiệu lực' }
    if (!verify('sha256', Buffer.from(payload), { key: createPublicKey(certPem), dsaEncoding: 'der' }, Buffer.from(signature, 'base64'))) return { valid: false, reason: 'Chữ ký không khớp nội dung' }
    return { valid: true }
  } catch (err) {
    return { valid: false, reason: `Chữ ký hoặc chứng thư hỏng: ${err.message}` }
  }
}

/** Ký một sự kiện duyệt của người (không ký sự kiện của AI). Chạy lại an toàn: đã ký rồi thì bỏ qua. */
export async function signEvent(ev) {
  if (ev.actor_id === 'ai') return null
  const done = await sql(`SELECT 1 FROM event_signature WHERE event_id = ${Number(ev.id)}`)
  if (done.length) return null
  const sub = (await sql(`SELECT org_id, sha256(convert_to(data::text, 'UTF8')) FROM submission WHERE id = ${lit(ev.submission_id)}`))[0]
  if (!sub) throw new Error(`Không thấy hồ sơ ${ev.submission_id}`)
  const [org, dataHex] = [sub[0], sub[1].replace(/^\\x/, '')]
  const leaf = await ensureLeaf(org, ev.actor_id, ev.actor_name)
  const payload = canonicalPayload(ev, dataHex)
  await sql(`INSERT INTO event_signature (event_id, org_id, payload, signature, cert_pem, cert_fingerprint) VALUES (${Number(ev.id)}, ${lit(org)}, ${lit(payload)}, ${lit(signPayload(payload, leaf.keyPem))}, ${lit(leaf.certPem)}, ${lit(fingerprint(leaf.certPem))}) ON CONFLICT DO NOTHING`)
  return { event: ev.id }
}

// ---- API ----
const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

async function verifySubmission(req, submissionId) {
  if (!UUID.test(submissionId ?? '')) throw new HttpError(400, 'Mã hồ sơ không hợp lệ')
  // Đọc bằng quyền của người gọi: chỉ chữ ký của những sự kiện họ được xem mới trả về.
  const data = await asUser(req, 'query($s: uuid!) { submission_event(where: {submission_id: {_eq: $s}}, order_by: {id: asc}) { id actor_name action step_key signature { payload signature cert_pem cert_fingerprint signed_at } } }', { s: submissionId })
  const org = orgOf(req)
  const ca = await loadKey(`ca:${org}`)
  return data.submission_event.map((e) => {
    const base = { event: Number(e.id), step: e.step_key, action: e.action, actor: e.actor_name }
    if (!e.signature) return { ...base, signed: false }
    const s = e.signature
    const result = ca ? verifySignature({ payload: s.payload, signature: s.signature, certPem: s.cert_pem, caPem: ca.certPem, signedAt: s.signed_at }) : { valid: false, reason: 'Tổ chức chưa có CA' }
    return { ...base, signed: true, fingerprint: s.cert_fingerprint, signed_at: s.signed_at, ...result }
  })
}

export async function handlePki(req, res) {
  try {
    const url = new URL(req.url, 'http://x')
    if (!claimsOf(req).sub) throw new HttpError(401, 'Thiếu thông tin đăng nhập')
    if (req.method === 'GET' && url.pathname === '/signatures/verify') return json(res, 200, await verifySubmission(req, url.searchParams.get('submission')))
    if (req.method === 'GET' && url.pathname === '/pki/ca') {
      const ca = await ensureCa(orgOf(req))
      return res.writeHead(200, { 'content-type': 'application/x-pem-file', 'content-disposition': 'attachment; filename="ca.pem"' }).end(ca.certPem)
    }
    throw new HttpError(404, 'Không tìm thấy')
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err)
    const status = err instanceof HttpError ? err.status : 500
    json(res, status, { message: status === 500 ? 'Lỗi máy chủ' : err.message })
  }
}
