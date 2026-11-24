<template>
  <ol class="funnel">
    <li v-for="(item, i) in items" :key="item.name" :style="{ '--w': width(i), '--d': `${i * 110}ms` }">
      <span class="fn-name">{{ item.name }}</span>
      <span class="fn-bar"><span class="fn-fill" :style="{ background: colors[i % colors.length] }" /></span>
      <span class="fn-num">{{ item.value }}</span>
      <span class="fn-drop" v-if="i > 0">{{ drop(i) }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ items: Array<{ name: string; value: number }> }>()
const colors = ['#1f6fb2', '#3b82c4', '#5f9acb', '#8fb8d8']
const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)))

function width(i: number): string {
  return `${Math.max(12, Math.round((props.items[i].value / max.value) * 100))}%`
}
function drop(i: number): string {
  const prev = props.items[i - 1].value || 0
  const cur = props.items[i].value
  const rate = prev ? Math.round((cur / prev) * 100) : 0
  return `${rate}%`
}
</script>

<style scoped>
.funnel {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.funnel li {
  display: grid;
  grid-template-columns: 4.5rem 1fr 2rem 2.5rem;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--ink-2);
}
.fn-bar {
  height: 1.5rem;
  background: var(--page);
  border-radius: 0.375rem;
  overflow: hidden;
}
.fn-fill {
  display: block;
  height: 100%;
  width: 0;
  border-radius: 0.375rem;
  animation: fill 0.85s cubic-bezier(0.22, 0.61, 0.36, 1) var(--d, 0ms) forwards;
}
@keyframes fill {
  to {
    width: var(--w);
  }
}
.fn-num {
  text-align: right;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.fn-drop {
  text-align: right;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  .fn-fill {
    animation: none;
    width: var(--w);
  }
}
</style>
