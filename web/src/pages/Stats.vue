<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Số liệu điều hành (không gian [D]): quyết định dựa trên dữ liệu thật của hồ sơ, không phải cảm tính.
Mọi con số tính từ hồ sơ và nhật ký bằng mã (metrics.js), mỗi dòng bấm vào được hồ sơ gốc.
-->
<script setup>
import { live } from '../live.js'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { auth, gql, ROLE_LABEL } from '../lib.js'
import { computeMetrics, formatHours } from '../metrics.js'
import { computeMaturity, incompleteLogs, maturityLevel, nextStep, weeklyTrend } from '../maturity.js'
import { download, toCsv, toJson } from '../exporter.js'
import { agreement } from '../autonomy.js'
import { improvementHints, missingRoles } from '../hints.js'
import { t } from '../i18n.js'

const submissions = ref(null)
const extra = ref(null) // quy trình, phiên bản, đề xuất, nấc tự chủ: chỉ để chấm mức trưởng thành
let timer

async function load() {
  submissions.value = (await gql(`{ submission(order_by: {created_at: desc}, limit: 500) {
    id no status current_step waiting_role created_at finished_at
    app { key name } version { spec } app_version data
    events { step_key action actor_name note created_at }
    opinions { step_key }
  } }`)).submission
  try {
    extra.value = await gql(`{ apps: app(where: {status: {_eq: "published"}}) { key spec versions { version } changes { status } }
      autonomy: step_autonomy { app_key step_key level } }`)
  } catch { extra.value = null } // vai trò không đọc được: bỏ phần chấm điểm, các số liệu khác vẫn hiện
}
async function loadOpinions() {
  if (auth.role !== 'director') return
  try { opinionList.value = (await gql('{ ai_opinion(limit: 1000) { matched sample } }')).ai_opinion } catch { opinionList.value = [] }
}
onMounted(() => { load(); loadOpinions(); timer = live(load) })
onUnmounted(() => timer?.())

const m = computed(() => submissions.value && computeMetrics(submissions.value))
const maturity = computed(() => submissions.value && extra.value && computeMaturity({ submissions: submissions.value, apps: extra.value.apps, autonomy: extra.value.autonomy }))
const opinionList = ref([]) // chỉ giám đốc đọc được cột so sánh với quyết định của người
const agree = computed(() => agreement(opinionList.value))
const hints = computed(() => (submissions.value ? improvementHints(submissions.value) : []))
const roleGaps = computed(() => (submissions.value && extra.value ? missingRoles(submissions.value, extra.value.apps) : []))
const missingLogs = computed(() => (submissions.value ? incompleteLogs(submissions.value) : []))
const stamp = () => new Date().toISOString().slice(0, 10)
const trend = computed(() => (submissions.value && extra.value ? weeklyTrend({ submissions: submissions.value, apps: extra.value.apps }) : []))
const SPACES = ['H', 'P', 'D', 'I']
const maxHours = computed(() => Math.max(...(m.value?.steps.map((s) => s.avgHours) ?? [0]), 0.0001))
const STATUS = [
  { key: 'approved', bar: 'bg-done' },
  { key: 'running', bar: 'bg-wait' },
  { key: 'rejected', bar: 'bg-seal' },
]
const percent = (n) => (m.value.total ? Math.round((n / m.value.total) * 100) : 0)
</script>

<template>
  <h1 class="page-title">{{ t('stats.title') }}</h1>
  <p class="page-lead">{{ t('stats.lead') }}</p>

  <p v-if="!m" class="mt-8 text-pencil">{{ t('common.loading') }}</p>
  <div v-else-if="m.total === 0" class="panel mt-8 px-4 py-5 text-pencil">
    {{ t('stats.empty') }}
  </div>

  <div v-else class="mt-8 space-y-10">
    <section aria-labelledby="overview-title">
      <h2 id="overview-title" class="section-title">{{ t('stats.overview') }}</h2>
      <dl class="panel mt-3 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div class="p-4"><dt class="text-sm text-pencil">{{ t('stats.received') }}</dt><dd class="num mt-1 text-2xl font-semibold">{{ m.total }}</dd></div>
        <div class="p-4"><dt class="text-sm text-pencil">{{ t('stats.avgTime') }}</dt><dd class="num mt-1 text-2xl font-semibold">{{ m.finishedCount ? formatHours(m.avgDoneHours) : t('stats.none') }}</dd><dd class="text-xs text-pencil">{{ t('stats.onFinished', { n: m.finishedCount }) }}</dd></div>
        <div class="p-4"><dt class="text-sm text-pencil">{{ t('stats.approvedRate') }}</dt><dd class="num mt-1 text-2xl font-semibold">{{ m.approvedRate === null ? t('stats.none') : `${Math.round(m.approvedRate * 100)}%` }}</dd><dd class="text-xs text-pencil">{{ t('stats.ofDecided') }}</dd></div>
      </dl>

      <div class="mt-4 flex h-3 overflow-hidden rounded-full bg-ground" role="img" :aria-label="t('stats.statusAria', { a: m.status.approved, r: m.status.running, j: m.status.rejected })">
        <div v-for="s in STATUS" :key="s.key" :class="s.bar" :style="{ width: `${percent(m.status[s.key])}%` }" />
      </div>
      <ul class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <li v-for="s in STATUS" :key="s.key" class="flex items-center gap-2"><span class="h-2.5 w-2.5 rounded-full" :class="s.bar" /> {{ t('stats.status.' + s.key) }}: <span class="num font-medium">{{ m.status[s.key] }}</span></li>
      </ul>
    </section>

    <section v-if="maturity" aria-labelledby="mat-title">
      <h2 id="mat-title" class="section-title">{{ t('mat.title') }}</h2>
      <p class="mt-1 max-w-[65ch] text-pencil">{{ t('mat.lead') }}</p>
      <p v-if="!maturity.enough" class="panel mt-3 px-4 py-4 text-pencil">{{ t('mat.need') }} {{ maturity.need }} {{ t('mat.have') }} {{ maturity.have }}.</p>
      <template v-else>
        <p class="mt-3 text-xs text-pencil">{{ t('mat.basis', { subs: submissions.length, apps: extra.apps.length }) }}</p>
        <p class="num mt-1 text-sm text-pencil">{{ t('mat.overall') }}: <strong class="text-2xl text-ink">{{ maturity.overall ?? '–' }}</strong> / 100 · {{ t('mat.level.' + maturityLevel(maturity.overall)) }}</p>
        <p v-if="auth.role === 'director'" class="mt-1 text-xs text-pencil">{{ agree.total ? t('ai.agree', { hits: agree.hits, total: agree.total, pct: Math.round(agree.hits / agree.total * 100) }) : t('ai.none') }}</p>
        <ul class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <li v-for="space in SPACES" :key="space" class="panel p-4">
            <div class="flex items-baseline justify-between gap-2">
              <h3 class="font-semibold">{{ space }} · {{ t('space.' + space) }}</h3>
              <span class="num text-2xl font-semibold">{{ maturity.spaces[space].score ?? '–' }}</span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-ground" role="img" :aria-label="`${space}: ${maturity.spaces[space].score ?? t('mat.none')}`">
              <div class="h-full rounded-full bg-pen" :style="{ width: `${maturity.spaces[space].score ?? 0}%` }" />
            </div>
            <p class="mt-1 text-xs text-pencil">{{ t('mat.level.' + maturityLevel(maturity.spaces[space].score)) }}</p>
            <p v-if="nextStep(maturity.spaces[space])" class="mt-3 border-t border-line pt-2 text-xs"><strong>{{ t('mat.next') }}:</strong> {{ t('mat.next.' + space + '.' + nextStep(maturity.spaces[space]).key) }}</p>
            <ul class="mt-3 space-y-1 text-xs text-pencil">
              <li v-for="part in maturity.spaces[space].parts" :key="part.key" class="flex justify-between gap-2">
                <span>{{ t('mat.' + space + '.' + part.key) }} <span class="num">({{ part.weight }}%)</span></span>
                <span class="num font-medium text-ink">{{ part.value === null ? '–' : Math.round(part.value * 100) + '%' }}</span>
              </li>
            </ul>
          </li>
        </ul>
        <h3 class="mt-5 text-sm font-semibold">{{ t('mat.trend') }}</h3>
        <div class="panel mt-2 overflow-x-auto">
          <table class="num w-full text-left text-sm">
            <thead class="text-pencil"><tr><th class="px-4 py-2 font-medium">{{ t('mat.week') }}</th><th class="px-4 py-2 text-right font-medium">H</th><th class="px-4 py-2 text-right font-medium">D</th></tr></thead>
            <tbody>
              <tr v-for="(w, i) in trend" :key="w.at" class="border-t border-line">
                <th scope="row" class="px-4 py-2 font-medium">{{ i === trend.length - 1 ? t('mat.now') : t('mat.ago', { n: trend.length - 1 - i }) }}</th>
                <td class="px-4 py-2 text-right">{{ w.H ?? '–' }}</td><td class="px-4 py-2 text-right">{{ w.D ?? '–' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <section aria-labelledby="hint-title">
      <h2 id="hint-title" class="section-title">{{ t('hint.title') }}</h2>
      <p class="mt-1 max-w-[65ch] text-pencil">{{ t('hint.lead') }}</p>
      <p v-if="roleGaps.length" class="mt-3 text-sm text-seal">{{ t('hint.roles', { roles: roleGaps.map((r) => ROLE_LABEL[r] ?? r).join(', ') }) }}</p>
      <p v-if="!hints.length" class="mt-3 text-done">✓ {{ t('hint.none') }}</p>
      <ul v-else class="panel mt-3">
        <li v-for="h in hints" :key="h.kind + h.appKey + h.step" class="panel-row">
          <p class="min-w-[min(100%,16rem)] flex-1 text-sm">
            {{ h.kind === 'slow'
              ? t('hint.slow', { step: h.step, process: h.process, value: formatHours(h.value), count: h.count })
              : t('hint.rejected', { step: h.step, process: h.process, pct: Math.round(h.value * 100), count: h.count }) }}
          </p>
          <RouterLink to="/quy-trinh" class="text-sm font-medium text-pen hover:underline">{{ t('hint.propose') }}</RouterLink>
        </li>
      </ul>
    </section>

    <section aria-labelledby="log-title">
      <h2 id="log-title" class="section-title">{{ t('log.title') }}</h2>
      <p class="mt-1 max-w-[65ch] text-pencil">{{ t('log.lead') }}</p>
      <p v-if="!missingLogs.length" class="mt-3 text-done">✓ {{ t('log.ok') }}</p>
      <template v-else>
        <p class="mt-3 text-seal">{{ t('log.missing', { n: missingLogs.length }) }}</p>
        <ul class="panel mt-2">
          <li v-for="s in missingLogs.slice(0, 10)" :key="s.id" class="panel-row">
            <RouterLink :to="`/ho-so/${s.id}`" class="font-medium hover:text-pen hover:underline">{{ t('log.item', { name: s.app.name, no: s.no }) }}</RouterLink>
          </li>
        </ul>
      </template>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn-quiet" @click="download(`dxlab-nhat-ky-${stamp()}.csv`, toCsv(submissions), 'text/csv;charset=utf-8')">{{ t('log.csv') }}</button>
        <button type="button" class="btn-quiet" @click="download(`dxlab-nhat-ky-${stamp()}.json`, toJson(submissions), 'application/json')">{{ t('log.json') }}</button>
      </div>
    </section>

    <section v-if="m.steps.length" aria-labelledby="slow-title">
      <h2 id="slow-title" class="section-title">{{ t('stats.slowTitle') }}</h2>
      <p v-if="m.bottleneck" class="mt-1 max-w-[65ch] text-pencil">
        {{ t('stats.slowest', { step: m.bottleneck.step, process: m.bottleneck.process, time: formatHours(m.bottleneck.avgHours), role: ROLE_LABEL[m.bottleneck.role] }) }}
      </p>
      <ul class="panel mt-3">
        <li v-for="s in m.steps" :key="s.process + s.step" class="panel-row">
          <div class="min-w-[min(100%,14rem)] flex-1">
            <div class="font-medium">{{ s.step }}</div>
            <div class="text-xs text-pencil">{{ t('stats.turns', { process: s.process, role: ROLE_LABEL[s.role], n: s.count }) }}</div>
          </div>
          <div class="flex w-full items-center gap-3 sm:w-1/2">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-ground"><div class="h-full rounded-full bg-pen" :style="{ width: `${(s.avgHours / maxHours) * 100}%` }" /></div>
            <span class="num w-20 text-right text-sm">{{ formatHours(s.avgHours) }}</span>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="m.longestWaiting.length" aria-labelledby="stuck-title">
      <h2 id="stuck-title" class="section-title">{{ t('stats.stuckTitle') }}</h2>
      <ul class="panel mt-3">
        <li v-for="w in m.longestWaiting" :key="w.id" class="panel-row">
          <RouterLink :to="`/ho-so/${w.id}`" class="min-w-[min(100%,14rem)] flex-1 font-medium hover:text-pen hover:underline">{{ t('stats.stuckRef', { process: w.process, no: w.no }) }}</RouterLink>
          <span class="text-sm text-pencil">{{ t('stats.waitsOn', { role: ROLE_LABEL[w.role], step: w.step }) }}</span>
          <span class="pill pill-wait num">{{ formatHours(w.hours) }}</span>
        </li>
      </ul>
    </section>

    <section aria-labelledby="apps-title">
      <h2 id="apps-title" class="section-title">{{ t('stats.byApp') }}</h2>
      <div class="panel mt-3 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-pencil"><tr><th class="px-4 py-2 font-medium">{{ t('stats.th.process') }}</th><th class="px-4 py-2 text-right font-medium">{{ t('stats.th.total') }}</th><th class="px-4 py-2 text-right font-medium">{{ t('stats.th.done') }}</th><th class="px-4 py-2 text-right font-medium">{{ t('stats.th.running') }}</th><th class="px-4 py-2 text-right font-medium">{{ t('stats.th.rejected') }}</th></tr></thead>
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
