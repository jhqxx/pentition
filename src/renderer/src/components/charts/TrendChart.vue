<template>
  <div ref="wrap" class="trend" @mousemove="onMove" @mouseleave="hover = -1">
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="trend-svg">
      <defs>
        <linearGradient v-for="s in series" :key="s.name" :id="`grad-${uid}-${s.name}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="s.color" stop-opacity=".28" />
          <stop offset="100%" :stop-color="s.color" stop-opacity="0" />
        </linearGradient>
      </defs>

      <g class="grid">
        <line v-for="(g, i) in gridLines" :key="i" :x1="PAD.l" :x2="W - PAD.r" :y1="g.y" :y2="g.y" />
        <text v-for="(g, i) in gridLines" :key="`t${i}`" :x="PAD.l - 10" :y="g.y + 4" class="axis-y">{{ g.label }}</text>
      </g>

      <g v-for="(s, si) in series" :key="s.name">
        <path :d="areaPath(s.values)" :fill="`url(#grad-${uid}-${s.name})`" class="area" :style="{ animationDelay: `${si * 120 + 120}ms` }" />
        <path
          :d="linePath(s.values)"
          fill="none"
          :stroke="s.color"
          stroke-width="2.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          class="line"
          :class="{ drawn }"
          :style="{ transitionDelay: `${si * 140}ms` }"
        />
        <circle
          v-for="(p, pi) in points(s.values)"
          :key="pi"
          :cx="p.x"
          :cy="p.y"
          r="3.5"
          :fill="s.color"
          class="dot"
          :class="{ on: hover === pi }"
        />
      </g>

      <line v-if="hover >= 0" :x1="xAt(hover)" :x2="xAt(hover)" :y1="PAD.t" :y2="H - PAD.b" class="guide" />

      <g class="axis-x">
        <text v-for="(l, i) in labels" :key="l" :x="xAt(i)" :y="H - 8">{{ i % 2 === 0 ? l : '' }}</text>
      </g>
    </svg>

    <div v-if="hover >= 0" class="tip" :style="{ left: `${(xAt(hover) / W) * 100}%` }">
      <p class="tip-title">{{ labels[hover] }}</p>
      <p v-for="s in series" :key="s.name" class="tip-row">
        <i :style="{ background: s.color }" />
        <span>{{ s.name }}</span>
        <b>{{ s.values[hover] }}</b>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{
  labels: string[]
  series: Array<{ name: string; color: string; values: number[] }>
}>()

const W = 760
const H = 260
const PAD = { l: 38, r: 16, t: 18, b: 26 }
const uid = Math.random().toString(36).slice(2, 8)
const wrap = ref<HTMLElement | null>(null)
const hover = ref(-1)
const drawn = ref(false)

const max = computed(() => Math.max(4, ...props.series.flatMap((s) => s.values)))
const niceMax = computed(() => Math.ceil(max.value / 4) * 4)

const xAt = (i: number): number =>
  PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, props.labels.length - 1)
const yAt = (v: number): number => PAD.t + (1 - v / niceMax.value) * (H - PAD.t - PAD.b)

const gridLines = computed(() =>
  [0, 1, 2, 3, 4].map((i) => ({ y: yAt((niceMax.value / 4) * i), label: String((niceMax.value / 4) * i) }))
)

function points(values: number[]): Array<{ x: number; y: number }> {
  return values.map((v, i) => ({ x: xAt(i), y: yAt(v) }))
}

function linePath(values: number[]): string {
  return points(values)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

function areaPath(values: number[]): string {
  const pts = points(values)
  if (!pts.length) return ''
  const base = H - PAD.b
  return `M${pts[0].x},${base} ${pts.map((p) => `L${p.x},${p.y}`).join(' ')} L${pts[pts.length - 1].x},${base} Z`
}

function onMove(e: MouseEvent): void {
  const el = wrap.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  const x = ratio * W
  const step = (W - PAD.l - PAD.r) / Math.max(1, props.labels.length - 1)
  hover.value = Math.min(props.labels.length - 1, Math.max(0, Math.round((x - PAD.l) / step)))
}

onMounted(() => {
  requestAnimationFrame(() => {
    drawn.value = true
  })
})
</script>

<style scoped>
.trend {
  position: relative;
  width: 100%;
  height: 100%;
}
.trend-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}
.grid line {
  stroke: var(--rule);
  stroke-width: 1;
  stroke-dasharray: 2 4;
}
.axis-y,
.axis-x text {
  fill: var(--ink-3);
  font-size: 9px;
  text-anchor: end;
}
.axis-x text {
  text-anchor: middle;
}
.line {
  stroke-dasharray: 2000;
  stroke-dashoffset: 2000;
  transition: stroke-dashoffset 1.15s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.line.drawn {
  stroke-dashoffset: 0;
}
.area {
  opacity: 0;
  animation: areaIn 0.9s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
}
@keyframes areaIn {
  to {
    opacity: 1;
  }
}
.dot {
  opacity: 0;
  transition: opacity 0.3s ease 0.8s, transform 0.2s ease;
  transform-box: fill-box;
  transform-origin: center;
}
.line.drawn ~ .dot,
.trend-svg:hover .dot {
  opacity: 0.9;
}
.dot.on {
  transform: scale(1.7);
  opacity: 1;
}
.guide {
  stroke: var(--harbor);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  opacity: 0.6;
}
.tip {
  position: absolute;
  top: 6px;
  transform: translateX(-50%);
  min-width: 7.5rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--rule);
  border-radius: var(--r-sm, 0.375rem);
  background: var(--surface);
  box-shadow: 0 0.5rem 1.25rem rgba(16, 22, 29, 0.12);
  pointer-events: none;
  font-size: 0.75rem;
  z-index: 4;
}
.tip-title {
  margin: 0 0 0.25rem;
  color: var(--ink-3);
  font-size: 0.6875rem;
}
.tip-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.1rem 0;
  color: var(--ink-2);
}
.tip-row i {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
}
.tip-row b {
  margin-left: auto;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .line {
    transition: none;
    stroke-dashoffset: 0;
  }
  .area {
    animation: none;
    opacity: 1;
  }
  .dot {
    opacity: 0.9;
  }
}
</style>
