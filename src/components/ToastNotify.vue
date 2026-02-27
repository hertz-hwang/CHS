<script setup lang="ts">
import { useEngine } from '../composables/useEngine'
const { toastMsg, toastVisible } = useEngine()
</script>
<template>
  <div class="toast" :class="{ show: toastVisible }">{{ toastMsg }}</div>
</template>
<style scoped>
.toast {
  position: fixed; bottom: 20px; right: 20px; background: var(--bg3);
  border: 1px solid var(--border); border-radius: 8px; padding: 12px 20px;
  color: var(--text); font-size: 14px; z-index: 1000;
  transform: translateY(100px); opacity: 0; transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
}
.toast.show { transform: translateY(0); opacity: 1; }
</style>
