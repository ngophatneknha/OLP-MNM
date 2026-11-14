// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Dịch vụ nền nối Hasura với Flowable. Không phụ thuộc gói ngoài (Node >= 22).
// Nhận Hasura event trigger tại POST / :
//   app_publish       app được tạo / đổi spec      -> biên dịch, triển khai BPMN, tạo view phẳng
//   submission_start  có hồ sơ mới                 -> khởi tạo tiến trình (businessKey = submission.id)
//   submission_act    có hành động duyệt/từ chối   -> hoàn tất user task tương ứng
//   app_change_check  có đề xuất thay đổi quy trình -> kiểm tra hợp lệ + chạy thử trên hồ sơ cũ
// Nhận Hasura action tại POST /library : kho quy trình mẫu đọc từ thư mục /library.
// Nhận Hasura action tại POST /ai/spec : mô tả bằng lời -> bản mô tả ứng dụng (xem ai.js).
// Sau mỗi bước, trạng thái hồ sơ trong DB được đồng bộ lại từ Flowable (Flowable là nguồn sự thật của quy trình).
// Hasura tự gửi lại sự kiện khi nhận mã lỗi, nên mọi thao tác ở đây phải chạy lại được an toàn.

import { createServer } from 'node:http'
import { readdirSync, readFileSync } from 'node:fs'
import { validateSpec, toBpmn, toViewSql, simulate } from './compile.js'
import { generateApp } from './ai.js'

const { BRIDGE_SECRET, FLOWABLE_URL, FLOWABLE_USER, FLOWABLE_PASSWORD, HASURA_URL, HASURA_ADMIN_SECRET } = process.env
for (const name of ['BRIDGE_SECRET', 'FLOWABLE_URL', 'FLOWABLE_USER', 'FLOWABLE_PASSWORD', 'HASURA_URL', 'HASURA_ADMIN_SECRET']) {
  if (!process.env[name]) throw new Error(`Thiếu biến môi trường ${name}`)
}
const flowableAuth = 'Basic ' + Buffer.from(`${FLOWABLE_USER}:${FLOWABLE_PASSWORD}`).toString('base64')

async function flowable(method, path, body) {
  const form = body instanceof FormData
  const res = await fetch(FLOWABLE_URL + path, {
    method,
    headers: form ? { authorization: flowableAuth } : { authorization: flowableAuth, 'content-type': 'application/json' },
    body: form ? body : body && JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Flowable ${method} ${path}: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function hasuraPost(path, body) {
  const res = await fetch(HASURA_URL + path, {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': HASURA_ADMIN_SECRET, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`Hasura ${path}: ${JSON.stringify(json)}`)
  return json
}
const gql = (query, variables) => hasuraPost('/v1/graphql', { query, variables })

const setAppStatus = (key, status, error = null) => gql(
  'mutation($key: String!, $status: String!, $error: String) { update_app_by_pk(pk_columns: {key: $key}, _set: {status: $status, error: $error}) { key } }',
  { key, status, error })

async function publishApp(app) {
  const errors = validateSpec(app.spec)
  if (errors.length) return setAppStatus(app.key, 'error', errors.join('\n'))
  const form = new FormData()
  form.append('file', new Blob([toBpmn(app.key, app.name, app.spec)], { type: 'text/xml' }), `app_${app.key}.bpmn20.xml`)
  await flowable('POST', '/repository/deployments', form)
  await hasuraPost('/v2/query', { type: 'run_sql', args: { source: 'default', sql: toViewSql(app.key, app.spec) } })
  await setAppStatus(app.key, 'published')
}

/** Ghi bước đang chờ (hoặc kết quả cuối) của hồ sơ từ Flowable vào DB. */
async function syncSubmission(id) {
  const tasks = (await flowable('GET', `/runtime/tasks?processInstanceBusinessKey=${id}`)).data
  let set
  if (tasks.length) {
    const links = await flowable('GET', `/runtime/tasks/${tasks[0].id}/identitylinks`)
    set = { current_step: tasks[0].taskDefinitionKey.replace(/^step_/, ''), waiting_role: links.find((l) => l.group)?.group ?? null }
  } else {
    const done = (await flowable('GET', `/history/historic-process-instances?businessKey=${id}&finished=true`)).data
    // Chưa có tiến trình nào: báo lỗi để Hasura gửi lại sự kiện sau.
    if (!done.length) throw new Error(`Chưa có tiến trình cho hồ sơ ${id}`)
    set = { current_step: null, waiting_role: null, status: done[0].endActivityId === 'approved' ? 'approved' : 'rejected', finished_at: new Date().toISOString() }
  }
  await gql('mutation($id: uuid!, $set: submission_set_input!) { update_submission_by_pk(pk_columns: {id: $id}, _set: $set) { id } }', { id, set })
}

async function startSubmission(sub) {
  const started = (await flowable('GET', `/history/historic-process-instances?businessKey=${sub.id}`)).data
  if (!started.length) {
    await flowable('POST', '/runtime/process-instances', {
      processDefinitionKey: `app_${sub.app_key}`,
      businessKey: sub.id,
      variables: Object.entries(sub.data).filter(([, value]) => value !== null).map(([name, value]) => ({ name, value })),
    })
  }
  await syncSubmission(sub.id)
}

async function actOnSubmission(ev) {
  // Chỉ hoàn tất đúng bước mà người dùng đã nhìn thấy; hành động cũ (bấm hai lần, quy trình đã đi tiếp) bị bỏ qua.
  const tasks = (await flowable('GET', `/runtime/tasks?processInstanceBusinessKey=${ev.submission_id}&taskDefinitionKey=step_${encodeURIComponent(ev.step_key)}`)).data
  for (const task of tasks) {
    await flowable('POST', `/runtime/tasks/${task.id}`, {
      action: 'complete',
      variables: [{ name: 'approved', value: ev.action !== 'reject' }],
    })
  }
  await syncSubmission(ev.submission_id)
}

/** "CI" cho một đề xuất thay đổi quy trình: kết quả ghi vào app_change.checks, thiếu nó thì không ai chấp nhận được. */
async function checkChange(change) {
  const errors = validateSpec(change.spec)
  let simulation = null
  if (!errors.length) {
    const { data } = await gql(
      'query($k: String!) { app_by_pk(key: $k) { spec } submission(where: {app_key: {_eq: $k}}) { data created_at events { step_key created_at } } }',
      { k: change.app_key })
    simulation = simulate(data.app_by_pk.spec, change.spec, data.submission)
  }
  await gql('mutation($id: bigint!, $c: jsonb!) { update_app_change_by_pk(pk_columns: {id: $id}, _set: {checks: $c}) { id } }',
    { id: change.id, c: { errors, simulation } })
}

const readLibrary = () => readdirSync('/library').filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`/library/${f}`, 'utf8')))
  .map(({ key, name, category, description, spec }) => ({ key, name, category, description, spec }))

// Tự lành: xuất bản lại mà nội dung không đổi thì Hasura không phát sự kiện (trigger chỉ bắn khi cột thay đổi),
// và sự kiện cũng có thể hết lượt gửi lại. Quét định kỳ các ứng dụng còn 'pending' để không cái nào bị kẹt.
async function sweepPendingApps() {
  try {
    const { data } = await gql('{ app(where: {status: {_eq: "pending"}}) { key name spec } }')
    for (const app of data.app) await publishApp(app)
  } catch (err) {
    console.error('Quét ứng dụng đang chờ thất bại:', err.message)
  }
}
setInterval(sweepPendingApps, 10000)

const handlers = { app_publish: publishApp, submission_start: startSubmission, submission_act: actOnSubmission, app_change_check: checkChange }

createServer(async (req, res) => {
  try {
    if (req.method !== 'POST' || req.headers['x-bridge-secret'] !== BRIDGE_SECRET) {
      res.writeHead(401).end()
      return
    }
    let body = ''
    for await (const chunk of req) body += chunk
    const payload = JSON.parse(body)
    let result = {}
    if (req.url === '/library') {
      result = readLibrary()
    } else if (req.url === '/ai/spec') {
      // Lỗi của action trả về dạng { message } với mã 4xx để Hasura chuyển nguyên văn cho người dùng.
      try {
        result = await generateApp(payload.input.description)
      } catch (err) {
        console.error(err)
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ message: String(err.message) }))
        return
      }
    } else {
      await handlers[payload.trigger.name](payload.event.data.new)
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result))
  } catch (err) {
    console.error(err)
    res.writeHead(500).end(String(err))
  }
}).listen(3000, () => console.log('workflow-bridge lắng nghe cổng 3000'))
