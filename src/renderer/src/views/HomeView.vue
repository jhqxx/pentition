<template>
  <div class="page home">
    <div class="toolbar home-toolbar">
      <div class="scope">
        <el-radio-group v-model="scope" size="small">
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="clue">线索</el-radio-button>
          <el-radio-button label="xf">信访</el-radio-button>
        </el-radio-group>
        <span class="toolbar-meta">数据更新于 {{ updatedAt }}</span>
      </div>
      <span class="filter-actions">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Download" @click="exportReport">导出报表</el-button>
      </span>
    </div>

    <section class="kpis" :class="scope === 'all' ? 'split' : 'four'">
      <article
        v-for="(k, i) in kpis"
        :key="k.key"
        class="kpi"
        :class="{ alert: k.alert }"
        :style="{ '--d': `${i * 35}ms` }"
      >
        <span class="kpi-label">{{ k.label }}</span>
        <strong class="kpi-value">
          {{ shown[k.key] ?? 0 }}<em v-if="k.suffix">{{ k.suffix }}</em>
          <i v-if="k.delta" class="delta" :class="{ dn: k.deltaDown }">{{ k.delta }}</i>
        </strong>
        <span class="kpi-note">{{ k.note }}</span>
      </article>
    </section>

    <section class="grid top">
      <article class="card" style="--d: 120ms">
        <header class="card-head">
          <h2>办理趋势</h2>
          <div class="legend">
            <span><i style="background: var(--harbor)" />接收</span>
            <span><i style="background: #2f8f83" />办结</span>
            <span><i style="background: #b45309" />超期</span>
            <span class="legend-note">单位：件 / 月</span>
          </div>
        </header>
        <div class="chart-body">
          <ChartSlot :empty="monthly.every((m) => !m.count && !m.completedCount && !m.overdueCount)">
            <TrendChart :labels="trendLabels" :series="trendSeries" />
          </ChartSlot>
        </div>
      </article>

      <article class="card" style="--d: 160ms">
        <header class="card-head">
          <h2>信访件与问题线索</h2>
          <span class="card-note">占比</span>
        </header>
        <div class="body">
          <ChartSlot :empty="emptyOf(kindItems)"><DonutChart :items="kindItems" center-label="总量" /></ChartSlot>
        </div>
      </article>
    </section>

    <section v-if="scope === 'xf'" class="grid two">
      <article class="card" style="--d: 200ms">
        <header class="card-head">
          <h2>办理状态分布</h2>
          <span class="card-note">全部记录 · 已办结优先</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(statusItems)"><StackedBar :items="statusItems" /></ChartSlot></div>
      </article>
      <article class="card alert-card" style="--d: 240ms">
        <header class="card-head">
          <h2>超期与待办</h2>
          <span class="card-note">需关注</span>
        </header>
        <div class="body">
          <div class="alertbox">
            <b class="danger">{{ overview.overdue }}</b>
            <span>件已超期</span>
            <p>线索超期率 {{ overview.overdueRate }}% · 待转线索 {{ overview.unconverted }} 件</p>
          </div>
        </div>
      </article>
    </section>

    <section v-else class="grid four">
      <article class="card" style="--d: 200ms">
        <header class="card-head">
          <h2>线索来源</h2>
          <span class="card-note">按问题线索</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(sourceItems)"><BarList :items="sourceItems" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 235ms">
        <header class="card-head">
          <h2>处置形态</h2>
          <span class="card-note">按问题线索</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(disposeItems)"><BarList :items="disposeItems" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 270ms">
        <header class="card-head">
          <h2>承办部室</h2>
          <span class="card-note">按问题线索</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(deptItems)"><BarList :items="deptItems" /></ChartSlot></div>
      </article>

      <article class="card alert-card" style="--d: 305ms">
        <header class="card-head">
          <h2>超期与待办</h2>
          <span class="card-note">需关注</span>
        </header>
        <div class="body">
          <div class="alertbox">
            <b class="danger">{{ overview.overdue }}</b>
            <span>件已超期</span>
            <p>线索超期率 {{ overview.overdueRate }}% · 待转线索 {{ overview.unconverted }} 件</p>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Refresh } from '@element-plus/icons-vue'
import ChartSlot from '../components/charts/ChartSlot.vue'
import TrendChart from '../components/charts/TrendChart.vue'
import DonutChart from '../components/charts/DonutChart.vue'
import BarList from '../components/charts/BarList.vue'
import StackedBar from '../components/charts/StackedBar.vue'

type Overview = {
  xfTotal: number
  xsTotal: number
  processing: number
  completed: number
  overdue: number
  overdueRate: number
  completionRate: number
  reportCount: number
  accusationCount: number
  unconverted: number
}
type GroupRow = { key: string; name: string; count: number; percentage: number }
type MonthRow = {
  monthName: string
  count: number
  completedCount: number
  overdueCount: number
  completionRate: number
}

const scope = ref<'all' | 'clue' | 'xf'>('all')
const overview = ref<Overview>({
  xfTotal: 0,
  xsTotal: 0,
  processing: 0,
  completed: 0,
  overdue: 0,
  overdueRate: 0,
  completionRate: 0,
  reportCount: 0,
  accusationCount: 0,
  unconverted: 0
})
const monthly = ref<MonthRow[]>([])
const clueSources = ref<GroupRow[]>([])
const disposeForms = ref<GroupRow[]>([])
const depts = ref<GroupRow[]>([])

type Extra = { statusMix: Array<{ name: string; value: number }> }
const extra = ref<Extra>({ statusMix: [] })
const updatedAt = ref('—')

const shown = reactive<Record<string, number>>({})
let raf = 0

function emptyOf(items?: Array<{ value?: number }> | null): boolean {
  if (!items || items.length === 0) return true
  return items.every((item) => !item.value)
}

/** 环比：最后一个月相对上一月的变化（无两月数据则不给） */
function mom(metric: (m: MonthRow) => number): { text: string; down: boolean } | null {
  const list = monthly.value
  if (list.length < 2) return null
  const last = metric(list[list.length - 1])
  const prev = metric(list[list.length - 2])
  const diff = last - prev
  if (!diff) return null
  return { text: `${diff > 0 ? '+' : ''}${diff}`, down: diff < 0 }
}

const allKpis = computed(() => {
  const dClue = mom((m) => m.count)
  const dDone = mom((m) => m.completedCount)
  return [
    { key: 'xsTotal', label: '问题线索', value: overview.value.xsTotal, note: '线索总数', delta: dClue?.text, deltaDown: dClue?.down },
    { key: 'processing', label: '未办结', value: overview.value.processing, note: '线索进行中' },
    { key: 'completed', label: '已办结', value: overview.value.completed, note: '已完成办理', delta: dDone?.text, deltaDown: dDone?.down },
    { key: 'overdue', label: '已超期', value: overview.value.overdue, note: `超期率 ${overview.value.overdueRate}%`, alert: true },
    { key: 'xfTotal', label: '受理信访', value: overview.value.xfTotal, note: '信访总数' },
    { key: 'completionRate', label: '办结率', value: overview.value.completionRate, note: '整体完成率', suffix: '%' },
    { key: 'unconverted', label: '待转线索', value: overview.value.unconverted, note: '信访件未转化' },
    { key: 'overdueRate', label: '超期率', value: overview.value.overdueRate, note: '线索超期', suffix: '%' }
  ]
})
const kpis = computed(() => {
  if (scope.value === 'clue') return allKpis.value.slice(0, 4)
  if (scope.value === 'xf') return allKpis.value.slice(4)
  return allKpis.value
})

const trendLabels = computed(() => monthly.value.map((m) => m.monthName.replace('年', '/').replace('月', '')))
const trendSeries = computed(() => [
  { name: '接收', color: 'var(--harbor)', values: monthly.value.map((m) => m.count) },
  { name: '办结', color: '#2f8f83', values: monthly.value.map((m) => m.completedCount) },
  { name: '超期', color: '#b45309', values: monthly.value.map((m) => m.overdueCount) }
])

const PALETTE = ['#1f6fb2', '#2f8f83', '#b45309', '#7a5aa8', '#c2410c', '#0e7490', '#4d7c0f', '#9d174d']
const kindItems = computed(() => [
  { name: '问题线索', value: overview.value.xsTotal, color: '#1f6fb2' },
  { name: '信访件', value: overview.value.xfTotal, color: '#7a5aa8' }
])

function topN(rows: GroupRow[], n: number): Array<{ name: string; value: number; color: string }> {
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  const head = sorted.slice(0, n)
  const rest = sorted.slice(n).reduce((s, r) => s + r.count, 0)
  const out = head.map((r, i) => ({ name: r.name, value: r.count, color: PALETTE[i % PALETTE.length] }))
  if (rest > 0) out.push({ name: '其他', value: rest, color: '#94a3b8' })
  return out
}

const STATUS_COLORS: Record<string, string> = {
  已超期: '#b91c1c',
  临期: '#d99a2b',
  正常办理中: '#1f6fb2',
  已办结: '#2f8f83'
}
const statusItems = computed(() =>
  extra.value.statusMix.map((s) => ({ ...s, color: STATUS_COLORS[s.name] ?? '#94a3b8' }))
)
const sourceItems = computed(() => topN(clueSources.value, 5))
const disposeItems = computed(() => topN(disposeForms.value, 4))
const deptItems = computed(() => topN(depts.value, 4))

function animateNumbers(): void {
  cancelAnimationFrame(raf)
  const targets = kpis.value.map((k) => ({ key: k.key, value: Number(k.value) || 0 }))
  targets.forEach((t) => {
    if (shown[t.key] === undefined) shown[t.key] = 0
  })
  if (document.hidden) {
    for (const item of targets) shown[item.key] = item.value
    return
  }
  const start = performance.now()
  const dur = 800
  const tick = (t: number): void => {
    const p = Math.min(1, (t - start) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    for (const item of targets) {
      shown[item.key] = item.key === 'completionRate' || item.key === 'overdueRate'
        ? Math.round(item.value * eased * 10) / 10
        : Math.round(item.value * eased)
    }
    if (p < 1) raf = requestAnimationFrame(tick)
    else for (const item of targets) shown[item.key] = item.value
  }
  raf = requestAnimationFrame(tick)
}

async function load(): Promise<void> {
  const [ov, mon, src, df, dp, ex] = await Promise.all([
    window.api.stats.overview(),
    window.api.stats.monthly(),
    window.api.stats.groups('ClueSource'),
    window.api.stats.groups('DisposeForm'),
    window.api.stats.groups('UndertakeDept'),
    window.api.stats.dashboard()
  ])
  if (ov?.ok && ov.data) overview.value = ov.data as Overview
  if (mon?.ok && mon.data) monthly.value = mon.data as MonthRow[]
  if (src?.ok && src.data) clueSources.value = src.data as GroupRow[]
  if (df?.ok && df.data) disposeForms.value = df.data as GroupRow[]
  if (dp?.ok && dp.data) depts.value = dp.data as GroupRow[]
  if (ex?.ok && ex.data) extra.value = ex.data as Extra
  updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  animateNumbers()
}

async function exportReport(): Promise<void> {
  // 导出整页报表（PDF）：当前首页所有 KPI、图表与卡片都会一起输出
  const res = await window.api.exports.home()
  if (res?.ok) ElMessage.success(`已导出整页报表：${res.data}`)
  else ElMessage.error(`导出失败：${res?.error ?? '未知错误'}`)
}

function onVisible(): void {
  if (!document.hidden) animateNumbers()
}

onMounted(() => {
  void load()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<style scoped>
.home {
  display: grid;
  gap: 1rem;
}
.scope {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}
.toolbar-meta {
  font-size: 0.75rem;
  color: var(--ink-3);
}

/* KPI */
.kpis {
  display: grid;
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
  animation: rise 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.kpis.split {
  grid-template-columns: repeat(8, minmax(0, 1fr));
}
.kpis.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.kpi {
  display: grid;
  gap: 0.25rem;
  padding: 0.8125rem 0.875rem 0.875rem;
  background: var(--surface);
  min-width: 0;
  animation: rise 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) var(--d, 0ms) both;
}
/* 第 5 项前加一道更明显的分隔，区分「线索层」与「信访层」 */
.kpis.split .kpi:nth-child(5) {
  box-shadow: inset 2px 0 0 var(--rule-2);
}
.kpi-label {
  font-size: 0.6875rem;
  color: var(--ink-3);
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.kpi-value em {
  font-size: 0.8125rem;
  font-style: normal;
  font-weight: 600;
  margin-left: 0.0625rem;
}
.kpi-value .delta {
  font-style: normal;
  font-size: 0.6875rem;
  font-weight: 600;
  margin-left: 0.3rem;
  color: #1f8a5f;
}
.kpi-value .delta.dn {
  color: #b4433a;
}
.kpi-note {
  font-size: 0.625rem;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi.alert .kpi-value {
  color: #b45309;
}

/* grids */
.grid {
  display: grid;
  gap: 1rem;
}
.grid.top {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  min-height: 17rem;
}
.grid.four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  min-height: 13rem;
}
.grid.two {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  min-height: 12rem;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.9375rem 1rem 1rem;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  min-width: 0;
  animation: rise 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) var(--d, 0ms) both;
}
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--harbor);
}
.card-head h2 {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink);
}
.card-note {
  font-size: 0.625rem;
  color: var(--ink-3);
}
.legend {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.625rem;
  color: var(--ink-3);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.legend i {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 2px;
}
.legend-note {
  color: var(--ink-3);
  opacity: 0.85;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 8rem;
}
.chart-body {
  flex: 1;
  min-height: 13rem;
}

/* 超期与待办 */
.alert-card .body {
  justify-content: center;
}
.alertbox {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.9rem 1rem;
  border: 1px solid #f0d8bf;
  border-radius: var(--r-md);
  background: #fdf6ee;
}
.alertbox b {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.alertbox .danger {
  color: #b45309;
}
.alertbox span {
  font-size: 0.6875rem;
  color: var(--ink-3);
}
.alertbox p {
  margin: 0.35rem 0 0;
  font-size: 0.6875rem;
  color: var(--ink-3);
  line-height: 1.5;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 80rem) {
  .kpis.split {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .grid.four {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 64rem) {
  .kpis.split,
  .kpis.four {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .grid.top,
  .grid.two {
    grid-template-columns: minmax(0, 1fr);
  }
  .grid.four {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .kpis,
  .kpi,
  .card {
    animation: none;
  }
}
</style>
