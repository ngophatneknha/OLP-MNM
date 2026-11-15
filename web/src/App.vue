<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->
<script setup>
import { Inbox, FilePlus2, FolderOpen, ChartNoAxesColumn, Bot, Workflow, PencilRuler, LogOut, CircleCheck, CircleAlert, Columns3, CalendarDays, MessageCircleQuestion, UserRound, Languages, MapPin, Users } from 'lucide-vue-next'
import { auth, logout, initials, toasts } from './lib.js'
import { t, i18n, setLang } from './i18n.js'

// Mỗi mục thuộc một không gian của khung H-P-D-I; nhãn hiện cạnh tên để người xem nhận ra kiến trúc.
const items = [
  { to: '/', label: 'nav.home', icon: Inbox, space: 'H' },
  { to: '/bang', label: 'nav.board', icon: Columns3, space: 'H' },
  { to: '/lich', label: 'nav.calendar', icon: CalendarDays, space: 'H' },
  { to: '/tai-lieu', label: 'nav.docs', icon: FolderOpen, space: 'H' },
  { to: '/ca-nhan', label: 'nav.profile', icon: UserRound, space: 'H' },
  { to: '/gui', label: 'nav.submit', icon: FilePlus2, space: 'P' },
  { to: '/quy-trinh', label: 'nav.processes', icon: Workflow, space: 'P' },
  { to: '/to-chuc', label: 'nav.org', icon: Users, space: 'H', role: 'director' },
  { to: '/soan', label: 'nav.builder', icon: PencilRuler, space: 'P', role: 'manager' },
  { to: '/so-lieu', label: 'nav.stats', icon: ChartNoAxesColumn, space: 'D', roles: ['manager', 'director'] },
  { to: '/ban-do', label: 'nav.map', icon: MapPin, space: 'D', roles: ['manager', 'director'] },
  { to: '/hoi-dap', label: 'nav.ask', icon: MessageCircleQuestion, space: 'I' },
  { to: '/tro-ly', label: 'nav.assistant', icon: Bot, space: 'I', roles: ['manager', 'director'] },
].filter((item) => (!item.role || auth.role === item.role) && (!item.roles || item.roles.includes(auth.role)))
const active = (to, path) => (to === '/' ? path === '/' || path.startsWith('/ho-so') : path.startsWith(to))
</script>

<template>
  <div class="min-h-screen md:flex">
    <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">{{ t('nav.skip') }}</a>

    <!-- Thanh điều hướng màu mực xanh: bên trái trên màn hình rộng, dưới đáy trên điện thoại. -->
    <aside class="sidebar fixed inset-x-0 bottom-0 z-30 text-white md:static md:flex md:min-h-screen md:w-60 md:shrink-0 md:flex-col">
      <div class="hidden items-center gap-3 px-5 py-5 md:flex">
        <div class="grid h-9 w-9 place-items-center rounded-md bg-white font-serif text-sm font-bold text-pen">DX</div>
        <div class="leading-tight">
          <div class="font-semibold">DX-Lab</div>
          <div class="text-xs text-white/70">Project Hub</div>
        </div>
      </div>

      <nav class="flex md:flex-col md:gap-1 md:px-3" :aria-label="t('nav.main')">
        <RouterLink
          v-for="item in items" :key="item.to" :to="item.to"
          class="flex flex-1 flex-col items-center gap-1 px-1 py-2 text-[0.6875rem] text-white/75 transition-colors hover:bg-white/10 hover:text-white md:flex-none md:flex-row md:gap-3 md:rounded-md md:px-3 md:py-2.5 md:text-sm"
          :class="{ '!bg-white/15 font-medium !text-white': active(item.to, $route.path) }"
        >
          <component :is="item.icon" :size="19" aria-hidden="true" />
          <span class="md:flex-1">{{ t(item.label) }}</span>
          <abbr class="hidden rounded bg-white/15 px-1.5 text-[0.625rem] font-semibold no-underline md:inline" :title="t(`space.${item.space}`)">{{ item.space }}</abbr>
        </RouterLink>
      </nav>

      <div class="mt-auto hidden items-center gap-3 border-t border-white/15 px-4 py-4 md:flex">
        <span class="avatar bg-white/15 text-white">{{ initials(auth.name) }}</span>
        <div class="min-w-0 flex-1 leading-tight">
          <div class="truncate text-sm font-medium">{{ auth.name }}</div>
          <div class="truncate text-xs text-white/70">{{ t(`role.${auth.role}`) }}</div>
          <div v-if="auth.orgName" class="truncate text-xs text-white/70" :title="auth.orgName">{{ auth.orgName }}</div>
        </div>
        <button class="btn-icon text-white/80 hover:bg-white/15 hover:text-white" :aria-label="t('nav.language')" :title="t('nav.language')" @click="setLang(i18n.lang === 'vi' ? 'en' : 'vi')">
          <Languages :size="18" aria-hidden="true" /><span class="sr-only">{{ i18n.lang }}</span>
        </button>
        <button class="btn-icon text-white/80 hover:bg-white/15 hover:text-white" :aria-label="t('nav.logout')" :title="t('nav.logout')" @click="logout">
          <LogOut :size="18" aria-hidden="true" />
        </button>
      </div>
    </aside>

    <div class="min-w-0 flex-1 pb-20 md:pb-0">
      <header class="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
        <div class="font-semibold">DX-Lab</div>
        <div class="flex items-center gap-2 text-sm">
          <span class="text-pencil">{{ auth.name }}, {{ t(`role.${auth.role}`) }}</span>
          <button class="btn-icon" :aria-label="t('nav.logout')" @click="logout"><LogOut :size="18" aria-hidden="true" /></button>
        </div>
      </header>
      <main id="main" class="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
        <RouterView v-slot="{ Component }"><component :is="Component" class="fade-up" /></RouterView>
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
