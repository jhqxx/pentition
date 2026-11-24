<template>
  <p v-if="empty" class="chart-empty">暂无数据</p>
  <slot v-else />
</template>

<script setup lang="ts">
/** 面板统一空态：没有数据时给一行灰字，而不是画一个空框 */
defineProps<{ empty: boolean }>()
</script>

<style scoped>
.chart-empty {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 6rem;
  font-size: 0.8125rem;
  color: var(--ink-3);
}
</style>
