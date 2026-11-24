<template>
  <ul class="bars">
    <li v-for="(item, i) in items" :key="item.name" :style="{ '--d': `${i * 70}ms` }">
      <span class="b-name" :title="item.name">{{ item.name }}</span>
      <span class="b-track">
        <span class="b-fill" :style="{ width: `0%`, '--w': `${width(item.value)}%`, background: item.color }" />
      </span>
      <span class="b-num">{{ item.value }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ items: Array<{ name: string; value: number; color: string }> }>()
const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)))

function width(v: number): number {
  return Math.max(3, Math.round((v / max.value) * 100))
}
</script>

<style scoped>
.bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.bars li {
  display: grid;
  grid-template-columns: 6.5rem 1fr 2rem;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--ink-2);
}
.b-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.b-track {
  height: 0.5rem;
  border-radius: 999px;
  background: var(--page);
  overflow: hidden;
}
.b-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  animation: grow 0.85s cubic-bezier(0.22, 0.61, 0.36, 1) var(--d, 0ms) forwards;
}
@keyframes grow {
  from {
    width: 0;
  }
  to {
    width: var(--w);
  }
}
.b-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .b-fill {
    animation: none;
    width: var(--w);
  }
}
</style>
