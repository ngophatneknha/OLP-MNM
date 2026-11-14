<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Danh sách ứng dụng đã xuất bản và form gửi hồ sơ. Form được dựng hoàn toàn từ spec.fields.
-->
<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { gql } from '../lib.js'
import FlowDiagram from '../components/FlowDiagram.vue'

const router = useRouter()
const apps = ref(null)
const selected = ref(null)
const form = reactive({})
const error = ref('')
const sending = ref(false)

onMounted(async () => {
  apps.value = (await gql('{ app(where: {status: {_eq: "published"}}, order_by: {name: asc}) { key name spec } }')).app
})

function open(app) {
  selected.value = app
  error.value = ''
  for (const key of Object.keys(form)) delete form[key]
}

async function submit() {
  // Kiểm tra sớm cho người dùng; cơ sở dữ liệu vẫn kiểm lại theo đúng spec.
  const data = {}
  for (const field of selected.value.spec.fields) {
    const value = form[field.key]
    if (value === undefined || value === null || value === '') {
      if (field.required) return (error.value = `Vui lòng nhập "${field.label}"`)
      continue
    }
    data[field.key] = field.type === 'number' ? Number(value) : String(value)
  }
  sending.value = true
  try {
    await gql('mutation($app: String!, $data: jsonb!) { insert_submission_one(object: {app_key: $app, data: $data}) { id } }', { app: selected.value.key, data })
    router.push('/')
  } catch (err) {
    error.value = `Không gửi được hồ sơ: ${err.message}`
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="!selected">
    <h1 class="page-title">Ứng dụng</h1>
    <p class="page-hint">Chọn một quy trình để gửi hồ sơ.</p>
    <p v-if="apps === null" class="mt-6 text-sm text-slate-500">Đang tải…</p>
    <div v-else-if="apps.length === 0" class="card mt-6 text-sm text-slate-600">
      Chưa có ứng dụng nào được xuất bản. Trưởng phòng có thể tạo ở mục “Tạo ứng dụng”.
    </div>
    <div v-else class="mt-6 grid gap-4 sm:grid-cols-2">
      <button v-for="app in apps" :key="app.key" class="card text-left transition hover:border-indigo-400 hover:shadow" @click="open(app)">
        <div class="font-semibold">{{ app.name }}</div>
        <div class="mt-1 text-sm text-slate-500">{{ app.spec.fields.length }} ô thông tin · {{ app.spec.steps.length }} bước xử lý</div>
      </button>
    </div>
  </div>

  <div v-else>
    <button class="text-sm text-indigo-700 hover:underline" @click="selected = null">← Tất cả ứng dụng</button>
    <h1 class="page-title mt-2">{{ selected.name }}</h1>
    <div class="card mt-4">
      <div class="mb-3 text-sm font-medium text-slate-700">Hồ sơ sẽ đi qua</div>
      <FlowDiagram :spec="selected.spec" />
    </div>
    <form class="card mt-4 space-y-4" @submit.prevent="submit">
      <div v-for="field in selected.spec.fields" :key="field.key">
        <label class="label" :for="field.key">{{ field.label }} <span v-if="field.required" class="text-rose-600">*</span></label>
        <textarea v-if="field.type === 'longtext'" :id="field.key" v-model="form[field.key]" class="input" rows="3" />
        <select v-else-if="field.type === 'select'" :id="field.key" v-model="form[field.key]" class="input">
          <option value="">— Chọn —</option>
          <option v-for="option in field.options" :key="option">{{ option }}</option>
        </select>
        <input v-else :id="field.key" v-model="form[field.key]" class="input" :type="field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'" step="any" />
      </div>
      <p v-if="error" class="text-sm text-rose-700" role="alert">{{ error }}</p>
      <button class="btn-primary" :disabled="sending">{{ sending ? 'Đang gửi…' : 'Gửi hồ sơ' }}</button>
    </form>
  </div>
</template>
