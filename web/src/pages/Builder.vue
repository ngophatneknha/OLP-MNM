<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Tạo ứng dụng quy trình: mô tả bằng lời -> AI phác thảo -> con người chỉnh sửa và xem sơ đồ -> xuất bản.
AI chỉ điền vào form này; không có gì được xuất bản nếu người dùng chưa bấm nút.
-->
<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { gql, slug, ROLE_LABEL } from '../lib.js'
import FlowDiagram from '../components/FlowDiagram.vue'

const TYPE_LABEL = { text: 'Chữ ngắn', longtext: 'Chữ dài', number: 'Số', date: 'Ngày', select: 'Lựa chọn' }
const OPS = { '>': 'lớn hơn', '>=': 'từ … trở lên', '<': 'nhỏ hơn', '<=': 'không quá', '==': 'bằng', '!=': 'khác' }

const description = ref('')
const drafting = ref(false)
const questions = ref([])
const message = ref(null) // { ok, text }
const app = reactive({ key: '', name: '', spec: { fields: [], steps: [] } })
const existing = ref([])
const publishing = ref(false)
let timer

async function loadExisting() {
  existing.value = (await gql('{ app(order_by: {created_at: desc}) { key name spec status error } }')).app
}
onMounted(loadExisting)
onUnmounted(() => clearInterval(timer))

function edit(source) {
  app.key = source.key
  app.name = source.name
  app.spec = JSON.parse(JSON.stringify(source.spec))
  // Ô lựa chọn sửa dưới dạng một dòng chữ, cách nhau bằng dấu phẩy.
  for (const field of app.spec.fields) field.optionsText = (field.options ?? []).join(', ')
  message.value = null
}

async function draft() {
  drafting.value = true
  message.value = null
  questions.value = []
  try {
    const { generateApp: result } = await gql(
      'mutation($d: String!) { generateApp(description: $d) { key name spec questions errors } }', { d: description.value })
    edit(result)
    questions.value = result.questions
    message.value = result.errors.length
      ? { ok: false, text: `AI phác thảo chưa hoàn chỉnh, cần bạn sửa: ${result.errors.join('; ')}` }
      : { ok: true, text: 'AI đã phác thảo xong. Hãy xem lại từng ô và từng bước trước khi xuất bản.' }
  } catch (err) {
    message.value = { ok: false, text: `Không nhờ được AI: ${err.message}. Bạn vẫn có thể tự khai báo bên dưới.` }
  } finally {
    drafting.value = false
  }
}

const addField = () => app.spec.fields.push({ key: '', label: '', type: 'text', required: true, optionsText: '' })
const addStep = () => app.spec.steps.push({ key: '', name: '', role: 'manager', type: 'approve' })
function move(list, index, delta) {
  const [item] = list.splice(index, 1)
  list.splice(index + delta, 0, item)
}
function toggleCondition(step) {
  if (step.when) delete step.when
  else step.when = { field: app.spec.fields.find((f) => f.required)?.key ?? '', op: '>', value: 0 }
}
const fieldType = (key) => app.spec.fields.find((f) => f.key === key)?.type

/** Chuẩn hóa form thành spec gửi lên máy chủ (mã tự sinh từ nhãn nếu để trống). */
function toSpec() {
  const fields = app.spec.fields.map((f) => {
    const field = { key: f.key || slug(f.label), label: f.label.trim(), type: f.type, required: !!f.required }
    if (f.type === 'select') field.options = f.optionsText.split(',').map((o) => o.trim()).filter(Boolean)
    return field
  })
  const steps = app.spec.steps.map((s) => {
    const step = { key: s.key || slug(s.name), name: s.name.trim(), role: s.role, type: s.type ?? 'approve' }
    if (s.when) step.when = { field: s.when.field, op: s.when.op, value: fieldType(s.when.field) === 'number' ? Number(s.when.value) : String(s.when.value) }
    return step
  })
  return { fields, steps }
}

async function publish() {
  publishing.value = true
  message.value = null
  const key = app.key || slug(app.name)
  try {
    await gql(
      `mutation($o: app_insert_input!) { insert_app_one(object: $o, on_conflict: {constraint: app_pkey, update_columns: [name, spec]}) { key } }`,
      { o: { key, name: app.name.trim(), spec: toSpec() } })
    app.key = key
    // Máy chủ biên dịch bất đồng bộ; chờ kết quả published / error.
    clearInterval(timer)
    timer = setInterval(async () => {
      await loadExisting()
      const current = existing.value.find((a) => a.key === key)
      if (!current || current.status === 'pending') return
      clearInterval(timer)
      publishing.value = false
      message.value = current.status === 'published'
        ? { ok: true, text: `Đã xuất bản “${current.name}”. Mọi người có thể gửi hồ sơ ngay ở mục Ứng dụng.` }
        : { ok: false, text: `Chưa xuất bản được:\n${current.error}` }
    }, 1500)
  } catch (err) {
    publishing.value = false
    message.value = { ok: false, text: `Không lưu được: ${err.message}` }
  }
}
</script>

<template>
  <h1 class="page-title">Tạo ứng dụng</h1>
  <p class="page-hint">Mô tả cách công việc đang diễn ra; hệ thống dựng form, luồng duyệt và phân quyền cho bạn.</p>

  <section class="card mt-6">
    <label class="label" for="description">Mô tả quy trình bằng lời</label>
    <textarea
      id="description" v-model="description" class="input" rows="3"
      placeholder="Ví dụ: Nhân viên xin tạm ứng, dưới 5 triệu thì trưởng phòng duyệt, trên 5 triệu phải thêm giám đốc, kế toán chi tiền."
    />
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <button class="btn-primary" :disabled="drafting || description.trim().length < 10" @click="draft">
        {{ drafting ? 'AI đang phác thảo…' : 'Nhờ AI phác thảo' }}
      </button>
      <span class="text-xs text-slate-500">AI chỉ đề xuất. Bạn xem lại và quyết định.</span>
    </div>
    <div v-if="questions.length" class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      <div class="font-medium">AI thấy mô tả chưa nói rõ:</div>
      <ul class="mt-1 list-disc pl-5"><li v-for="q in questions" :key="q">{{ q }}</li></ul>
    </div>
  </section>

  <p
    v-if="message" class="mt-4 whitespace-pre-line rounded-lg p-3 text-sm"
    :class="message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'" role="status"
  >{{ message.text }}</p>

  <section class="card mt-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label class="label" for="app-name">Tên ứng dụng</label>
        <input id="app-name" v-model="app.name" class="input" placeholder="Xin tạm ứng" />
      </div>
      <div>
        <label class="label" for="app-key">Mã (tự sinh nếu để trống)</label>
        <input id="app-key" v-model="app.key" class="input font-mono" :placeholder="app.name ? slug(app.name) : 'xin_tam_ung'" />
      </div>
    </div>

    <h2 class="mt-6 font-semibold">Thông tin người gửi cần điền</h2>
    <div v-for="(field, i) in app.spec.fields" :key="i" class="mt-3 grid items-end gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-12">
      <div class="sm:col-span-4">
        <label class="label" :for="`fl${i}`">Nhãn</label>
        <input :id="`fl${i}`" v-model="field.label" class="input" />
      </div>
      <div class="sm:col-span-3">
        <label class="label" :for="`ft${i}`">Kiểu</label>
        <select :id="`ft${i}`" v-model="field.type" class="input">
          <option v-for="(label, type) in TYPE_LABEL" :key="type" :value="type">{{ label }}</option>
        </select>
      </div>
      <div class="sm:col-span-3">
        <template v-if="field.type === 'select'">
          <label class="label" :for="`fo${i}`">Lựa chọn (cách nhau bằng dấu phẩy)</label>
          <input :id="`fo${i}`" v-model="field.optionsText" class="input" />
        </template>
      </div>
      <label class="flex items-center gap-2 pb-2 text-sm sm:col-span-1"><input v-model="field.required" type="checkbox" /> Bắt buộc</label>
      <button class="btn-ghost sm:col-span-1" :aria-label="`Xóa ô ${field.label}`" @click="app.spec.fields.splice(i, 1)">✕</button>
    </div>
    <button class="btn-ghost mt-3" @click="addField">+ Thêm ô thông tin</button>

    <h2 class="mt-6 font-semibold">Các bước xử lý (theo thứ tự)</h2>
    <div v-for="(step, i) in app.spec.steps" :key="i" class="mt-3 rounded-lg bg-slate-50 p-3">
      <div class="grid items-end gap-2 sm:grid-cols-12">
        <div class="sm:col-span-4">
          <label class="label" :for="`sn${i}`">Tên bước</label>
          <input :id="`sn${i}`" v-model="step.name" class="input" />
        </div>
        <div class="sm:col-span-3">
          <label class="label" :for="`sr${i}`">Ai xử lý</label>
          <select :id="`sr${i}`" v-model="step.role" class="input">
            <option v-for="(label, role) in ROLE_LABEL" :key="role" :value="role">{{ label }}</option>
          </select>
        </div>
        <div class="sm:col-span-2">
          <label class="label" :for="`st${i}`">Loại</label>
          <select :id="`st${i}`" v-model="step.type" class="input">
            <option value="approve">Duyệt / từ chối</option>
            <option value="task">Thực hiện việc</option>
          </select>
        </div>
        <div class="flex gap-1 sm:col-span-3">
          <button class="btn-ghost px-3" :disabled="i === 0" aria-label="Chuyển bước lên" @click="move(app.spec.steps, i, -1)">↑</button>
          <button class="btn-ghost px-3" :disabled="i === app.spec.steps.length - 1" aria-label="Chuyển bước xuống" @click="move(app.spec.steps, i, 1)">↓</button>
          <button class="btn-ghost px-3" :aria-label="`Xóa bước ${step.name}`" @click="app.spec.steps.splice(i, 1)">✕</button>
        </div>
      </div>
      <label class="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" :checked="!!step.when" @change="toggleCondition(step)" /> Chỉ thực hiện bước này khi…
      </label>
      <div v-if="step.when" class="mt-2 grid gap-2 sm:grid-cols-3">
        <select v-model="step.when.field" class="input" aria-label="Ô thông tin dùng làm điều kiện">
          <option v-for="f in app.spec.fields.filter((x) => x.required)" :key="f.key || f.label" :value="f.key || slug(f.label)">{{ f.label }}</option>
        </select>
        <select v-model="step.when.op" class="input" aria-label="Phép so sánh">
          <option v-for="(label, op) in OPS" :key="op" :value="op">{{ label }}</option>
        </select>
        <input v-model="step.when.value" class="input" :type="fieldType(step.when.field) === 'number' ? 'number' : 'text'" aria-label="Giá trị so sánh" />
      </div>
    </div>
    <button class="btn-ghost mt-3" @click="addStep">+ Thêm bước</button>

    <template v-if="app.spec.steps.length">
      <h2 class="mt-6 font-semibold">Xem trước quy trình</h2>
      <div class="mt-3"><FlowDiagram :spec="toSpec()" /></div>
    </template>

    <div class="mt-6 border-t border-slate-200 pt-4">
      <button class="btn-primary" :disabled="publishing || !app.name.trim() || !app.spec.fields.length || !app.spec.steps.length" @click="publish">
        {{ publishing ? 'Đang xuất bản…' : 'Xuất bản ứng dụng' }}
      </button>
    </div>
  </section>

  <section v-if="existing.length" class="mt-8">
    <h2 class="font-semibold">Ứng dụng đã tạo</h2>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <button v-for="a in existing" :key="a.key" class="card text-left transition hover:border-indigo-400" @click="edit(a)">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium">{{ a.name }}</span>
          <span class="chip" :class="a.status === 'published' ? 'bg-emerald-100 text-emerald-700' : a.status === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'">
            {{ a.status === 'published' ? 'Đang chạy' : a.status === 'error' ? 'Lỗi' : 'Đang xuất bản' }}
          </span>
        </div>
        <div class="mt-1 text-xs text-slate-500">Bấm để sửa · {{ a.spec.steps.length }} bước</div>
      </button>
    </div>
  </section>
</template>
