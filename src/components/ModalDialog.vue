<script setup lang="ts">
defineProps<{ visible: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>
<template>
  <Teleport to="body">
    <div class="overlay" :class="{ show: visible }" @click.self="emit('close')">
      <div class="modal">
        <h2>{{ title }}</h2>
        <slot />
        <div class="actions"><slot name="actions" /></div>
      </div>
    </div>
  </Teleport>
</template>
<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.overlay.show {
  opacity: 1;
  pointer-events: auto;
}
.modal {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow2);
}
.modal h2 {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  justify-content: flex-end;
}
</style>