<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Tài liệu (không gian [H]): mọi tệp đính kèm mà tôi được phép xem, gom về một chỗ.
-->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { Download, FileText } from 'lucide-vue-next'
import { gql, downloadFile, formatSize, ago, toast } from '../lib.js'

const files = ref(null)
const query = ref('')

onMounted(async () => {
  files.value = (await gql('{ attachment(order_by: {created_at: desc}, limit: 200) { id name size uploader_name created_at submission { id no app { name } } } }')).attachment
})

const shown = computed(() => (files.value ?? []).filter((f) =>
  `${f.name} ${f.uploader_name} ${f.submission.app.name}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const save = (file) => downloadFile(file).catch((err) => toast(err.message, false))
</script>

<template>
  <h1 class="page-title">Tài liệu</h1>
  <p class="page-lead">Mọi tệp đính kèm trong các hồ sơ mà bạn được xem. Tệp luôn nằm trong hồ sơ của nó, nên ai thấy hồ sơ mới thấy tệp.</p>

  <p v-if="files === null" class="mt-8 text-pencil">Đang tải…</p>
  <div v-else-if="files.length === 0" class="panel mt-8 px-4 py-5 text-pencil">
    Chưa có tệp nào. Khi gửi hồ sơ, bạn có thể đính kèm báo giá, hóa đơn hay bất kỳ tài liệu nào cần cho người duyệt.
  </div>
  <template v-else>
    <label class="label mt-6" for="doc-search">Tìm tệp</label>
    <input id="doc-search" v-model="query" class="input max-w-sm" placeholder="Tên tệp, người tải lên hoặc loại hồ sơ" />
    <ul class="panel mt-4">
      <li v-for="f in shown" :key="f.id" class="panel-row">
        <span class="tile-icon"><FileText :size="20" aria-hidden="true" /></span>
        <div class="min-w-[min(100%,12rem)] flex-1">
          <div class="font-medium">{{ f.name }}</div>
          <div class="text-sm text-pencil">
            {{ f.uploader_name }} tải lên {{ ago(f.created_at) }}, trong
            <RouterLink :to="`/ho-so/${f.submission.id}`" class="text-pen hover:underline">{{ f.submission.app.name }}, hồ sơ số {{ f.submission.no }}</RouterLink>
          </div>
        </div>
        <span class="num text-sm text-pencil">{{ formatSize(f.size) }}</span>
        <button class="btn-quiet" :aria-label="`Tải ${f.name}`" @click="save(f)"><Download :size="16" aria-hidden="true" /> Tải về</button>
      </li>
      <li v-if="!shown.length" class="panel-row text-pencil">Không có tệp nào khớp “{{ query }}”.</li>
    </ul>
  </template>
</template>
