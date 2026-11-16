<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Gửi hồ sơ: chọn loại hồ sơ, điền form (dựng hoàn toàn từ quy trình), thấy trước ai sẽ ký.
-->
<script setup>
import { t } from '../i18n.js'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight, Paperclip, Send, Sparkles, X } from 'lucide-vue-next'
import { auth, gql, routeText, toast, uploadFile, formatSize, fillFromFile } from '../lib.js'
import SignatureRow from '../components/SignatureRow.vue'
import CategoryIcon from '../components/CategoryIcon.vue'

const route = useRoute()
const router = useRouter()
const apps = ref(null)
const form = reactive({})
const errors = reactive({})
const sending = ref(false)
const files = ref([])
const reading = ref(false)
const aiFilled = reactive({})
const readable = (file) => /^(application\/pdf|image\/(png|jpeg|tiff|bmp|gif))$/.test(file.type)
async function readWithAi(file) {
  reading.value = true
  try {
    const values = await fillFromFile(selected.value.key, file)
    const keys = Object.keys(values)
    for (const k of keys) { form[k] = values[k]; aiFilled[k] = true; delete errors[k] }
    toast(keys.length ? t('apps.aiFilled', { n: keys.length }) : t('apps.aiNone'), keys.length > 0)
  } catch (err) {
    toast(t('apps.aiFail', { err: err.message }), false)
  } finally {
    reading.value = false
  }
}
const pick = (event) => { files.value.push(...event.target.files); event.target.value = '' }

onMounted(async () => {
  apps.value = (await gql('{ app(where: {status: {_eq: "published"}}, order_by: {name: asc}) { key name description category spec } }')).app
})

const selected = computed(() => apps.value?.find((a) => a.key === route.params.key))
watch(selected, () => {
  for (const key of Object.keys(form)) delete form[key]
  for (const key of Object.keys(errors)) delete errors[key]
  files.value = []
  for (const key of Object.keys(aiFilled)) delete aiFilled[key]
})

async function submit() {
  // Kiểm tra sớm, báo lỗi ngay tại ô sai; cơ sở dữ liệu vẫn kiểm lại theo đúng quy trình.
  const data = {}
  for (const key of Object.keys(errors)) delete errors[key]
  for (const field of selected.value.spec.fields) {
    const value = form[field.key]
    if (value === undefined || value === null || value === '') {
      if (field.required) errors[field.key] = t('apps.needField', { field: field.label.toLowerCase() })
      continue
    }
    if (field.type === 'number' && !Number.isFinite(Number(value))) errors[field.key] = t('apps.needNumber')
    data[field.key] = field.type === 'number' ? Number(value) : String(value)
  }
  if (Object.keys(errors).length) {
    document.getElementById(`f-${Object.keys(errors)[0]}`)?.focus()
    return
  }
  sending.value = true
  try {
    const { insert_submission_one: created } = await gql(
      'mutation($app: String!, $data: jsonb!) { insert_submission_one(object: {app_key: $app, data: $data}) { id no } }',
      { app: selected.value.key, data })
    const failed = []
    for (const file of files.value) {
      try { await uploadFile(created.id, file) } catch (err) { failed.push(err.message) }
    }
    toast(failed.length ? t('apps.sentPartial', { no: created.no, failed: failed.join('; ') }) : t('apps.sent', { no: created.no }), !failed.length)
    router.push(`/ho-so/${created.id}`)
  } catch (err) {
    toast(t('apps.sendFail', { err: err.message }), false)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <template v-if="!route.params.key">
    <h1 class="page-title">{{ t('apps.title') }}</h1>
    <p class="page-lead">{{ t('apps.lead') }}</p>

    <p v-if="apps === null" class="mt-8 text-pencil">{{ t('common.loading') }}</p>
    <div v-else-if="apps.length === 0" class="panel mt-8 px-4 py-5 text-pencil">
      {{ t('home.noProcess') }}
      <template v-if="auth.role === 'manager'"><RouterLink to="/soan" class="font-medium text-pen hover:underline">{{ t('home.firstProcess') }}</RouterLink>.</template>
      <template v-else>{{ t('home.askManager') }}</template>
    </div>
    <div v-else class="panel mt-8">
      <RouterLink v-for="app in apps" :key="app.key" :to="`/gui/${app.key}`" class="panel-row">
        <CategoryIcon :category="app.category" />
        <div class="min-w-[min(100%,12rem)] flex-1">
          <div class="font-medium">{{ app.name }}</div>
          <div class="text-sm text-pencil">{{ app.description || t('apps.routeDefault', { route: routeText(app.spec) }) }}</div>
        </div>
        <span v-if="app.category" class="pill pill-plain">{{ app.category }}</span>
        <ChevronRight :size="18" class="hidden text-pencil sm:block" aria-hidden="true" />
      </RouterLink>
    </div>
  </template>

  <template v-else>
    <RouterLink to="/gui" class="inline-flex items-center gap-1.5 text-sm text-pencil hover:text-pen"><ArrowLeft :size="16" aria-hidden="true" /> {{ t('apps.back') }}</RouterLink>
    <p v-if="apps === null" class="mt-6 text-pencil">{{ t('common.loading') }}</p>
    <div v-else-if="!selected" class="panel mt-6 px-4 py-5 text-pencil">{{ t('apps.gone') }}</div>

    <template v-else>
      <h1 class="page-title mt-4">{{ selected.name }}</h1>
      <p v-if="selected.description" class="page-lead">{{ selected.description }}</p>

      <form class="mt-6 max-w-2xl" novalidate @submit.prevent="submit">
        <div class="panel space-y-5 p-5">
          <div v-for="field in selected.spec.fields" :key="field.key">
            <label class="label" :for="`f-${field.key}`">
              {{ field.label }} <span v-if="!field.required" class="font-normal text-pencil">{{ t('apps.optional') }}</span>
            </label>
            <textarea
              v-if="field.type === 'longtext'" :id="`f-${field.key}`" v-model="form[field.key]" class="input" rows="3"
              :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `e-${field.key}` : undefined"
            />
            <select
              v-else-if="field.type === 'select'" :id="`f-${field.key}`" v-model="form[field.key]" class="input"
              :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `e-${field.key}` : undefined"
            >
              <option value="">{{ t('apps.pick') }}</option>
              <option v-for="option in field.options" :key="option">{{ option }}</option>
            </select>
            <input
              v-else :id="`f-${field.key}`" v-model="form[field.key]" class="input num"
              :type="field.type === 'date' ? 'date' : 'text'" :inputmode="field.type === 'number' ? 'decimal' : undefined"
              :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `e-${field.key}` : undefined"
            />
            <p v-if="aiFilled[field.key]" class="mt-1 inline-flex items-center gap-1 text-xs text-pen"><Sparkles :size="12" aria-hidden="true" /> {{ t('apps.aiCheck') }}</p>
            <p v-if="errors[field.key]" :id="`e-${field.key}`" class="mt-1 text-sm text-seal">{{ errors[field.key] }}</p>
          </div>
        </div>

        <div class="panel mt-4 p-5">
          <div class="label">{{ t('apps.files') }} <span class="font-normal text-pencil">{{ t('apps.filesHint') }}</span></div>
          <ul v-if="files.length" class="mb-3 space-y-1 text-sm">
            <li v-for="(file, i) in files" :key="i" class="flex items-center gap-2">
              <Paperclip :size="14" class="text-pencil" aria-hidden="true" /> <span class="min-w-0 flex-1 truncate">{{ file.name }}</span>
              <span class="num text-pencil">{{ formatSize(file.size) }}</span>
              <button v-if="readable(file)" type="button" class="btn-quiet !min-h-7 !px-2 text-xs text-pen" :disabled="reading" @click="readWithAi(file)"><Sparkles :size="14" aria-hidden="true" /> {{ reading ? t('apps.aiReading') : t('apps.aiRead') }}</button>
              <button type="button" class="btn-icon !h-7 !w-7" :aria-label="t('apps.removeFile', { name: file.name })" @click="files.splice(i, 1)"><X :size="14" aria-hidden="true" /></button>
            </li>
          </ul>
          <label class="btn-quiet cursor-pointer"><Paperclip :size="16" aria-hidden="true" /> {{ t('apps.chooseFile') }}<input type="file" multiple class="sr-only" @change="pick" /></label>
        </div>

        <h2 class="section-title mt-8">{{ t('apps.signers') }}</h2>
        <div class="mt-3"><SignatureRow :spec="selected.spec" /></div>

        <button class="btn-primary mt-6" :disabled="sending"><Send :size="16" aria-hidden="true" /> {{ sending ? t('apps.sending') : t('apps.send') }}</button>
      </form>
    </template>
  </template>
</template>
