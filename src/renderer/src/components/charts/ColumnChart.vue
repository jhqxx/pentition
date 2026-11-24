<template>
  <div class="cols">
    <div v-for="(item, i) in items" :key="item.name" class="col" :title="`${item.name}：${item.value}`">
      <span class="col-value">{{ item.value }}</span>
      <span class="col-track">
        <span class="col-fill" :style="{ height: height(item.value), background: item.color, animationDelay: `${i * 80}ms` }" />
      </span>
      <span class="col-name">{{ item.name }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ items: Array<{ name: string; value: number; color: string }> }>()
const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)))

function height(v: number): string {
  return `${Math.max(2, Math.round((v / max.value) * 100))}%`
}
</script>

<style scoped>
.cols {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  height: 100%;
  min-height: 9rem;
}
.col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
  height: 100%;
  min-width: 0;
}
.col-value {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.col-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.col-fill {
  width: 62%;
  max-width: 2.25rem;
  border-radius: 4px 4px 2px 2px;
  animation: rise 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}
.col-name {
  font-size: 0.6875rem;
  color: var(--ink-3);
  white-space: nowrap;
}
@keyframes rise {
  from {
    height: 0;
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .col-fill {
    animation: none;
  }
}
</style>
