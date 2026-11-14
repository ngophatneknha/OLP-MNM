<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Số liệu điều hành (không gian [D]): quyết định dựa trên dữ liệu thật của hồ sơ, không phải cảm tính.
Mọi con số tính từ hồ sơ và nhật ký bằng mã (metrics.js), mỗi dòng bấm vào được hồ sơ gốc.
-->
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { gql, ROLE_LABEL } from '../lib.js'
import { computeMetrics, formatHours } from '../metrics.js'

const submissions = ref(null)
let timer

async function load() {
  submissions.value = (await gql(`{ submission(order_by: {created_at: desc}, limit: 500) {
    id no status current_step waiting_role created_at finished_at
    app { name } version { spec }
    events { step_key action created_at }
  } }`)).submission
}
onMounted(() => { load(); timer = setInterval(load, 5000) })
onUnmounted(() => clearInterval(timer))

const m = computed(() => submissions.value && computeMetrics(submissions.value))
const maxHours = computed(() => Math.max(...(m.value?.steps.map((s) => s.avgHours) ?? [0]), 0.0001))
const STATUS = [
  { key: 'approved', label: 'Hoàn tất', bar: 'bg-done' },
  { key: 'running', label: 'Đang xử lý', bar: 'bg-wait' },
  { key: 'rejected', label: 'Bị từ chối', bar: 'bg-seal' },
]
const percent = (n) => (m.value.total ? Math.round((n / m.value.total) * 100) : 0)
</script>

<template>
  <h1 class="page-title">Số liệu</h1>
  <p class="page-lead">Việc đang diễn ra trong tổ chức, tính từ hồ sơ và nhật ký ký duyệt. Tự cập nhật mỗi vài giây.</p>

  <p v-if="!m" class="mt-8 text-pencil">Đang tải…</p>
  <div v-else-if="m.total === 0" class="panel mt-8 px-4 py-5 text-pencil">
    Chưa có hồ sơ nào để thống kê. Số liệu sẽ xuất hiện khi nhân viên bắt đầu gửi hồ sơ.
  </div>

  <div v-else class="mt-8 space-y-10">
    <section aria-labelledby="overview-title">
      <h2 id="overview-title" class="section-title">Tổng quan</h2>
      <dl class="panel mt-3 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div class="p-4"><dt class="text-sm text-pencil">Hồ sơ đã nhận</dt><dd class="num mt-1 text-2xl font-semibold">{{ m.total }}</dd></div>
        <div class="p-4"><dt class="text-sm text-pencil">Thời gian xử lý trung bình</dt><dd class="num mt-1 text-2xl font-semibold">{{ m.finishedCount ? formatHours(m.avgDoneHours) : 'Chưa có' }}</dd><dd class="text-xs text-pencil">trên {{ m.finishedCount }} hồ sơ đã kết thúc</dd></div>
        <div class="p-4"><dt class="text-sm text-pencil">Tỷ lệ được duyệt</dt><dd class="num mt-1 text-2xl font-semibold">{{ m.approvedRate === null ? 'Chưa có' : `${Math.round(m.approvedRate * 100)}%` }}</dd><dd class="text-xs text-pencil">trong các hồ sơ đã có quyết định</dd></div>
      </dl>

      <div class="mt-4 flex h-3 overflow-hidden rounded-full bg-ground" role="img" :aria-label="`Hoàn tất ${m.status.approved}, đang xử lý ${m.status.running}, bị từ chối ${m.status.rejected}`">
        <div v-for="s in STATUS" :key="s.key" :class="s.bar" :style="{ width: `${percent(m.status[s.key])}%` }" />
      </div>
      <ul class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <li v-for="s in STATUS" :key="s.key" class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full" :class="s.bar" /> {{ s.label }}: <span class="num font-medium">{{ m.status[s.key] }}</span></li>
      </ul>
    </section>

    <section v-if="m.steps.length" aria-labelledby="slow-title">
      <h2 id="slow-title" class="section-title">Hồ sơ chờ lâu nhất ở bước nào</h2>
      <p v-if="m.bottleneck" class="mt-1 max-w-[65ch] text-pencil">
        Chậm nhất là “{{ m.bottleneck.step }}” của {{ m.bottleneck.process }}, trung bình
        <strong class="text-ink">{{ formatHours(m.bottleneck.avgHours) }}</strong> mỗi hồ sơ ({{ ROLE_LABEL[m.bottleneck.role] }}).
      </p>
      <ul class="panel mt-3">
        <li v-for="s in m.steps" :key="s.process + s.step" class="panel-row">
          <div class="min-w-[min(100%,14rem)] flex-1">
            <div class="font-medium">{{ s.step }}</div>
            <div class="text-xs text-pencil">{{ s.process }} · {{ ROLE_LABEL[s.role] }} · {{ s.count }} lượt</div>
          </div>
          <div class="flex w-full items-center gap-3 sm:w-1/2">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-ground"><div class="h-full rounded-full bg-pen" :style="{ width: `${(s.avgHours / maxHours) * 100}%` }" /></div>
            <span class="num w-20 text-right text-sm">{{ formatHours(s.avgHours) }}</span>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="m.longestWaiting.length" aria-labelledby="stuck-title">
      <h2 id="stuck-title" class="section-title">Đang chờ lâu nhất lúc này</h2>
      <ul class="panel mt-3">
        <li v-for="w in m.longestWaiting" :key="w.id" class="panel-row">
          <RouterLink :to="`/ho-so/${w.id}`" class="min-w-[min(100%,14rem)] flex-1 font-medium hover:text-pen hover:underline">{{ w.process }}, hồ sơ số {{ w.no }}</RouterLink>
          <span class="text-sm text-pencil">Chờ {{ ROLE_LABEL[w.role] }} ở bước “{{ w.step }}”</span>
          <span class="pill pill-wait num">{{ formatHours(w.hours) }}</span>
        </li>
      </ul>
    </section>

    <section aria-labelledby="apps-title">
      <h2 id="apps-title" class="section-title">Theo loại hồ sơ</h2>
      <div class="panel mt-3 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-pencil"><tr><th class="px-4 py-2 font-medium">Quy trình</th><th class="px-4 py-2 text-right font-medium">Tổng</th><th class="px-4 py-2 text-right font-medium">Hoàn tất</th><th class="px-4 py-2 text-right font-medium">Đang xử lý</th><th class="px-4 py-2 text-right font-medium">Từ chối</th></tr></thead>
          <tbody>
            <tr v-for="a in m.apps" :key="a.name" class="border-t border-line">
              <th scope="row" class="px-4 py-2 font-medium">{{ a.name }}</th>
              <td class="num px-4 py-2 text-right">{{ a.total }}</td><td class="num px-4 py-2 text-right">{{ a.approved }}</td>
              <td class="num px-4 py-2 text-right">{{ a.running }}</td><td class="num px-4 py-2 text-right">{{ a.rejected }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
