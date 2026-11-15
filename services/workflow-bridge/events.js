// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Thông báo thời gian thực bằng Server-Sent Events: GET /events giữ kết nối mở, mỗi khi dữ liệu đổi thì đẩy một "nhịp" (không kèm dữ liệu).
// Trình duyệt nhận nhịp rồi tự tải lại bằng GraphQL với token của chính người dùng, nên không có dữ liệu nào lộ qua kênh này.
// Cổng API (APISIX) đã xác thực token trước khi yêu cầu tới đây.
// shortcut: một tiến trình bridge giữ danh sách kết nối trong bộ nhớ; chạy nhiều bản bridge cần kênh chung (Postgres LISTEN/NOTIFY hoặc Redis).

const MAX_CLIENTS = 500
const clients = new Set()
let beat

/** Báo cho mọi trình duyệt đang kết nối rằng có dữ liệu mới. */
export function notify() {
  for (const res of clients) res.write('data: tick\n\n')
}

export function handleEvents(req, res) {
  if (clients.size >= MAX_CLIENTS) return res.writeHead(503, { 'retry-after': '10' }).end()
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    // Báo nginx (APISIX) không đệm phản hồi, nếu không nhịp bị giữ lại.
    'x-accel-buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  clients.add(res)
  // Nhịp giữ kết nối còn sống qua các bộ chuyển tiếp có giới hạn thời gian chờ.
  beat ??= setInterval(() => { for (const c of clients) c.write(': ping\n\n') }, 15_000).unref()
  req.on('close', () => clients.delete(res))
}

export const clientCount = () => clients.size
