// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { handleEvents, notify, clientCount } from './events.js'

test('SSE: kết nối nhận được nhịp khi notify, và được dọn khi đóng', async () => {
  const srv = createServer(handleEvents).listen(0)
  const ctl = new AbortController()
  const res = await fetch(`http://127.0.0.1:${srv.address().port}/events`, { signal: ctl.signal })
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
  assert.equal(res.headers.get('x-accel-buffering'), 'no')
  const reader = res.body.getReader()
  let text = ''
  const read = async (until) => { while (!text.includes(until)) text += new TextDecoder().decode((await reader.read()).value) }
  await read('retry: 3000')
  assert.equal(clientCount(), 1)
  notify()
  await read('data: tick')
  ctl.abort()
  await new Promise((ok) => setTimeout(ok, 100))
  assert.equal(clientCount(), 0)
  srv.close()
})
