<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Soạn quy trình theo 3 bước: bắt đầu (kho mẫu / mô tả bằng lời / từ đầu) -> soạn -> xuất bản.
AI chỉ điền sẵn vào bước 2; không có gì được xuất bản nếu người dùng chưa bấm nút ở bước 3.
Sửa quy trình đang chạy không xuất bản thẳng mà mở một đề xuất thay đổi để người khác duyệt.
-->
<script setup>
import { t } from '../i18n.js'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, Download } from 'lucide-vue-next'
import { gql, slug, toast, ROLE_LABEL, CATEGORIES } from '../lib.js'
import SignatureRow from '../components/SignatureRow.vue'
import CategoryIcon from '../components/CategoryIcon.vue'

const router = useRouter()
const FIELD_TYPES = ['text', 'longtext', 'number', 'date', 'select']
const OPS = ['>', '>=', '<', '<=', '==', '!=']
const STAGES = ['bld.stage.1', 'bld.stage.2', 'bld.stage.3']
/** Tên nhóm theo ngôn ngữ; nhóm lạ (do người dùng tự đặt) giữ nguyên. */
const catName = (c) => { const k = `cat.${c}`; const v = t(k); return v === k ? c : v }

const stage = ref(0)
const description = ref('')
const drafting = ref(false)
const questions = ref([])
const aiError = ref('')
const app = reactive({ key: '', name: '', description: '', category: 'Khác', spec: { fields: [], steps: [] } }) // i18n-ok: giá trị nhóm trong cơ sở dữ liệu
const existing = ref([])
const library = ref([])
const note = ref('')
const busy = ref(false)
let timer

const editing = computed(() => existing.value.some((a) => a.key === app.key))
const problems = computed(() => {
  const list = []
  if (!app.name.trim()) list.push(t('bld.p.name'))
  if (!app.spec.fields.length) list.push(t('bld.p.fields'))
  if (app.spec.fields.some((f) => !f.label.trim())) list.push(t('bld.p.label'))
  if (!app.spec.steps.length) list.push(t('bld.p.steps'))
  if (app.spec.steps.some((s) => !s.name.trim())) list.push(t('bld.p.stepName'))
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
  app.category = source.category || 'Khác' // i18n-ok: giá trị nhóm trong cơ sở dữ liệu
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
  load({ ...item, key: taken ? '' : item.key, name: taken ? t('bld.copy', { name: item.name }) : item.name })
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
    toast(t(result.errors.length ? 'bld.draftedWithGaps' : 'bld.drafted'))
  } catch (err) {
    aiError.value = t('bld.aiError', { err: err.message })
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
    toast(t('bld.proposed', { id: change.id }))
    router.push('/quy-trinh')
  } catch (err) {
    toast(t('bld.proposeFail', { err: err.message }), false)
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
        toast(t('bld.published', { name: current.name }))
        router.push('/gui')
      } else {
        toast(t('bld.publishFail', { err: current.error }), false)
      }
    }, 1500)
  } catch (err) {
    busy.value = false
    toast(err.message.includes('duplicate') || err.message.includes('Uniqueness')
      ? t('bld.duplicate', { key })
      : t('bld.saveFail', { err: err.message }), false)
  }
}
</script>

<template>
  <h1 class="page-title">{{ t('bld.title') }}</h1>
  <p class="page-lead">{{ t('bld.lead') }}</p>

  <ol class="mt-6 flex gap-2 text-sm" :aria-label="t('bld.stagesAria')">
    <li v-for="(label, i) in STAGES" :key="label" class="flex flex-1 items-center gap-2 border-b-2 pb-2" :class="i <= stage ? 'border-pen font-medium' : 'border-line text-pencil'" :aria-current="i === stage ? 'step' : undefined">
      <span class="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold" :class="i <= stage ? 'bg-pen text-white' : 'bg-ground'">{{ i + 1 }}</span>
      <span class="hidden sm:inline">{{ t(label) }}</span>
    </li>
  </ol>

  <!-- Bước 1 -->
  <div v-if="stage === 0" class="mt-8 space-y-8">
    <section aria-labelledby="ai-title">
      <h2 id="ai-title" class="section-title">{{ t('bld.aiTitle') }}</h2>
      <div class="panel mt-3 p-4">
        <label class="sr-only" for="description">{{ t('bld.descLabel') }}</label>
        <textarea
id="description" v-model="description" class="input" rows="3"
          :placeholder="t('bld.descPh')" />
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <button class="btn-primary" :disabled="drafting || description.trim().length < 10" @click="draft">
            <Sparkles :size="16" aria-hidden="true" /> {{ drafting ? t('bld.drafting') : t('bld.draft') }}
          </button>
          <span class="text-sm text-pencil">{{ t('bld.aiOnlySuggests') }}</span>
        </div>
        <p v-if="aiError" class="mt-3 text-sm text-seal" role="alert">{{ aiError }}</p>
      </div>
    </section>

    <section v-if="library.length" aria-labelledby="lib-title">
      <h2 id="lib-title" class="section-title">{{ t('bld.libTitle') }}</h2>
      <div class="panel mt-3">
        <button v-for="item in library" :key="item.key" class="panel-row" @click="fork(item)">
          <CategoryIcon :category="item.category" />
          <div class="min-w-[min(100%,12rem)] flex-1"><div class="font-medium">{{ item.name }}</div><div class="text-sm text-pencil">{{ item.description }}</div></div>
          <span class="pill pill-plain">{{ catName(item.category) }}</span>
        </button>
      </div>
    </section>

    <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
      <button class="btn-quiet" @click="fromScratch"><Plus :size="16" aria-hidden="true" /> {{ t('bld.scratch') }}</button>
    </div>

    <section v-if="existing.length" aria-labelledby="mine-title">
      <h2 id="mine-title" class="section-title">{{ t('bld.mineTitle') }}</h2>
      <p class="hint">{{ t('bld.mineHint') }}</p>
      <div class="panel mt-3">
        <button v-for="a in existing" :key="a.key" class="panel-row" @click="load(a)">
          <CategoryIcon :category="a.category" />
          <span class="min-w-[min(100%,10rem)] flex-1 font-medium">{{ a.name }}</span>
          <span class="pill" :class="a.status === 'published' ? 'pill-done' : a.status === 'error' ? 'pill-stop' : 'pill-wait'">
            {{ t('bld.state.' + (a.status === 'published' || a.status === 'error' ? a.status : 'pending')) }}
          </span>
        </button>
      </div>
    </section>
  </div>

  <!-- Bước 2 -->
  <div v-else-if="stage === 1" class="mt-8 space-y-8">
    <div v-if="questions.length" class="sticky-note max-w-2xl">
      <div class="font-medium">{{ t('bld.unclear') }}</div>
      <ul class="mt-1 list-disc pl-5"><li v-for="q in questions" :key="q">{{ q }}</li></ul>
      <p class="mt-1 text-xs">{{ t('bld.unclearHint') }}</p>
    </div>

    <section class="panel grid gap-4 p-5 sm:grid-cols-2" :aria-label="t('bld.general')">
      <div>
        <label class="label" for="app-name">{{ t('bld.nameLabel') }}</label>
        <input id="app-name" v-model="app.name" class="input" :placeholder="t('bld.namePh')" />
      </div>
      <div>
        <label class="label" for="app-cat">{{ t('bld.group') }}</label>
        <select id="app-cat" v-model="app.category" class="input"><option v-for="c in CATEGORIES" :key="c" :value="c">{{ catName(c) }}</option></select>
      </div>
      <div class="sm:col-span-2">
        <label class="label" for="app-desc">{{ t('bld.shortDesc') }} <span class="font-normal text-pencil">{{ t('bld.shortDescHint') }}</span></label>
        <input id="app-desc" v-model="app.description" class="input" maxlength="300" :placeholder="t('bld.shortDescPh')" />
      </div>
    </section>

    <section aria-labelledby="fields-title">
      <h2 id="fields-title" class="section-title">{{ t('bld.fieldsTitle') }}</h2>
      <div class="panel mt-3">
        <div v-for="(field, i) in app.spec.fields" :key="i" class="panel-row items-end">
          <div class="min-w-40 flex-[2]"><label class="label" :for="`fl${i}`">{{ t('bld.fieldLabel') }}</label><input :id="`fl${i}`" v-model="field.label" class="input" :placeholder="t('bld.fieldLabelPh')" /></div>
          <div class="min-w-36 flex-1">
<label class="label" :for="`ft${i}`">{{ t('bld.fieldType') }}</label>
            <select :id="`ft${i}`" v-model="field.type" class="input"><option v-for="type in FIELD_TYPES" :key="type" :value="type">{{ t('bld.type.' + type) }}</option></select>
</div>
          <div v-if="field.type === 'select'" class="min-w-40 flex-[2]"><label class="label" :for="`fo${i}`">{{ t('bld.fieldOptions') }}</label><input :id="`fo${i}`" v-model="field.optionsText" class="input" /></div>
          <label class="flex min-h-10 items-center gap-2 text-sm"><input v-model="field.required" type="checkbox" class="h-4 w-4 accent-pen" /> {{ t('bld.required') }}</label>
          <button class="btn-icon" :aria-label="t('bld.removeField', { name: field.label || i + 1 })" @click="app.spec.fields.splice(i, 1)"><Trash2 :size="18" aria-hidden="true" /></button>
        </div>
      </div>
      <button class="btn-quiet mt-3" @click="addField"><Plus :size="16" aria-hidden="true" /> {{ t('bld.addField') }}</button>
    </section>

    <section aria-labelledby="steps-title">
      <h2 id="steps-title" class="section-title">{{ t('bld.stepsTitle') }}</h2>
      <div class="panel mt-3">
        <div v-for="(step, i) in app.spec.steps" :key="i" class="panel-row items-start">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pen-wash text-sm font-semibold text-pen">{{ i + 1 }}</span>
          <div class="min-w-0 flex-1 space-y-3">
            <div class="flex flex-wrap items-end gap-3">
              <div class="min-w-44 flex-[2]"><label class="label" :for="`sn${i}`">{{ t('bld.stepName') }}</label><input :id="`sn${i}`" v-model="step.name" class="input" :placeholder="t('bld.stepNamePh')" /></div>
              <div class="min-w-36 flex-1">
<label class="label" :for="`sr${i}`">{{ t('bld.who') }}</label>
                <select :id="`sr${i}`" v-model="step.role" class="input"><option v-for="(label, role) in ROLE_LABEL" :key="role" :value="role">{{ label }}</option></select>
</div>
              <div class="min-w-36 flex-1">
<label class="label" :for="`st${i}`">{{ t('bld.does') }}</label>
                <select :id="`st${i}`" v-model="step.type" class="input"><option value="approve">{{ t('bld.doApprove') }}</option><option value="task">{{ t('bld.doTask') }}</option></select>
</div>
            </div>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="h-4 w-4 accent-pen" :checked="!!step.when" @change="toggleCondition(step)" /> {{ t('bld.onlySome') }}</label>
            <div v-if="step.when" class="flex flex-wrap items-center gap-2 text-sm">
              <span>Khi</span>
              <select v-model="step.when.field" class="input !w-auto" :aria-label="t('bld.condField')">
                <option v-for="f in app.spec.fields.filter((x) => x.required)" :key="f.key || f.label" :value="f.key || slug(f.label)">{{ f.label || t('bld.noLabel') }}</option>
              </select>
              <select v-model="step.when.op" class="input !w-auto" :aria-label="t('bld.condOp')"><option v-for="op in OPS" :key="op" :value="op">{{ t('bld.op.' + op) }}</option></select>
              <input v-model="step.when.value" class="input num !w-40" :type="fieldType(step.when.field) === 'number' ? 'number' : 'text'" :aria-label="t('bld.condValue')" />
            </div>
          </div>
          <div class="flex">
            <button class="btn-icon" :disabled="i === 0" :aria-label="t('bld.up')" @click="move(app.spec.steps, i, -1)"><ArrowUp :size="18" aria-hidden="true" /></button>
            <button class="btn-icon" :disabled="i === app.spec.steps.length - 1" :aria-label="t('bld.down')" @click="move(app.spec.steps, i, 1)"><ArrowDown :size="18" aria-hidden="true" /></button>
            <button class="btn-icon" :aria-label="t('bld.removeStep', { name: step.name || i + 1 })" @click="app.spec.steps.splice(i, 1)"><Trash2 :size="18" aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      <button class="btn-quiet mt-3" @click="addStep"><Plus :size="16" aria-hidden="true" /> {{ t('bld.addStep') }}</button>
    </section>

    <section v-if="app.spec.steps.length" aria-labelledby="prev-title">
      <h2 id="prev-title" class="section-title">{{ t('bld.previewTitle') }}</h2>
      <div class="mt-3"><SignatureRow :spec="preview" /></div>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
      <button class="btn-quiet" @click="stage = 0">{{ t('bld.back') }}</button>
      <button class="btn-primary" :disabled="problems.length > 0" @click="stage = 2">{{ t('bld.next') }}</button>
    </div>
    <ul v-if="problems.length" class="-mt-4 text-sm text-pencil" :aria-label="t('bld.todo')"><li v-for="p in problems" :key="p">{{ p }}</li></ul>
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
        <p>{{ t('bld.proposeIntro', { name: app.name }) }}</p>
        <label class="label mt-4" for="change-note">{{ t('bld.why') }}</label>
        <input id="change-note" v-model="note" class="input" :placeholder="t('bld.whyPh')" />
      </section>
      <div class="flex flex-wrap gap-3">
        <button class="btn-quiet" @click="stage = 1">{{ t('bld.backEdit') }}</button>
        <button class="btn-primary" :disabled="busy || note.trim().length < 5" @click="propose">{{ busy ? t('bld.sending') : t('bld.sendProposal') }}</button>
      </div>
    </template>
    <template v-else>
      <p class="text-pencil">{{ t('bld.publishNote') }}</p>
      <div class="flex flex-wrap gap-3">
        <button class="btn-quiet" @click="stage = 1">{{ t('bld.backEdit') }}</button>
        <button class="btn-primary" :disabled="busy" @click="publish">{{ busy ? t('bld.publishing') : t('bld.publish') }}</button>
      </div>
    </template>
    <button class="inline-flex items-center gap-1.5 text-sm text-pen hover:underline" @click="exportJson"><Download :size="16" aria-hidden="true" /> {{ t('bld.exportJson') }}</button>
  </div>
</template>
