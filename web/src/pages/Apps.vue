<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Gửi hồ sơ: chọn loại hồ sơ, điền form (dựng hoàn toàn từ quy trình), thấy trước ai sẽ ký.
-->
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight, Send } from 'lucide-vue-next'
import { auth, gql, routeText, toast } from '../lib.js'
import SignatureRow from '../components/SignatureRow.vue'
import CategoryIcon from '../components/CategoryIcon.vue'

const route = useRoute()
const router = useRouter()
const apps = ref(null)
const form = reactive({})
const errors = reactive({})
const sending = ref(false)

onMounted(async () => {
  apps.value = (await gql('{ app(where: {status: {_eq: "published"}}, order_by: {name: asc}) { key name description category spec } }')).app
})

const selected = computed(() => apps.value?.find((a) => a.key === route.params.key))
watch(selected, () => {
  for (const key of Object.keys(form)) delete form[key]
  for (const key of Object.keys(errors)) delete errors[key]
})

async function submit() {
  // Kiểm tra sớm, báo lỗi ngay tại ô sai; cơ sở dữ liệu vẫn kiểm lại theo đúng quy trình.
  const data = {}
  for (const key of Object.keys(errors)) delete errors[key]
  for (const field of selected.value.spec.fields) {
    const value = form[field.key]
    if (value === undefined || value === null || value === '') {
      if (field.required) errors[field.key] = `Cần điền ${field.label.toLowerCase()}`
      continue
    }
    if (field.type === 'number' && !Number.isFinite(Number(value))) errors[field.key] = 'Cần là một con số'
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
    toast(`Đã gửi hồ sơ số ${created.no}`)
    router.push(`/ho-so/${created.id}`)
  } catch (err) {
    toast(`Chưa gửi được hồ sơ: ${err.message}. Kiểm tra lại các ô rồi thử lại.`, false)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <template v-if="!route.params.key">
    <h1 class="page-title">Gửi hồ sơ</h1>
    <p class="page-lead">Chọn loại hồ sơ bạn cần. Mỗi loại cho biết trước hồ sơ sẽ qua những ai.</p>

    <p v-if="apps === null" class="mt-8 text-pencil">Đang tải…</p>
    <div v-else-if="apps.length === 0" class="panel mt-8 px-4 py-5 text-pencil">
      Chưa có quy trình nào được xuất bản.
      <template v-if="auth.role === 'manager'"><RouterLink to="/soan" class="font-medium text-pen hover:underline">Soạn quy trình đầu tiên</RouterLink>.</template>
      <template v-else>Trưởng phòng có thể soạn quy trình đầu tiên.</template>
    </div>
    <div v-else class="panel mt-8">
      <RouterLink v-for="app in apps" :key="app.key" :to="`/gui/${app.key}`" class="panel-row">
        <CategoryIcon :category="app.category" />
        <div class="min-w-[min(100%,12rem)] flex-1">
          <div class="font-medium">{{ app.name }}</div>
          <div class="text-sm text-pencil">{{ app.description || `Hồ sơ đi qua ${routeText(app.spec)}` }}</div>
        </div>
        <span v-if="app.category" class="pill pill-plain">{{ app.category }}</span>
        <ChevronRight :size="18" class="hidden text-pencil sm:block" aria-hidden="true" />
      </RouterLink>
    </div>
  </template>

  <template v-else>
    <RouterLink to="/gui" class="inline-flex items-center gap-1.5 text-sm text-pencil hover:text-pen"><ArrowLeft :size="16" aria-hidden="true" /> Tất cả loại hồ sơ</RouterLink>
    <p v-if="apps === null" class="mt-6 text-pencil">Đang tải…</p>
    <div v-else-if="!selected" class="panel mt-6 px-4 py-5 text-pencil">Loại hồ sơ này không còn được dùng. Hãy chọn một loại khác.</div>

    <template v-else>
      <h1 class="page-title mt-4">{{ selected.name }}</h1>
      <p v-if="selected.description" class="page-lead">{{ selected.description }}</p>

      <form class="mt-6 max-w-2xl" novalidate @submit.prevent="submit">
        <div class="panel space-y-5 p-5">
          <div v-for="field in selected.spec.fields" :key="field.key">
            <label class="label" :for="`f-${field.key}`">
              {{ field.label }} <span v-if="!field.required" class="font-normal text-pencil">(không bắt buộc)</span>
            </label>
            <textarea
              v-if="field.type === 'longtext'" :id="`f-${field.key}`" v-model="form[field.key]" class="input" rows="3"
              :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `e-${field.key}` : undefined"
            />
            <select
              v-else-if="field.type === 'select'" :id="`f-${field.key}`" v-model="form[field.key]" class="input"
              :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `e-${field.key}` : undefined"
            >
              <option value="">Chọn một mục</option>
              <option v-for="option in field.options" :key="option">{{ option }}</option>
            </select>
            <input
              v-else :id="`f-${field.key}`" v-model="form[field.key]" class="input num"
              :type="field.type === 'date' ? 'date' : 'text'" :inputmode="field.type === 'number' ? 'decimal' : undefined"
              :aria-invalid="!!errors[field.key]" :aria-describedby="errors[field.key] ? `e-${field.key}` : undefined"
            />
            <p v-if="errors[field.key]" :id="`e-${field.key}`" class="mt-1 text-sm text-seal">{{ errors[field.key] }}</p>
          </div>
        </div>

        <h2 class="section-title mt-8">Hồ sơ sẽ cần chữ ký của</h2>
        <div class="mt-3"><SignatureRow :spec="selected.spec" /></div>

        <button class="btn-primary mt-6" :disabled="sending"><Send :size="16" aria-hidden="true" /> {{ sending ? 'Đang gửi…' : 'Gửi hồ sơ' }}</button>
      </form>
    </template>
  </template>
</template>
