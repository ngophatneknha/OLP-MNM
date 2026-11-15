// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Bộ biên dịch "bản mô tả ứng dụng" (spec) -> quy trình BPMN + view dữ liệu phẳng.
// Spec là JSON do người dùng (hoặc AI) soạn:
//   { fields: [{ key, label, type, required?, options? }],
//     steps:  [{ key, name, role, type?: 'approve'|'task', when?: { field, op, value } }] }
// Người gửi điền `fields`; hồ sơ đi tuần tự qua `steps`. Bước có `when` bị bỏ qua nếu điều kiện sai.
// Bước 'approve' bị từ chối thì quy trình kết thúc ở trạng thái rejected.
//
// Mọi định danh đều bị ép theo KEY trước khi chèn vào BPMN/SQL: đây là ranh giới tin cậy.

export const ROLES = ['staff', 'manager', 'director', 'accountant']
export const FIELD_TYPES = ['text', 'longtext', 'number', 'date', 'select']
const OPS = ['>', '>=', '<', '<=', '==', '!=']
const KEY = /^[a-z][a-z0-9_]{1,30}$/
// Tên cột cố định của view; trường dữ liệu không được trùng.
const RESERVED = ['id', 'status', 'submitter_id', 'created_at', 'finished_at']

export const isKey = (v) => typeof v === 'string' && KEY.test(v)
const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max

/** Trả về danh sách lỗi (rỗng = hợp lệ). */
export function validateSpec(spec) {
  const errors = []
  if (!spec || typeof spec !== 'object') return ['Bản mô tả phải là một đối tượng JSON']
  const { fields, steps } = spec

  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 30) errors.push('Cần từ 1 đến 30 trường dữ liệu')
  const fieldByKey = new Map()
  for (const f of Array.isArray(fields) ? fields : []) {
    const where = `Trường "${f?.key}"`
    if (!KEY.test(f?.key ?? '')) { errors.push(`${where}: mã phải là chữ thường không dấu, số, gạch dưới`); continue }
    if (RESERVED.includes(f.key)) errors.push(`${where}: mã trùng tên dành riêng`)
    if (fieldByKey.has(f.key)) errors.push(`${where}: mã bị trùng`)
    if (!isText(f.label, 100)) errors.push(`${where}: thiếu nhãn hiển thị`)
    if (!FIELD_TYPES.includes(f.type)) errors.push(`${where}: kiểu phải thuộc ${FIELD_TYPES.join(', ')}`)
    if (f.type === 'select' && !(Array.isArray(f.options) && f.options.length > 0 && f.options.every((o) => isText(o, 100)))) {
      errors.push(`${where}: kiểu select cần danh sách lựa chọn`)
    }
    fieldByKey.set(f.key, f)
  }

  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 10) errors.push('Cần từ 1 đến 10 bước xử lý')
  const stepKeys = new Set()
  for (const s of Array.isArray(steps) ? steps : []) {
    const where = `Bước "${s?.key}"`
    if (!KEY.test(s?.key ?? '')) { errors.push(`${where}: mã phải là chữ thường không dấu, số, gạch dưới`); continue }
    if (stepKeys.has(s.key)) errors.push(`${where}: mã bị trùng`)
    stepKeys.add(s.key)
    if (!isText(s.name, 100)) errors.push(`${where}: thiếu tên bước`)
    if (!ROLES.includes(s.role)) errors.push(`${where}: vai trò phải thuộc ${ROLES.join(', ')}`)
    if (!['approve', 'task', undefined].includes(s.type)) errors.push(`${where}: loại bước phải là approve hoặc task`)
    if (s.when !== undefined) {
      const f = fieldByKey.get(s.when?.field)
      const v = s.when?.value
      if (!f) errors.push(`${where}: điều kiện tham chiếu trường không tồn tại`)
      else if (!f.required) errors.push(`${where}: trường dùng trong điều kiện phải là bắt buộc`)
      else if (!OPS.includes(s.when.op)) errors.push(`${where}: phép so sánh phải thuộc ${OPS.join(' ')}`)
      else if (f.type === 'number' ? !Number.isFinite(v) : !(typeof v === 'string' && /^[^'"\\<>&${}\]]{0,100}$/.test(v))) {
        errors.push(`${where}: giá trị điều kiện không hợp lệ với kiểu của trường`)
      } else if (f.type !== 'number' && !['==', '!='].includes(s.when.op)) {
        errors.push(`${where}: trường dạng chữ chỉ so sánh == hoặc !=`)
      }
    }
  }
  return errors
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Sinh BPMN 2.0 cho Flowable. Chỉ gọi với spec đã qua validateSpec. */
export function toBpmn(appKey, appName, spec) {
  if (!KEY.test(appKey)) throw new Error('Mã ứng dụng không hợp lệ')
  const out = []
  let n = 0
  const flow = (from, to, { id = `f${n++}`, cond } = {}) => out.push(
    `<sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}">` +
    (cond ? `<conditionExpression xsi:type="tFormalExpression"><![CDATA[${cond}]]></conditionExpression>` : '') +
    '</sequenceFlow>')
  const entry = (i) => {
    const s = spec.steps[i]
    return !s ? 'approved' : s.when ? `when_${s.key}` : `step_${s.key}`
  }

  out.push('<startEvent id="start"/>')
  flow('start', entry(0))
  spec.steps.forEach((s, i) => {
    const task = `step_${s.key}`
    const next = entry(i + 1)
    if (s.when) {
      const value = typeof s.when.value === 'number' ? s.when.value : `'${s.when.value}'`
      out.push(`<exclusiveGateway id="when_${s.key}" default="skip_${s.key}"/>`)
      flow(`when_${s.key}`, task, { cond: `\${${s.when.field} ${s.when.op} ${value}}` })
      flow(`when_${s.key}`, next, { id: `skip_${s.key}` })
    }
    out.push(`<userTask id="${task}" name="${xml(s.name)}" flowable:candidateGroups="${s.role}"/>`)
    if (s.type === 'task') {
      flow(task, next)
    } else {
      out.push(`<exclusiveGateway id="ok_${s.key}" default="no_${s.key}"/>`)
      flow(task, `ok_${s.key}`)
      flow(`ok_${s.key}`, next, { cond: '${approved}' })
      flow(`ok_${s.key}`, 'rejected', { id: `no_${s.key}` })
    }
  })
  out.push('<endEvent id="approved"/>', '<endEvent id="rejected"/>')

  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:flowable="http://flowable.org/bpmn" targetNamespace="https://github.com/ngophatneknha/OLP-MNM">
  <process id="app_${appKey}" name="${xml(appName)}" isExecutable="true">
    ${out.join('\n    ')}
  </process>
</definitions>
`
}

/** Sinh SQL tạo view phẳng bi.app_<key> để công cụ BI đọc mà không cần hiểu JSON, và cấp quyền đọc cho vai trò BI của tổ chức sở hữu (bi_<org>). */
export function toViewSql(appKey, spec, org = 'default') {
  if (!KEY.test(appKey)) throw new Error('Mã ứng dụng không hợp lệ')
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(org)) throw new Error('Mã tổ chức không hợp lệ')
  const cols = spec.fields.map((f) => {
    if (!KEY.test(f.key)) throw new Error('Mã trường không hợp lệ')
    const raw = `data->>'${f.key}'`
    return f.type === 'number' ? `(${raw})::numeric AS ${f.key}` : f.type === 'date' ? `(${raw})::date AS ${f.key}` : `${raw} AS ${f.key}`
  })
  return `CREATE SCHEMA IF NOT EXISTS bi;
DROP VIEW IF EXISTS bi.app_${appKey};
CREATE VIEW bi.app_${appKey} AS
  SELECT id, status, submitter_id, created_at, finished_at, ${cols.join(', ')}
  FROM public.submission WHERE app_key = '${appKey}';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_${org}') THEN
    GRANT USAGE ON SCHEMA bi TO "bi_${org}";
    GRANT SELECT ON bi.app_${appKey} TO "bi_${org}";
  END IF;
END $$;`
}

/** Bước có diễn ra với dữ liệu hồ sơ này không (cùng ngữ nghĩa với biểu thức điều kiện trong BPMN). */
export function stepApplies(step, data) {
  if (!step.when) return true
  const a = data[step.when.field], b = step.when.value
  return { '>': a > b, '>=': a >= b, '<': a < b, '<=': a <= b, '==': a === b, '!=': a !== b }[step.when.op] ?? false
}

/**
 * "Hầm gió": chạy thử spec mới trên các hồ sơ đã có để thấy tác động trước khi phát hành.
 * submissions: [{ data, created_at, events: [{ step_key, created_at }] }]
 * Trả về số hồ sơ đổi đường đi, số lượt qua từng bước trước/sau, và thời gian chờ ước tính tiết kiệm được
 * (tính từ thời gian xử lý trung bình thực tế của từng bước; bước mới chưa có số liệu được tính là 0).
 */
export function simulate(oldSpec, newSpec, submissions) {
  const durations = {} // step_key -> [giờ]
  for (const s of submissions) {
    let previous = Date.parse(s.created_at)
    for (const e of [...(s.events ?? [])].sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at))) {
      const at = Date.parse(e.created_at)
      ;(durations[e.step_key] ??= []).push((at - previous) / 3600000)
      previous = at
    }
  }
  const avgHours = (key) => durations[key]?.length ? durations[key].reduce((a, b) => a + b, 0) / durations[key].length : 0
  const path = (spec, data) => spec.steps.filter((step) => stepApplies(step, data)).map((step) => step.key)

  const count = {} // step_key -> { before, after }
  let changed = 0
  let savedHours = 0
  for (const s of submissions) {
    const before = path(oldSpec, s.data), after = path(newSpec, s.data)
    for (const key of before) (count[key] ??= { before: 0, after: 0 }).before++
    for (const key of after) (count[key] ??= { before: 0, after: 0 }).after++
    if (before.join() !== after.join()) changed++
    for (const key of before) if (!after.includes(key)) savedHours += avgHours(key)
    for (const key of after) if (!before.includes(key)) savedHours -= avgHours(key)
  }
  const nameOf = (key) => (newSpec.steps.find((s) => s.key === key) ?? oldSpec.steps.find((s) => s.key === key)).name
  const round = (n) => Math.round(n * 100) / 100
  return {
    total: submissions.length,
    changed,
    savedHoursPerSubmission: submissions.length ? round(savedHours / submissions.length) : 0,
    steps: Object.entries(count).map(([key, c]) => ({ key, name: nameOf(key), ...c, avgHours: round(avgHours(key)) })),
  }
}
