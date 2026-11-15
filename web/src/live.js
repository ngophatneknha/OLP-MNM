// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Cập nhật thời gian thực dùng chung: một kênh SSE cho cả ứng dụng, mỗi màn hình đăng ký hàm tải lại của mình.
// Có nhịp từ máy chủ thì tải lại ngay; kênh đang đứt thì quay về hỏi định kỳ (3 giây); kênh sống thì chỉ hỏi bù mỗi 30 giây.

const FAST_MS = 3000
const SLOW_MS = 30000
const listeners = new Map() // hàm tải lại -> thời điểm chạy gần nhất
let connected = false
let scheduler

const run = (fn) => { listeners.set(fn, Date.now()); Promise.resolve().then(fn).catch(() => {}) }

/** Nhận nhịp từ máy chủ: tải lại mọi màn hình đang mở. */
export function tick() { for (const fn of [...listeners.keys()]) run(fn) }
export function setConnected(value) { connected = value }

/** Đăng ký hàm tải lại; trả về hàm hủy đăng ký (gọi khi rời màn hình). */
export function live(fn) {
  listeners.set(fn, Date.now())
  scheduler ??= setInterval(() => {
    const limit = connected ? SLOW_MS : FAST_MS
    for (const [f, last] of listeners) if (Date.now() - last >= limit) run(f)
  }, 1000)
  return () => listeners.delete(fn)
}

/** Mở kênh SSE bằng fetch (EventSource không gửi được tiêu đề Authorization). Tự nối lại khi đứt. */
export function startStream(url, headers) {
  let stop = false
  ;(async () => {
    while (!stop) {
      try {
        const res = await fetch(url, { headers: await headers() })
        if (!res.ok) throw new Error(res.status)
        setConnected(true)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop()
          if (frames.some((f) => f.includes('data: tick'))) tick()
        }
      } catch { /* mất kết nối: rơi xuống hỏi định kỳ rồi thử nối lại */ }
      setConnected(false)
      await new Promise((ok) => setTimeout(ok, 3000))
    }
  })()
  return () => { stop = true }
}
