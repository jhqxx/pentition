<template>
  <div class="gauge">
    <svg :viewBox="`0 0 ${W} ${H}`" class="gauge-svg">
      <path :d="arc" fill="none" stroke="var(--rule)" :stroke-width="SW" stroke-linecap="round" />
      <path
        :d="arc"
        fill="none"
        :stroke="color"
        :stroke-width="SW"
        stroke-linecap="round"
        class="value"
        :stroke-dasharray="`${len} 999`"
      />
    </svg>
    <div class="gauge-center">
      <strong>{{ pct }}</strong>
      <span>{{ label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ value: number; label?: string; color?: string }>(),
  { label: '办结率', color: 'var(--harbor)' }
)

const W = 200
const H = 118
const SW = 16
const R = 76
const CX = 100
const CY = 100

const arc = computed(() => {
  const a0 = Math.PI
  const a1 = 0
  const x0 = CX + R * Math.cos(a0)
  const y0 = CY - R * Math.sin(a0)
  const x1 = CX + R * Math.cos(a1)
  const y1 = CY - R * Math.sin(a1)
  return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`
})

const len = computed(() => (Math.PI * R * Math.min(100, Math.max(0, props.value))) / 100)
const pct = ref('0.0%')

function run(target: number): void {
  const start = performance.now()
  const dur = 900
  const tick = (t: number): void => {
    const p = Math.min(1, (t - start) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    pct.value = `${(target * eased).toFixed(1)}%`
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

onMounted(() => run(props.value))
watch(() => props.value, (v) => run(v))
</script>

<style scoped>
.gauge {
  position: relative;
  display: flex;
  justify-content: center;
}
.gauge-svg {
  width: 100%;
  max-width: 12.5rem;
}
.value {
  transition: stroke-dasharray 0.9s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.gauge-center {
  position: absolute;
  bottom: 0.25rem;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
}
.gauge-center strong {
  display: block;
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.gauge-center span {
  font-size: 0.6875rem;
  color: var(--ink-3);
}
@media (prefers-reduced-motion: reduce) {
  .value {
    transition: none;
  }
}
</style>
