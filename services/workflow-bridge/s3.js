// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Gọi kho S3 (SeaweedFS) có xác thực AWS Signature V4, chỉ dùng thư viện chuẩn của Node (không thêm phụ thuộc).
import { createHash, createHmac } from 'node:crypto'

const { S3_URL = 'http://seaweedfs:8333', S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION = 'us-east-1' } = process.env
const hex = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data) => createHmac('sha256', key).update(data).digest()
// Mã hóa từng đoạn đường dẫn theo đúng quy tắc của SigV4 (ngoài A-Z a-z 0-9 - _ . ~ đều mã hóa).
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** Trả về các tiêu đề cần thêm (host, x-amz-date, x-amz-content-sha256, authorization) cho một yêu cầu. */
export function sign({ method, url, headers = {}, body = '', accessKey, secretKey, region = 'us-east-1', now = new Date() }) {
  const u = new URL(url)
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)
  const payloadHash = hex(body)
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate }
  const names = Object.keys(all).sort()
  const query = [...u.searchParams].map(([k, v]) => [encode(k), encode(v)]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  const path = u.pathname.split('/').map((seg) => encode(decodeURIComponent(seg))).join('/')
  const canonical = [method, path, query, names.map((n) => `${n}:${all[n]}\n`).join(''), names.join(';'), payloadHash].join('\n')
  const scope = `${day}/${region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request')
  const signature = createHmac('sha256', key).update(toSign).digest('hex')
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` }
}

/** fetch tới kho S3 với chữ ký; path dạng `/dxlab/khóa`. Thiếu khóa truy cập thì gửi không ký (kho phải tự chặn). */
export function s3fetch(path, { method = 'GET', body, signal } = {}) {
  const url = `${S3_URL}${path}`
  const headers = S3_ACCESS_KEY && S3_SECRET_KEY
    ? sign({ method, url, body: body ?? '', accessKey: S3_ACCESS_KEY, secretKey: S3_SECRET_KEY, region: S3_REGION })
    : {}
  delete headers.host // fetch tự đặt Host; giá trị đã nằm trong chữ ký
  return fetch(url, { method, body, headers, signal })
}
