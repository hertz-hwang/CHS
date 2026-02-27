<script setup lang="ts">
import { computed } from 'vue'
import { useEngine } from '../../composables/useEngine'
const { engine } = useEngine()
const groups = computed(() => {
  const bySC = new Map<number, string[]>()
  for (const r of [...engine.roots].sort()) { const sc = engine.strokeCount(r); if (!bySC.has(sc)) bySC.set(sc, []); bySC.get(sc)!.push(r) }
  return [...bySC.entries()].sort(([a], [b]) => a - b)
})
</script>
<template>
  <div class="panel">
    <div class="panel-head">👁️ 查看字根 <span style="margin-left:auto;font-size:12px;color:var(--text2);font-weight:400">{{ engine.roots.size }} 个</span></div>
    <div class="panel-body">
      <p v-if="engine.roots.size === 0" style="color:var(--text2)">暂无字根</p>
      <div v-for="[sc, roots] in groups" :key="sc" style="margin-bottom:8px">
        <span style="font-size:12px;color:var(--text2);margin-right:8px">[{{ sc ? sc + '画' : '未知' }}]</span>
        <span style="font-size:16px;letter-spacing:2px">{{ roots.join('') }}</span>
      </div>
    </div>
  </div>
</template>
