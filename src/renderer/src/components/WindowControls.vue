<template>
  <div class="wc-group">
    <button class="wc" aria-label="最小化" title="最小化" @click="minimize">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M1 5h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
    </button>
    <button class="wc" aria-label="最大化" title="最大化" @click="toggleMaximize">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect
          x="1.4"
          y="1.4"
          width="7.2"
          height="7.2"
          rx="0.8"
          fill="none"
          stroke="currentColor"
          stroke-width="1.1"
        />
      </svg>
    </button>
    <button class="wc close" aria-label="关闭" title="关闭" @click="close">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path
          d="M1.7 1.7l6.6 6.6M8.3 1.7l-6.6 6.6"
          stroke="currentColor"
          stroke-width="1.3"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
function minimize(): void {
  void window.api.win.minimize()
}
function toggleMaximize(): void {
  void window.api.win.toggleMaximize()
}
function close(): void {
  void window.api.win.close()
}
</script>

<style scoped>
.wc-group {
  display: flex;
  gap: 3px;
  -webkit-app-region: no-drag;
}
.wc {
  width: 28px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0.82;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}
.wc:hover {
  background: var(--wc-hover, rgba(0, 0, 0, 0.07));
  opacity: 1;
}
.wc.close:hover {
  background: #b4433a;
  color: #fff;
}
</style>
