<template>
  <div class="donut">
    <svg :viewBox="`0 0 ${S} ${S}`" class="donut-svg">
      <circle :cx="S / 2" :cy="S / 2" :r="R" fill="none" :stroke="track" :stroke-width="SW" />
      <circle
        v-for="(seg, i) in segments"
        :key="seg.name"
        :cx="S / 2"
        :cy="S / 2"
        :r="R"
        fill="none"
        :stroke="seg.color"
        :stroke-width="hover === i ? SW + 4 : SW"
        :stroke-dasharray="`${seg.len} ${CIRC - seg.len}`"
        :stroke-dashoffset="-seg.offset"
        :transform="`rotate(-90 ${S / 2} ${S / 2})`"
        class="seg"
        :class="{ dim: hover >= 0 && hover !== i }"
        @mouseenter="hover = i"
        @mouseleave="hover = -1"
      />
      <text :x="S / 2" :y="S / 2 - 4" class="center-value">
        {{ hover >= 0 ? segments[hover].value : total }}
      </text>
      <text :x="S / 2" :y="S / 2 + 14" class="center-label">
        {{ hover >= 0 ? segments[hover].name : centerLabel }}
      </text>
    </svg>

    <ul class="legend">
      <li
        v-for="(seg, i) in segments"
        :key="seg.name"
        :class="{ on: hover === i }"
        @mouseenter="hover = i"
        @mouseleave="hover = -1"
      >
        <i :style="{ background: seg.color }" />
        <span class="lg-name">{{ seg.name }}</span>
        <span class="lg-num">{{ seg.value }}</span>
        <span class="lg-pct">{{ seg.pct }}%</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    items: Array<{ name: string; value: number; color: string }>
    centerLabel?: string
    track?: string
  }>(),
  { centerLabel: '合计', track: 'var(--rule)' }
)

const S = 168
const SW = 18
const R = (S - SW) / 2 - 6
const CIRC = 2 * Math.PI * R
const hover = ref(-1)

const total = computed(() => props.items.reduce((s, i) => s + i.value, 0))
const gap = 2
const segments = computed(() => {
  let offset = 0
  return props.items
    .filter((i) => i.value > 0)
    .map((i) => {
      const len = total.value ? (i.value / total.value) * CIRC : 0
      const seg = {
        ...i,
        len: Math.max(0.6, len - gap),
        offset,
        pct: total.value ? Math.round((i.value / total.value) * 1000) / 10 : 0
      }
      offset += len
      return seg
    })
})
</script>

<style scoped>
.donut {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.donut-svg {
  width: 8.75rem;
  height: 8.75rem;
  flex: none;
  overflow: visible;
}
.seg {
  transition: stroke-width 0.2s ease, opacity 0.2s ease;
  cursor: pointer;
  animation: segmentIn 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.seg.dim {
  opacity: 0.35;
}
@keyframes segmentIn {
  from {
    stroke-dasharray: 0 999;
  }
}
.center-value {
  text-anchor: middle;
  font-size: 1.25rem;
  font-weight: 700;
  fill: var(--ink);
  font-variant-numeric: tabular-nums;
}
.center-label {
  text-anchor: middle;
  font-size: 0.625rem;
  fill: var(--ink-3);
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3125rem;
  min-width: 0;
  flex: 1;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--ink-2);
  cursor: default;
  transition: color 0.2s ease;
}
.legend li.on {
  color: var(--ink);
}
.legend i {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 2px;
  flex: none;
}
.lg-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lg-num {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  font-weight: 600;
}
.lg-pct {
  width: 2.5rem;
  text-align: right;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .seg {
    animation: none;
  }
}
</style>
