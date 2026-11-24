<template>
  <div class="matrix">
    <div class="mx-head">
      <span class="mx-corner" />
      <span v-for="f in forms" :key="f" class="mx-col">{{ f }}</span>
    </div>
    <div v-for="(row, ri) in values" :key="sources[ri]" class="mx-row">
      <span class="mx-row-label" :title="sources[ri]">{{ sources[ri] }}</span>
      <span
        v-for="(v, ci) in row"
        :key="ci"
        class="mx-cell"
        :style="{ background: color(v), animationDelay: `${(ri * forms.length + ci) * 40}ms` }"
        :title="`${sources[ri]} · ${forms[ci]}：${v}`"
      >
        <span v-if="v > 0">{{ v }}</span>
      </span>
    </div>
    <p class="mx-scale">
      <span>少</span>
      <i v-for="n in 5" :key="n" :style="{ background: color((max / 5) * n) }" />
      <span>多</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ sources: string[]; forms: string[]; values: number[][] }>()

const max = computed(() => Math.max(1, ...props.values.flat()))

function color(v: number): string {
  if (!v) return 'var(--page)'
  const t = v / max.value
  const alpha = 0.18 + t * 0.72
  return `rgba(31, 111, 178, ${alpha.toFixed(2)})`
}
</script>

<style scoped>
.matrix {
  display: grid;
  gap: 0.25rem;
  font-size: 0.6875rem;
  color: var(--ink-2);
}
.mx-head,
.mx-row {
  display: grid;
  grid-template-columns: 5.5rem repeat(4, minmax(0, 1fr));
  gap: 0.25rem;
  align-items: center;
}
.mx-col,
.mx-corner {
  text-align: center;
  color: var(--ink-3);
}
.mx-row-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-2);
}
.mx-cell {
  height: 1.625rem;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  animation: fadeIn 0.5s ease both;
  transition: outline 0.15s ease;
}
.mx-cell:hover {
  outline: 2px solid var(--harbor);
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}
.mx-scale {
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  margin: 0.25rem 0 0;
  color: var(--ink-3);
}
.mx-scale i {
  width: 0.625rem;
  height: 0.375rem;
  border-radius: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .mx-cell {
    animation: none;
  }
}
</style>
