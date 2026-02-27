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
    <div class="big">{{ char }}</div>
    <div class="decomp">{{ info.leaves.join(' + ') }}</div>
    <div class="struct">{{ info.ids }}</div>
    <div class="meta">{{ info.sc }}画 <span v-if="info.isRoot" class="tag tag-green">字根</span></div>
  </div>
</template>
<style scoped>
.card { display: inline-flex; flex-direction: column; align-items: center; background: var(--bg3); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; margin: 4px; min-width: 180px; cursor: pointer; transition: all 0.2s; }
.card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 4px 20px rgba(79,195,247,0.15); }
.big { font-size: 42px; line-height: 1.2; margin-bottom: 6px; }
.decomp { font-size: 14px; color: var(--accent); margin-bottom: 4px; }
.struct { font-size: 12px; color: var(--text2); font-family: monospace; }
.meta { font-size: 11px; color: var(--text2); margin-top: 4px; }
</style>
