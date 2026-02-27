<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ icon: string; title: string; desc: string; status?: string; multiple?: boolean }>()
const emit = defineEmits<{ files: [FileList] }>()
const dragover = ref(false)
const fileInput = ref<HTMLInputElement>()
function onDrop(e: DragEvent) { e.preventDefault(); dragover.value = false; if (e.dataTransfer?.files.length) emit('files', e.dataTransfer.files) }
function onClick() { fileInput.value?.click() }
function onFileChange() { if (fileInput.value?.files?.length) emit('files', fileInput.value.files) }
</script>
<template>
  <div class="drop" :class="{ dragover }" @click="onClick" @dragover.prevent="dragover = true" @dragleave="dragover = false" @drop="onDrop">
    <div class="ic">{{ icon }}</div>
    <div><b>{{ title }}</b></div>
    <div class="desc">{{ desc }}</div>
    <div v-if="status" class="st" v-html="status" />
    <input ref="fileInput" type="file" accept=".txt" :multiple="multiple" style="display:none" @change="onFileChange" />
  </div>
</template>
<style scoped>
.drop { border: 2px dashed var(--border); border-radius: 12px; padding: 24px; text-align: center; color: var(--text2); cursor: pointer; transition: all 0.2s; }
.drop:hover, .drop.dragover { border-color: var(--accent); background: var(--bg3); }
.ic { font-size: 36px; margin-bottom: 8px; }
.desc { font-size: 12px; }
.st { margin-top: 8px; }
</style>
