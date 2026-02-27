<script setup lang="ts">
import { computed } from 'vue'
import { useEngine } from '../../composables/useEngine'
const props = defineProps<{ char: string }>()
const { engine, selectChar } = useEngine()
const info = computed(() => {
  const { leaves, ids } = engine.decompose(props.char)
  return { leaves, ids, sc: engine.strokeCount(props.char), isRoot: engine.roots.has(props.char) }
})
</script>
<template>
  <div class="card" @click="selectChar(char)">
    <div class="char">{{ char }}</div>
    <div class="decomp">{{ info.leaves.join(' + ') }}</div>
    <div class="struct">{{ info.ids }}</div>
    <div class="meta">
      {{ info.sc }}画
      <span v-if="info.isRoot" class="tag tag-success">字根</span>
    </div>
  </div>
</template>
<style scoped>
.card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  margin: 4px;
  min-width: 160px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow2);
}
.char {
  font-size: 40px;
  line-height: 1.2;
  margin-bottom: 8px;
  color: var(--text);
}
.decomp {
  font-size: 14px;
  color: var(--primary);
  margin-bottom: 4px;
  font-weight: 500;
}
.struct {
  font-size: 12px;
  color: var(--text2);
  font-family: monospace;
}
.meta {
  font-size: 11px;
  color: var(--text2);
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>