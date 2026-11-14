// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Cầu nối Hasura event trigger -> Flowable REST. Không phụ thuộc gói ngoài (Node >= 22).
//   request INSERT          -> khởi tạo tiến trình `requestApproval` (businessKey = request.id)
//   request.status thay đổi -> hoàn tất user task "xem xét" với biến `approved`
// Hasura tự gửi lại sự kiện khi nhận mã lỗi, nên mọi thao tác ở đây phải chạy lại được an toàn.

import { createServer } from 'node:http'

const { BRIDGE_SECRET, FLOWABLE_URL, FLOWABLE_USER, FLOWABLE_PASSWORD, HASURA_URL, HASURA_ADMIN_SECRET } = process.env
for (const name of ['BRIDGE_SECRET', 'FLOWABLE_URL', 'FLOWABLE_USER', 'FLOWABLE_PASSWORD', 'HASURA_URL', 'HASURA_ADMIN_SECRET']) {
  if (!process.env[name]) throw new Error(`Thiếu biến môi trường ${name}`)
}
const flowableAuth = 'Basic ' + Buffer.from(`${FLOWABLE_USER}:${FLOWABLE_PASSWORD}`).toString('base64')

async function flowable(method, path, body) {
  const res = await fetch(FLOWABLE_URL + path, {
    method,
    headers: { authorization: flowableAuth, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Flowable ${method} ${path}: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function hasura(query, variables) {
  const res = await fetch(HASURA_URL, {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`Hasura: ${JSON.stringify(json.errors)}`)
}

async function onCreated(request) {
  const running = await flowable('GET', `/runtime/process-instances?businessKey=${request.id}`)
  const instance = running.data[0] ?? await flowable('POST', '/runtime/process-instances', {
    processDefinitionKey: 'requestApproval',
    businessKey: request.id,
    variables: [
      { name: 'title', value: request.title },
      { name: 'requesterId', value: request.requester_id },
    ],
  })
  await hasura(
    'mutation($id: uuid!, $pid: String!) { update_request_by_pk(pk_columns: {id: $id}, _set: {process_instance_id: $pid}) { id } }',
    { id: request.id, pid: instance.id },
  )
}

async function onDecided(request) {
  const tasks = await flowable('GET', `/runtime/tasks?processInstanceBusinessKey=${request.id}`)
  if (tasks.data.length === 0) {
    // Đã kết thúc (sự kiện gửi lại) thì bỏ qua; chưa từng khởi tạo thì báo lỗi để Hasura gửi lại sau.
    const done = await flowable('GET', `/history/historic-process-instances?businessKey=${request.id}&finished=true`)
    if (done.data.length === 0) throw new Error(`Chưa có tiến trình cho yêu cầu ${request.id}`)
  }
  for (const task of tasks.data) {
    await flowable('POST', `/runtime/tasks/${task.id}`, {
      action: 'complete',
      variables: [{ name: 'approved', value: request.status === 'approved' }],
    })
  }
}

createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || req.headers['x-bridge-secret'] !== BRIDGE_SECRET) {
      res.writeHead(401).end()
      return
    }
    let body = ''
    for await (const chunk of req) body += chunk
    const { event } = JSON.parse(body)
    if (event.op === 'INSERT') await onCreated(event.data.new)
    else if (event.data.new.status !== 'pending') await onDecided(event.data.new)
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  } catch (err) {
    console.error(err)
    res.writeHead(500).end(String(err))
  }
}).listen(3000, () => console.log('workflow-bridge lắng nghe cổng 3000'))
