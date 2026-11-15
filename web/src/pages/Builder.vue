<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Soạn quy trình theo 3 bước: bắt đầu (kho mẫu / mô tả bằng lời / từ đầu) -> soạn -> xuất bản.
AI chỉ điền sẵn vào bước 2; không có gì được xuất bản nếu người dùng chưa bấm nút ở bước 3.
Sửa quy trình đang chạy không xuất bản thẳng mà mở một đề xuất thay đổi để người khác duyệt.
-->
<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, Download } from 'lucide-vue-next'
import { gql, slug, toast, ROLE_LABEL, CATEGORIES } from '../lib.js'
import SignatureRow from '../components/SignatureRow.vue'
import CategoryIcon from '../components/CategoryIcon.vue'

const router = useRouter()
const TYPE_LABEL = { text: 'Chữ ngắn', longtext: 'Chữ dài', number: 'Số', date: 'Ngày', select: 'Chọn một mục' }
const OPS = { '>': 'lớn hơn', '>=': 'từ … trở lên', '<': 'nhỏ hơn', '<=': 'không quá', '==': 'bằng', '!=': 'khác' }
const STAGES = ['Bắt đầu', 'Soạn quy trình', 'Xuất bản']

const stage = ref(0)
const description = ref('')
const drafting = ref(false)
const questions = ref([])
const aiError = ref('')
const app = reactive({ key: '', name: '', description: '', category: 'Khác', spec: { fields: [], steps: [] } })
const existing = ref([])
const library = ref([])
const note = ref('')
const busy = ref(false)
let timer

const editing = computed(() => existing.value.some((a) => a.key === app.key))
const problems = computed(() => {
  const list = []
  if (!app.name.trim()) list.push('Đặt tên cho quy trình')
  if (!app.spec.fields.length) list.push('Thêm ít nhất một ô thông tin')
  if (app.spec.fields.some((f) => !f.label.trim())) list.push('Mỗi ô thông tin cần có nhãn')
  if (!app.spec.steps.length) list.push('Thêm ít nhất một bước xử lý')
  if (app.spec.steps.some((s) => !s.name.trim())) list.push('Mỗi bước cần có tên')
  return list
})

async function loadExisting() {
  existing.value = (await gql('{ app(order_by: {created_at: desc}) { key name description category spec status error } }')).app
}
onMounted(async () => {
  await loadExisting()
  library.value = (await gql('{ library { key name category description spec } }')).library
})
onUnmounted(() => clearInterval(timer))

function load(source) {
  app.key = source.key ?? ''
  app.name = source.name ?? ''
  app.description = source.description ?? ''
  app.category = source.category || 'Khác'
  app.spec = JSON.parse(JSON.stringify(source.spec))
  // Ô lựa chọn sửa dưới dạng một dòng chữ, cách nhau bằng dấu phẩy.
  for (const field of app.spec.fields) field.optionsText = (field.options ?? []).join(', ')
  stage.value = 1
}

function fromScratch() {
  load({ spec: { fields: [{ key: '', label: '', type: 'text', required: true, optionsText: '' }], steps: [{ key: '', name: '', role: 'manager', type: 'approve' }] } })
}

/** Lấy một quy trình trong kho mẫu làm điểm xuất phát. Trùng mã thì thành bản sao mới. */
function fork(item) {
  const taken = existing.value.some((a) => a.key === item.key)
  load({ ...item, key: taken ? '' : item.key, name: taken ? `${item.name} (bản sao)` : item.name })
}

async function draft() {
  drafting.value = true
  aiError.value = ''
  questions.value = []
  try {
    const { generateApp: result } = await gql(
      'mutation($d: String!) { generateApp(description: $d) { key name spec questions errors } }', { d: description.value })
    load({ ...result, description: description.value.trim().slice(0, 300) })
    questions.value = result.questions
    toast(result.errors.length ? 'Trợ lý đã phác thảo, nhưng còn vài chỗ cần bạn sửa' : 'Trợ lý đã phác thảo xong. Hãy xem lại trước khi xuất bản')
  } catch (err) {
    aiError.value = `Trợ lý chưa trả lời được (${err.message}). Bạn vẫn có thể chọn một mẫu hoặc tự soạn.`
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
  else step.when = { field: app.spec.fields.find((f) => f.required)?.key || slug(app.spec.fields.find((f) => f.required)?.label ?? ''), op: '>', value: 0 }
}
const fieldType = (key) => app.spec.fields.find((f) => (f.key || slug(f.label)) === key)?.type

/** Chuẩn hóa form thành spec gửi lên máy chủ (mã tự sinh từ nhãn). */
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
const preview = computed(() => toSpec())

function exportJson() {
  const key = app.key || slug(app.name)
  const content = JSON.stringify({ key, name: app.name.trim(), category: app.category, description: app.description.trim() || app.name.trim(), spec: toSpec() }, null, 2)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content + '\n'], { type: 'application/json' }))
  link.download = `${key}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

async function propose() {
  busy.value = true
  try {
    const { insert_app_change_one: change } = await gql(
      'mutation($o: app_change_insert_input!) { insert_app_change_one(object: $o) { id } }',
      { o: { app_key: app.key, name: app.name.trim(), spec: toSpec(), note: note.value.trim() } })
    toast(`Đã gửi đề xuất thay đổi số ${change.id}. Giám đốc sẽ xem xét ở mục Quy trình`)
    router.push('/quy-trinh')
  } catch (err) {
    toast(`Chưa gửi được đề xuất: ${err.message}`, false)
  } finally {
    busy.value = false
  }
}

async function publish() {
  busy.value = true
  const key = app.key || slug(app.name)
  try {
    await gql('mutation($o: app_insert_input!) { insert_app_one(object: $o) { key } }',
      { o: { key, name: app.name.trim(), description: app.description.trim() || null, category: app.category, spec: toSpec() } })
    // Máy chủ biên dịch bất đồng bộ; chờ kết quả published / error.
    timer = setInterval(async () => {
      await loadExisting()
      const current = existing.value.find((a) => a.key === key)
      if (!current || current.status === 'pending') return
      clearInterval(timer)
      busy.value = false
      if (current.status === 'published') {
        toast(`Đã xuất bản “${current.name}”. Mọi người gửi hồ sơ được ngay`)
        router.push('/gui')
      } else {
        toast(`Chưa xuất bản được: ${current.error}`, false)
      }
    }, 1500)
  } catch (err) {
    busy.value = false
    toast(err.message.includes('duplicate') || err.message.includes('Uniqueness')
      ? `Đã có quy trình mã “${key}”. Hãy đổi tên quy trình rồi thử lại`
      : `Chưa lưu được: ${err.message}`, false)
  }
}
</script>

<template>
  <h1 class="page-title">Soạn quy trình</h1>
  <p class="page-lead">Mô tả cách công việc đang diễn ra; hệ thống dựng form, luồng ký duyệt và phân quyền cho bạn.</p>

  <ol class="mt-6 flex gap-2 text-sm" aria-label="Các bước">
    <li v-for="(label, i) in STAGES" :key="label" class="flex flex-1 items-center gap-2 border-b-2 pb-2" :class="i <= stage ? 'border-pen font-medium' : 'border-line text-pencil'" :aria-current="i === stage ? 'step' : undefined">
      <span class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold" :class="i <= stage ? 'bg-pen text-white' : 'bg-ground'">{{ i + 1 }}</span>
      <span class="hidden sm:inline">{{ label }}</span>
    </li>
  </ol>

  <!-- Bước 1 -->
  <div v-if="stage === 0" class="mt-8 space-y-8">
    <section aria-labelledby="ai-title">
      <h2 id="ai-title" class="section-title">Mô tả bằng lời, để trợ lý phác thảo</h2>
      <div class="panel mt-3 p-4">
        <label class="sr-only" for="description">Mô tả quy trình</label>
        <textarea
id="description" v-model="description" class="input" rows="3"
          placeholder="Ví dụ: Nhân viên xin tạm ứng, dưới 5 triệu thì trưởng phòng duyệt, trên 5 triệu phải thêm giám đốc, kế toán chi tiền." />
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <button class="btn-primary" :disabled="drafting || description.trim().length < 10" @click="draft">
            <Sparkles :size="16" aria-hidden="true" /> {{ drafting ? 'Trợ lý đang phác thảo…' : 'Nhờ trợ lý phác thảo' }}
          </button>
          <span class="text-sm text-pencil">Trợ lý chỉ gợi ý. Bạn xem lại và quyết định ở bước sau.</span>
        </div>
        <p v-if="aiError" class="mt-3 text-sm text-seal" role="alert">{{ aiError }}</p>
      </div>
    </section>

    <section v-if="library.length" aria-labelledby="lib-title">
      <h2 id="lib-title" class="section-title">Hoặc bắt đầu từ một quy trình mẫu</h2>
      <div class="panel mt-3">
        <button v-for="item in library" :key="item.key" class="panel-row" @click="fork(item)">
          <CategoryIcon :category="item.category" />
          <div class="min-w-[min(100%,12rem)] flex-1"><div class="font-medium">{{ item.name }}</div><div class="text-sm text-pencil">{{ item.description }}</div></div>
          <span class="pill pill-plain">{{ item.category }}</span>
        </button>
      </div>
    </section>

    <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
      <button class="btn-quiet" @click="fromScratch"><Plus :size="16" aria-hidden="true" /> Tự soạn từ đầu</button>
    </div>

    <section v-if="existing.length" aria-labelledby="mine-title">
      <h2 id="mine-title" class="section-title">Quy trình đã có</h2>
      <p class="hint">Chọn một quy trình để sửa. Thay đổi trên quy trình đang chạy được gửi thành đề xuất để giám đốc duyệt.</p>
      <div class="panel mt-3">
        <button v-for="a in existing" :key="a.key" class="panel-row" @click="load(a)">
          <CategoryIcon :category="a.category" />
          <span class="min-w-[min(100%,10rem)] flex-1 font-medium">{{ a.name }}</span>
          <span class="pill" :class="a.status === 'published' ? 'pill-done' : a.status === 'error' ? 'pill-stop' : 'pill-wait'">
            {{ a.status === 'published' ? 'Đang chạy' : a.status === 'error' ? 'Lỗi' : 'Đang xuất bản' }}
          </span>
        </button>
      </div>
    </section>
  </div>

  <!-- Bước 2 -->
  <div v-else-if="stage === 1" class="mt-8 space-y-8">
    <div v-if="questions.length" class="sticky-note max-w-2xl">
      <div class="font-medium">Trợ lý thấy mô tả chưa nói rõ:</div>
      <ul class="mt-1 list-disc pl-5"><li v-for="q in questions" :key="q">{{ q }}</li></ul>
      <p class="mt-1 text-xs">Hãy thêm hoặc sửa bước cho phù hợp với thực tế của bạn.</p>
    </div>

    <section class="panel grid gap-4 p-5 sm:grid-cols-2" aria-label="Thông tin chung">
      <div>
        <label class="label" for="app-name">Tên quy trình</label>
        <input id="app-name" v-model="app.name" class="input" placeholder="Xin tạm ứng" />
      </div>
      <div>
        <label class="label" for="app-cat">Nhóm</label>
        <select id="app-cat" v-model="app.category" class="input"><option v-for="c in CATEGORIES" :key="c">{{ c }}</option></select>
      </div>
      <div class="sm:col-span-2">
        <label class="label" for="app-desc">Mô tả ngắn <span class="font-normal text-pencil">(người gửi hồ sơ sẽ đọc dòng này)</span></label>
        <input id="app-desc" v-model="app.description" class="input" maxlength="300" placeholder="Nhân viên xin tạm ứng tiền; trên 5 triệu cần giám đốc duyệt." />
      </div>
    </section>

    <section aria-labelledby="fields-title">
      <h2 id="fields-title" class="section-title">Người gửi cần điền những gì?</h2>
      <div class="panel mt-3">
        <div v-for="(field, i) in app.spec.fields" :key="i" class="panel-row items-end">
          <div class="min-w-40 flex-[2]"><label class="label" :for="`fl${i}`">Nhãn</label><input :id="`fl${i}`" v-model="field.label" class="input" placeholder="Số tiền (đồng)" /></div>
          <div class="min-w-36 flex-1">
<label class="label" :for="`ft${i}`">Kiểu</label>
            <select :id="`ft${i}`" v-model="field.type" class="input"><option v-for="(label, type) in TYPE_LABEL" :key="type" :value="type">{{ label }}</option></select>
</div>
          <div v-if="field.type === 'select'" class="min-w-40 flex-[2]"><label class="label" :for="`fo${i}`">Các lựa chọn, cách nhau bằng dấu phẩy</label><input :id="`fo${i}`" v-model="field.optionsText" class="input" /></div>
          <label class="flex min-h-10 items-center gap-2 text-sm"><input v-model="field.required" type="checkbox" class="h-4 w-4 accent-pen" /> Bắt buộc</label>
          <button class="btn-icon" :aria-label="`Xóa ô ${field.label || i + 1}`" @click="app.spec.fields.splice(i, 1)"><Trash2 :size="18" aria-hidden="true" /></button>
        </div>
      </div>
      <button class="btn-quiet mt-3" @click="addField"><Plus :size="16" aria-hidden="true" /> Thêm ô thông tin</button>
    </section>

    <section aria-labelledby="steps-title">
      <h2 id="steps-title" class="section-title">Hồ sơ đi qua những ai, theo thứ tự nào?</h2>
      <div class="panel mt-3">
        <div v-for="(step, i) in app.spec.steps" :key="i" class="panel-row items-start">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pen-wash text-sm font-semibold text-pen">{{ i + 1 }}</span>
          <div class="min-w-0 flex-1 space-y-3">
            <div class="flex flex-wrap items-end gap-3">
              <div class="min-w-44 flex-[2]"><label class="label" :for="`sn${i}`">Tên bước</label><input :id="`sn${i}`" v-model="step.name" class="input" placeholder="Trưởng phòng duyệt" /></div>
              <div class="min-w-36 flex-1">
<label class="label" :for="`sr${i}`">Ai xử lý</label>
                <select :id="`sr${i}`" v-model="step.role" class="input"><option v-for="(label, role) in ROLE_LABEL" :key="role" :value="role">{{ label }}</option></select>
</div>
              <div class="min-w-36 flex-1">
<label class="label" :for="`st${i}`">Họ làm gì</label>
                <select :id="`st${i}`" v-model="step.type" class="input"><option value="approve">Duyệt hoặc từ chối</option><option value="task">Thực hiện rồi xác nhận</option></select>
</div>
            </div>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="h-4 w-4 accent-pen" :checked="!!step.when" @change="toggleCondition(step)" /> Chỉ cần bước này trong một số trường hợp</label>
            <div v-if="step.when" class="flex flex-wrap items-center gap-2 text-sm">
              <span>Khi</span>
              <select v-model="step.when.field" class="input !w-auto" aria-label="Ô thông tin dùng làm điều kiện">
                <option v-for="f in app.spec.fields.filter((x) => x.required)" :key="f.key || f.label" :value="f.key || slug(f.label)">{{ f.label || 'Ô chưa có nhãn' }}</option>
              </select>
              <select v-model="step.when.op" class="input !w-auto" aria-label="Phép so sánh"><option v-for="(label, op) in OPS" :key="op" :value="op">{{ label }}</option></select>
              <input v-model="step.when.value" class="input num !w-40" :type="fieldType(step.when.field) === 'number' ? 'number' : 'text'" aria-label="Giá trị so sánh" />
            </div>
          </div>
          <div class="flex">
            <button class="btn-icon" :disabled="i === 0" aria-label="Chuyển bước lên" @click="move(app.spec.steps, i, -1)"><ArrowUp :size="18" aria-hidden="true" /></button>
            <button class="btn-icon" :disabled="i === app.spec.steps.length - 1" aria-label="Chuyển bước xuống" @click="move(app.spec.steps, i, 1)"><ArrowDown :size="18" aria-hidden="true" /></button>
            <button class="btn-icon" :aria-label="`Xóa bước ${step.name || i + 1}`" @click="app.spec.steps.splice(i, 1)"><Trash2 :size="18" aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      <button class="btn-quiet mt-3" @click="addStep"><Plus :size="16" aria-hidden="true" /> Thêm bước</button>
    </section>

    <section v-if="app.spec.steps.length" aria-labelledby="prev-title">
      <h2 id="prev-title" class="section-title">Hồ sơ sẽ trông thế này</h2>
      <div class="mt-3"><SignatureRow :spec="preview" /></div>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
      <button class="btn-quiet" @click="stage = 0">Quay lại</button>
      <button class="btn-primary" :disabled="problems.length > 0" @click="stage = 2">Tiếp tục</button>
    </div>
    <ul v-if="problems.length" class="-mt-4 text-sm text-pencil" aria-label="Cần hoàn thành"><li v-for="p in problems" :key="p">{{ p }}</li></ul>
  </div>

  <!-- Bước 3 -->
  <div v-else class="mt-8 max-w-2xl space-y-6">
    <section class="panel p-5">
      <h2 class="font-serif text-xl font-bold">{{ app.name }}</h2>
      <p v-if="app.description" class="mt-1 text-pencil">{{ app.description }}</p>
      <div class="mt-4"><SignatureRow :spec="preview" /></div>
    </section>

    <template v-if="editing">
      <section class="panel p-5">
        <p>“{{ app.name }}” đang chạy, nên thay đổi sẽ được gửi thành một <strong>đề xuất</strong>. Hệ thống tự kiểm tra và chạy thử trên các hồ sơ đã có; giám đốc xem rồi mới phát hành.</p>
        <label class="label mt-4" for="change-note">Vì sao cần thay đổi?</label>
        <input id="change-note" v-model="note" class="input" placeholder="Ví dụ: Nâng ngưỡng cần giám đốc duyệt lên 10 triệu để giảm thời gian chờ" />
      </section>
      <div class="flex flex-wrap gap-3">
        <button class="btn-quiet" @click="stage = 1">Quay lại sửa</button>
        <button class="btn-primary" :disabled="busy || note.trim().length < 5" @click="propose">{{ busy ? 'Đang gửi…' : 'Gửi đề xuất thay đổi' }}</button>
      </div>
    </template>
    <template v-else>
      <p class="text-pencil">Khi xuất bản, mọi người gửi được hồ sơ theo quy trình này ngay lập tức.</p>
      <div class="flex flex-wrap gap-3">
        <button class="btn-quiet" @click="stage = 1">Quay lại sửa</button>
        <button class="btn-primary" :disabled="busy" @click="publish">{{ busy ? 'Đang xuất bản…' : 'Xuất bản quy trình' }}</button>
      </div>
    </template>
    <button class="inline-flex items-center gap-1.5 text-sm text-pen hover:underline" @click="exportJson"><Download :size="16" aria-hidden="true" /> Tải tệp JSON để chia sẻ với cộng đồng</button>
  </div>
</template>
