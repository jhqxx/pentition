<template>
  <div class="page home">
    <div class="toolbar home-toolbar">
      <span class="toolbar-meta">数据更新于 {{ updatedAt }}</span>
      <span class="filter-actions">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Download" @click="exportReport">导出报表</el-button>
      </span>
    </div>

    <section class="kpis">
      <article v-for="(k, i) in kpis" :key="k.key" class="kpi" :class="{ alert: k.alert }" :style="{ '--d': `${i * 40}ms` }">
        <span class="kpi-label">{{ k.label }}</span>
        <strong class="kpi-value">{{ shown[k.key] ?? 0 }}<em v-if="k.suffix">{{ k.suffix }}</em></strong>
        <span class="kpi-note">{{ k.note }}</span>
      </article>
    </section>

    <section class="grid">
      <article class="card span2" style="--d: 140ms">
        <header class="card-head">
          <h2>办理趋势</h2>
          <div class="legend">
            <span><i style="background: var(--harbor)" />接收</span>
            <span><i style="background: #2f8f83" />办结</span>
            <span><i style="background: #b45309" />超期</span>
          </div>
        </header>
        <div class="chart-body">
          <ChartSlot :empty="monthly.every((m) => !m.count && !m.completedCount && !m.overdueCount)">
            <TrendChart :labels="trendLabels" :series="trendSeries" />
          </ChartSlot>
        </div>
      </article>

      <article class="card" style="--d: 175ms">
        <header class="card-head"><h2>信访件与问题线索</h2></header>
        <div class="body"><ChartSlot :empty="emptyOf(kindItems)"><DonutChart :items="kindItems" center-label="总量" /></ChartSlot></div>
      </article>

      <article class="card gauge-card" style="--d: 315ms">
        <header class="card-head"><h2>办结情况</h2></header>
        <div class="body"><GaugeChart :value="overview.completionRate" label="整体办结率" /></div>
        <p class="gauge-foot">
          <span>线索超期 <b class="danger">{{ overview.overdue }}</b> 件</span>
          <span>线索超期率 <b>{{ overview.overdueRate }}%</b></span>
        </p>
      </article>

      <article class="card span2" style="--d: 350ms">
        <header class="card-head">
          <h2>办理状态分布</h2>
          <span class="card-note">全部记录 · 已办结优先</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(statusItems)"><StackedBar :items="statusItems" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 210ms">
        <header class="card-head">
          <h2>线索来源</h2>
          <span class="card-note">按问题线索</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(sourceItems)"><DonutChart :items="sourceItems" center-label="线索" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 245ms">
        <header class="card-head">
          <h2>处置形态</h2>
          <span class="card-note">按问题线索</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(disposeItems)"><BarList :items="disposeItems" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 280ms">
        <header class="card-head">
          <h2>承办部室</h2>
          <span class="card-note">按问题线索</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(deptItems)"><BarList :items="deptItems" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 385ms">
        <header class="card-head">
          <h2>被反映对象构成</h2>
          <span class="card-note">按人</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(targetItems)"><DonutChart :items="targetItems" center-label="人次" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 420ms">
        <header class="card-head">
          <h2>办理时长分布</h2>
          <span class="card-note">已办结</span>
        </header>
        <div class="chart-body short">
          <ChartSlot :empty="emptyOf(durationItems)"><ColumnChart :items="durationItems" /></ChartSlot>
        </div>
      </article>

      <article class="card" style="--d: 455ms">
        <header class="card-head">
          <h2>主办人办案量</h2>
          <span class="card-note">按件数</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(handlerItems)"><BarList :items="handlerItems" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 490ms">
        <header class="card-head">
          <h2>信访转线索漏斗</h2>
          <span class="card-note">转化率</span>
        </header>
        <div class="body"><ChartSlot :empty="emptyOf(extra.funnel)"><FunnelChart :items="extra.funnel" /></ChartSlot></div>
      </article>

      <article class="card span2" style="--d: 525ms">
        <header class="card-head">
          <h2>线索来源 × 处置形态</h2>
          <span class="card-note">交叉分布</span>
        </header>
        <div class="body"><ChartSlot :empty="extra.matrix.sources.length === 0 || extra.matrix.values.flat().every((v) => !v)"><MatrixHeat :sources="extra.matrix.sources" :forms="extra.matrix.forms" :values="extra.matrix.values" /></ChartSlot></div>
      </article>

      <article class="card span2" style="--d: 560ms">
        <header class="card-head">
          <h2>接收量日历热力</h2>
          <span class="card-note">近 12 个月 · 每日件数</span>
        </header>
        <div class="body"><ChartSlot :empty="extra.heatmap.length === 0 || extra.heatmap.every((m) => m.days.every((d) => !d))"><CalendarHeat :months="extra.heatmap" /></ChartSlot></div>
      </article>

      <article class="card" style="--d: 595ms">
        <header class="card-head">
          <h2>月度办结率</h2>
          <span class="card-note">%</span>
        </header>
        <div class="chart-body short">
          <ChartSlot :empty="extra.monthlyRate.every((m) => !m.count)">
            <TrendChart :labels="rateLabels" :series="rateSeries" />
          </ChartSlot>
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
import GaugeChart from '../components/charts/GaugeChart.vue'
import ColumnChart from '../components/charts/ColumnChart.vue'
import StackedBar from '../components/charts/StackedBar.vue'
import FunnelChart from '../components/charts/FunnelChart.vue'
import MatrixHeat from '../components/charts/MatrixHeat.vue'
import CalendarHeat from '../components/charts/CalendarHeat.vue'

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

type Extra = {
  statusMix: Array<{ name: string; value: number }>
  durationBuckets: Array<{ name: string; value: number }>
  handlers: Array<{ name: string; value: number }>
  heatmap: Array<{ month: string; days: number[] }>
  targetMix: Array<{ name: string; value: number }>
  funnel: Array<{ name: string; value: number }>
  matrix: { sources: string[]; forms: string[]; values: number[][] }
  monthlyRate: Array<{ month: string; rate: number; count: number }>
}
const updatedAt = ref('—')
const extra = ref<Extra>({
  statusMix: [],
  durationBuckets: [],
  handlers: [],
  heatmap: [],
  targetMix: [],
  funnel: [],
  matrix: { sources: [], forms: [], values: [] },
  monthlyRate: []
})

const shown = reactive<Record<string, number>>({})
let raf = 0

/** 面板空态判定：没有条目或全为 0 都算「没数据」，避免画出空框 */
function emptyOf(items?: Array<{ value?: number }> | null): boolean {
  if (!items || items.length === 0) return true
  return items.every((item) => !item.value)
}

const kpis = computed(() => [
  { key: 'xsTotal', label: '问题线索', value: overview.value.xsTotal, note: '线索总数' },
  { key: 'xfTotal', label: '信访件', value: overview.value.xfTotal, note: '信访总数' },
  { key: 'processing', label: '未办结', value: overview.value.processing, note: '线索进行中' },
  { key: 'completed', label: '已办结', value: overview.value.completed, note: '已完成办理' },
  { key: 'overdue', label: '已超期', value: overview.value.overdue, note: `超期率 ${overview.value.overdueRate}%`, alert: true },
  { key: 'completionRate', label: '办结率', value: overview.value.completionRate, note: '整体完成率', suffix: '%' },
  { key: 'unconverted', label: '待转线索', value: overview.value.unconverted, note: '信访件未转化' }
])

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
const durationItems = computed(() =>
  extra.value.durationBuckets.map((b, i) => ({ ...b, color: PALETTE[i % PALETTE.length] }))
)
const handlerItems = computed(() =>
  extra.value.handlers.map((h, i) => ({ ...h, color: PALETTE[(i + 2) % PALETTE.length] }))
)
const targetItems = computed(() =>
  extra.value.targetMix.map((t, i) => ({ name: t.name, value: t.value, color: PALETTE[i === 0 ? 0 : 3] }))
)
const rateLabels = computed(() => extra.value.monthlyRate.map((m) => m.month.replace('年', '/').replace('月', '')))
const rateSeries = computed(() => [
  { name: '办结率', color: '#2f8f83', values: extra.value.monthlyRate.map((m) => m.rate) }
])

const sourceItems = computed(() => topN(clueSources.value, 5))
const disposeItems = computed(() => topN(disposeForms.value, 4))
const deptItems = computed(() => topN(depts.value, 4))

function animateNumbers(): void {
  cancelAnimationFrame(raf)
  const targets = kpis.value.map((k) => ({ key: k.key, value: Number(k.value) || 0 }))
  targets.forEach((t) => {
    if (shown[t.key] === undefined) shown[t.key] = 0
  })
  // 窗口被遮挡 / 最小化时 rAF 会被浏览器节流到不触发，数字会一直停在 0；此时直接落最终值
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
      const from = shown[item.key] ?? 0
      shown[item.key] = item.key === 'completionRate'
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
  const res = await window.api.exports.stats()
  if (res?.ok) ElMessage.success(`已导出：${res.data}`)
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
  gap: 1.125rem;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
  animation: rise 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.kpi {
  display: grid;
  gap: 0.25rem;
  padding: 0.875rem 0.9375rem 0.9375rem;
  background: var(--surface);
  animation: rise 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) var(--d, 0ms) both;
}
.kpi-label {
  font-size: 0.75rem;
  color: var(--ink-3);
}
.kpi-value {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.kpi-value em {
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 600;
  margin-left: 0.0625rem;
}
.kpi-note {
  font-size: 0.6875rem;
  color: var(--ink-3);
}
.kpi.alert .kpi-value {
  color: #b45309;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.125rem;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1rem 1.125rem 1.125rem;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  min-width: 0;
  height: 100%;
  animation: rise 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) var(--d, 0ms) both;
}
.span2 {
  grid-column: span 2;
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
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink);
}
.card-note {
  font-size: 0.6875rem;
  color: var(--ink-3);
}
.legend {
  display: flex;
  gap: 0.75rem;
  font-size: 0.6875rem;
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
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 10.5rem;
}
.chart-body {
  flex: 1;
  min-height: 15rem;
}
.chart-body.short {
  min-height: 11rem;
}
.gauge-card .body {
  min-height: 9.5rem;
}
.gauge-foot {
  display: flex;
  justify-content: space-between;
  margin: 0;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--rule);
  font-size: 0.75rem;
  color: var(--ink-3);
}
.gauge-foot b {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.gauge-foot .danger {
  color: var(--signal, #b45309);
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
  /* 7 个 KPI 在 3 列下会剩 1 个孤格：让最后一项占满整行，不留空洞 */
  .kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .kpi:last-child:nth-child(3n + 1) {
    grid-column: 1 / -1;
  }
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .span2 {
    grid-column: span 2;
  }
}
@media (max-width: 64rem) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .kpi:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .span2 {
    grid-column: span 1;
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
