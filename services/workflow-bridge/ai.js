// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Trợ lý AI: mô tả quy trình bằng lời -> bản mô tả ứng dụng (spec).
// Gọi bất kỳ máy chủ tương thích OpenAI /chat/completions (Ollama, vLLM, Mistral...).
// AI chỉ ĐỀ XUẤT: kết quả luôn đi qua validateSpec và phải được con người xem lại trước khi xuất bản.

import { validateSpec, isKey, ROLES, FIELD_TYPES } from './compile.js'

const { AI_BASE_URL, AI_API_KEY, AI_MODEL } = process.env

const SYSTEM = `Bạn là chuyên gia phân tích nghiệp vụ. Nhiệm vụ: chuyển mô tả quy trình làm việc (tiếng Việt) thành cấu hình ứng dụng.
Chỉ trả về MỘT đối tượng JSON, không giải thích, theo đúng khuôn:
{
  "key": "ma_ung_dung",
  "name": "Tên ứng dụng ngắn gọn",
  "fields": [{ "key": "so_tien", "label": "Số tiền", "type": "number", "required": true }],
  "steps": [{ "key": "truong_phong", "name": "Trưởng phòng duyệt", "role": "manager", "type": "approve",
              "when": { "field": "so_tien", "op": ">", "value": 5000000 } }],
  "questions": ["Câu hỏi làm rõ điểm còn mơ hồ"]
}
Quy tắc:
- Mọi "key": chữ thường KHÔNG dấu, số, gạch dưới; bắt đầu bằng chữ; 2-31 ký tự; không trùng nhau.
- "fields" là các ô người gửi phải điền. "type" thuộc: ${FIELD_TYPES.join(', ')}. Kiểu "select" cần "options" (mảng chuỗi).
  Không dùng các key: id, status, submitter_id, created_at, finished_at.
- "steps" là các bước xử lý SAU khi người gửi nộp, theo đúng thứ tự. Người gửi KHÔNG phải là một bước.
- "role" thuộc: staff (nhân viên), manager (trưởng phòng/quản lý trực tiếp), director (giám đốc/ban lãnh đạo), accountant (kế toán/tài chính/thủ quỹ).
- "type": "approve" nếu bước đó có quyền duyệt hoặc từ chối; "task" nếu chỉ thực hiện việc rồi xác nhận xong (ví dụ chi tiền, cấp phát, lưu hồ sơ).
- "when" (tùy chọn): bước chỉ diễn ra khi điều kiện đúng, ngược lại bị bỏ qua. "op" thuộc > >= < <= == !=.
  Trường dùng trong "when" phải có "required": true. Trường số so sánh với số; trường chữ chỉ dùng == hoặc != với chuỗi.
  Số tiền viết thành số nguyên đồng (5 triệu = 5000000).
- "questions": tối đa 3 câu hỏi ngắn về những điểm mô tả chưa nói rõ (ví dụ ai duyệt thay khi vắng mặt). Không có thì để mảng rỗng.
- Chỉ tạo trường và bước mà mô tả có nhắc tới. "Báo lại", "thông báo" không phải là một bước.
- "Trên X thì phải THÊM cấp B duyệt" nghĩa là cấp A luôn duyệt (không có "when"), còn cấp B có "when" lớn hơn X.
  Chỉ đặt "when" cho cấp A khi mô tả nói rõ cấp A KHÔNG tham gia trong trường hợp còn lại.

Ví dụ. Mô tả: "Nhân viên xin nghỉ phép, ghi số ngày nghỉ và lý do. Quản lý duyệt, nghỉ từ 3 ngày trở lên thì cần thêm giám đốc đồng ý."
Kết quả:
{"key":"nghi_phep","name":"Xin nghỉ phép",
 "fields":[{"key":"so_ngay","label":"Số ngày nghỉ","type":"number","required":true},{"key":"ly_do","label":"Lý do","type":"longtext","required":true}],
 "steps":[{"key":"quan_ly","name":"Quản lý duyệt","role":"manager","type":"approve"},
          {"key":"giam_doc","name":"Giám đốc duyệt","role":"director","type":"approve","when":{"field":"so_ngay","op":">=","value":3}}],
 "questions":["Quản lý vắng mặt thì ai duyệt thay?"]}`

async function chat(messages) {
  const res = await fetch(`${AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${AI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, temperature: 0, response_format: { type: 'json_object' }, messages }),
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) throw new Error(`Máy chủ AI trả mã ${res.status}`)
  const content = (await res.json()).choices[0].message.content
  try {
    return { content, json: JSON.parse(content) }
  } catch {
    return { content, json: null }
  }
}

const check = (json) => !json ? ['Kết quả không phải JSON hợp lệ']
  : [...(isKey(json.key) ? [] : ['"key" của ứng dụng không hợp lệ']),
    ...(typeof json.name === 'string' && json.name.trim() ? [] : ['Thiếu "name"']),
    ...validateSpec(json)]

/** Trả về { key, name, spec, questions, errors }. errors rỗng nghĩa là spec xuất bản được ngay. */
export async function generateApp(description) {
  if (!AI_BASE_URL || !AI_MODEL) throw new Error('Trợ lý AI chưa được cấu hình (AI_BASE_URL, AI_MODEL trong .env)')
  if (typeof description !== 'string' || description.trim().length < 10 || description.length > 4000) {
    throw new Error('Mô tả cần từ 10 đến 4000 ký tự')
  }
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: description }]
  let { content, json } = await chat(messages)
  let errors = check(json)
  if (errors.length) {
    // Cho mô hình một lần tự sửa dựa trên lỗi của bộ kiểm tra.
    messages.push({ role: 'assistant', content }, { role: 'user', content: `Cấu hình chưa hợp lệ:\n- ${errors.join('\n- ')}\nHãy trả lại JSON đã sửa.` })
    ;({ json } = await chat(messages))
    errors = check(json)
  }
  json ??= {}
  return {
    key: isKey(json.key) ? json.key : '',
    name: typeof json.name === 'string' ? json.name.slice(0, 100) : '',
    spec: { fields: json.fields ?? [], steps: json.steps ?? [] },
    questions: Array.isArray(json.questions) ? json.questions.filter((q) => typeof q === 'string').slice(0, 3) : [],
    errors,
  }
}
