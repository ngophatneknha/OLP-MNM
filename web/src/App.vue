<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->
<script setup>
import { Inbox, FilePlus2, FolderOpen, ChartNoAxesColumn, Workflow, PencilRuler, LogOut, CircleCheck, CircleAlert } from 'lucide-vue-next'
import { auth, logout, ROLE_LABEL, initials, toasts } from './lib.js'

const nav = [
  { to: '/', label: 'Bàn làm việc', icon: Inbox },
  { to: '/gui', label: 'Gửi hồ sơ', icon: FilePlus2 },
  { to: '/tai-lieu', label: 'Tài liệu', icon: FolderOpen },
  { to: '/so-lieu', label: 'Số liệu', icon: ChartNoAxesColumn, roles: ['manager', 'director'] },
  { to: '/quy-trinh', label: 'Quy trình', icon: Workflow },
  { to: '/soan', label: 'Soạn quy trình', icon: PencilRuler, role: 'manager' },
].filter((item) => (!item.role || auth.role === item.role) && (!item.roles || item.roles.includes(auth.role)))
</script>

<template>
  <div class="min-h-screen md:flex">
    <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">Đi tới nội dung</a>

    <!-- Thanh điều hướng màu mực xanh: bên trái trên màn hình rộng, dưới đáy trên điện thoại. -->
    <aside class="fixed inset-x-0 bottom-0 z-30 bg-pen text-white md:static md:flex md:min-h-screen md:w-60 md:shrink-0 md:flex-col">
      <div class="hidden items-center gap-3 px-5 py-5 md:flex">
        <div class="grid h-9 w-9 place-items-center rounded-md bg-white font-serif text-sm font-bold text-pen">DX</div>
        <div class="leading-tight">
          <div class="font-semibold">DX-Lab</div>
          <div class="text-xs text-white/70">Project Hub</div>
        </div>
      </div>

      <nav class="flex md:flex-col md:gap-1 md:px-3" aria-label="Điều hướng chính">
        <RouterLink
          v-for="item in nav" :key="item.to" :to="item.to"
          class="flex flex-1 flex-col items-center gap-1 px-1 py-2 text-[0.6875rem] text-white/75 transition-colors hover:bg-white/10 hover:text-white md:flex-none md:flex-row md:gap-3 md:rounded-md md:px-3 md:py-2.5 md:text-sm"
          :class="{ '!bg-white/15 font-medium !text-white': item.to === '/' ? $route.path === '/' || $route.path.startsWith('/ho-so') : $route.path.startsWith(item.to) }"
        >
          <component :is="item.icon" :size="19" aria-hidden="true" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="mt-auto hidden items-center gap-3 border-t border-white/15 px-4 py-4 md:flex">
        <span class="avatar bg-white/15 text-white">{{ initials(auth.name) }}</span>
        <div class="min-w-0 flex-1 leading-tight">
          <div class="truncate text-sm font-medium">{{ auth.name }}</div>
          <div class="text-xs text-white/70">{{ ROLE_LABEL[auth.role] }}</div>
        </div>
        <button class="btn-icon text-white/80 hover:bg-white/15 hover:text-white" aria-label="Đăng xuất" title="Đăng xuất" @click="logout">
          <LogOut :size="18" aria-hidden="true" />
        </button>
      </div>
    </aside>

    <div class="min-w-0 flex-1 pb-20 md:pb-0">
      <header class="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
        <div class="font-semibold">DX-Lab</div>
        <div class="flex items-center gap-2 text-sm">
          <span class="text-pencil">{{ auth.name }}, {{ ROLE_LABEL[auth.role] }}</span>
          <button class="btn-icon" aria-label="Đăng xuất" @click="logout"><LogOut :size="18" aria-hidden="true" /></button>
        </div>
      </header>
      <main id="main" class="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
        <RouterView />
      </main>
    </div>

    <div class="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
      <div
        v-for="item in toasts" :key="item.id"
        class="pointer-events-auto flex max-w-md items-start gap-2 rounded-md px-4 py-3 text-sm text-white shadow-[0_6px_20px_rgb(19_26_38_/_0.25)]"
        :class="item.ok ? 'bg-ink' : 'bg-seal'"
      >
        <component :is="item.ok ? CircleCheck : CircleAlert" :size="18" class="mt-0.5 shrink-0" aria-hidden="true" />
        {{ item.text }}
      </div>
    </div>
  </div>
</template>
