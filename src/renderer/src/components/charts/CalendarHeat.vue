<template>
  <div class="cal">
    <div v-for="(m, mi) in months" :key="m.month" class="cal-row">
      <span class="cal-label">{{ m.month.replace('年', '/').replace('月', '') }}</span>
      <span class="cal-days">
        <i
          v-for="(v, di) in m.days"
          :key="di"
          :style="{ background: color(v), animationDelay: `${mi * 14 + di * 3}ms` }"
          :title="`${m.month} ${di + 1} 日：${v} 件`"
        />
      </span>
      <span class="cal-total">{{ sum(m.days) }}</span>
    </div>
    <p class="cal-scale">
      <span>少</span>
      <i v-for="n in 5" :key="n" :style="{ background: color((max / 5) * n) }" />
      <span>多</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ months: Array<{ month: string; days: number[] }> }>()
const max = computed(() => Math.max(1, ...props.months.flatMap((m) => m.days)))
const sum = (days: number[]): number => days.reduce((s, v) => s + v, 0)

function color(v: number): string {
  if (!v) return 'var(--page)'
  const t = v / max.value
  return `rgba(47, 143, 131, ${(0.2 + t * 0.7).toFixed(2)})`
}
</script>

<style scoped>
.cal {
  display: grid;
  gap: 0.1875rem;
  font-size: 0.6875rem;
  color: var(--ink-3);
}
.cal-row {
  display: grid;
  grid-template-columns: 2.75rem 1fr 1.5rem;
  gap: 0.5rem;
  align-items: center;
}
.cal-days {
  display: flex;
  gap: 2px;
}
.cal-days i {
  flex: 1;
  height: 0.6875rem;
  border-radius: 1.5px;
  animation: fadeIn 0.4s ease both;
}
.cal-total {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ink-2);
}
.cal-scale {
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  margin: 0.25rem 0 0;
  justify-content: flex-end;
}
.cal-scale i {
  width: 0.625rem;
  height: 0.375rem;
  border-radius: 2px;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cal-days i {
    animation: none;
  }
}
</style>
