<template>
  <div class="stack">
    <div class="bar">
      <span
        v-for="(seg, i) in items"
        :key="seg.name"
        class="seg"
        :style="{ width: `${pct(seg.value)}%`, background: seg.color, animationDelay: `${i * 90}ms` }"
        :title="`${seg.name}：${seg.value}`"
      >
        <span v-if="pct(seg.value) > 8" class="seg-label">{{ seg.value }}</span>
      </span>
    </div>
    <ul class="legend">
      <li v-for="seg in items" :key="seg.name">
        <i :style="{ background: seg.color }" />
        <span>{{ seg.name }}</span>
        <b>{{ seg.value }}</b>
        <em>{{ pct(seg.value).toFixed(1) }}%</em>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ items: Array<{ name: string; value: number; color: string }> }>()
const total = computed(() => props.items.reduce((s, i) => s + i.value, 0) || 1)

function pct(v: number): number {
  return (v / total.value) * 100
}
</script>

<style scoped>
.stack {
  display: grid;
  gap: 0.875rem;
}
.bar {
  display: flex;
  height: 2.25rem;
  border-radius: 0.5rem;
  overflow: hidden;
  background: var(--page);
}
.seg {
  display: flex;
  align-items: center;
  justify-content: center;
  animation: grow 0.9s cubic-bezier(0.22, 0.61, 0.36, 1) both;
  transition: filter 0.2s ease;
}
.seg:hover {
  filter: brightness(1.08);
}
.seg-label {
  font-size: 0.6875rem;
  color: #fff;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
@keyframes grow {
  from {
    width: 0;
  }
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem 0.875rem;
  font-size: 0.75rem;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--ink-2);
}
.legend i {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 2px;
}
.legend b {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.legend em {
  margin-left: auto;
  font-style: normal;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .seg {
    animation: none;
  }
}
</style>
