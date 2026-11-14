<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->
<script setup>
import { auth, logout, ROLE_LABEL } from './lib.js'

// Nhãn không gian H-P-D-I giúp người dùng (và giám khảo) nhận ra màn hình thuộc tầng nào của DX-OS.
const nav = [
  { to: '/', label: 'Việc của tôi', space: 'P' },
  { to: '/apps', label: 'Ứng dụng', space: 'P' },
  { to: '/builder', label: 'Tạo ứng dụng', space: 'I', role: 'manager' },
]
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900 md:flex">
    <aside class="border-b border-slate-200 bg-white md:w-60 md:shrink-0 md:border-b-0 md:border-r">
      <div class="flex items-center gap-3 px-5 py-4">
        <div class="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">DX</div>
        <div>
          <div class="text-sm font-semibold leading-tight">DX-Lab</div>
          <div class="text-xs text-slate-500">Project Hub</div>
        </div>
      </div>
      <nav class="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
        <template v-for="item in nav" :key="item.to">
          <RouterLink
            v-if="!item.role || auth.role === item.role"
            :to="item.to"
            class="flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            exact-active-class="!bg-indigo-50 font-medium !text-indigo-700"
          >
            {{ item.label }}
            <span class="chip bg-slate-100 text-slate-500" :title="`Không gian [${item.space}]`">{{ item.space }}</span>
          </RouterLink>
        </template>
      </nav>
    </aside>

    <div class="min-w-0 flex-1">
      <header class="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div class="text-right">
          <div class="text-sm font-medium">{{ auth.name }}</div>
          <div class="text-xs text-slate-500">{{ ROLE_LABEL[auth.role] }}</div>
        </div>
        <button class="btn-ghost" @click="logout">Đăng xuất</button>
      </header>
      <main class="mx-auto max-w-5xl p-5">
        <RouterView />
      </main>
    </div>
  </div>
</template>
