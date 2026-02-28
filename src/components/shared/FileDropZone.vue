<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ icon: string; title: string; desc: string; status?: string; multiple?: boolean; accept?: string }>()
const emit = defineEmits<{ files: [FileList] }>()
const dragover = ref(false)
const fileInput = ref<HTMLInputElement>()
function onDrop(e: DragEvent) { e.preventDefault(); dragover.value = false; if (e.dataTransfer?.files.length) emit('files', e.dataTransfer.files) }
function onClick() { fileInput.value?.click() }
function onFileChange() { if (fileInput.value?.files?.length) emit('files', fileInput.value.files) }
</script>
<template>
  <div class="drop-zone" :class="{ dragover }" @click="onClick" @dragover.prevent="dragover = true" @dragleave="dragover = false" @drop="onDrop">
    <div class="icon">{{ icon }}</div>
    <div class="title">{{ title }}</div>
    <div class="desc">{{ desc }}</div>
    <div v-if="status" class="status" v-html="status" />
    <input ref="fileInput" type="file" :accept="accept || '.txt'" :multiple="multiple" style="display:none" @change="onFileChange" />
  </div>
</template>
<style scoped>
.drop-zone {
  border: 2px dashed var(--border);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  color: var(--text2);
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg2);
}
.drop-zone:hover,
.drop-zone.dragover {
  border-color: var(--primary);
  background: var(--primary-bg);
}
.icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.title {
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.desc {
  font-size: 12px;
}
.status {
  margin-top: 10px;
}
</style>