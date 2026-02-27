<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEngine } from '../../composables/useEngine'
const { engine, selectChar } = useEngine()
const input = ref(''); const mode = ref('d'); const results = ref<string[]>([]); const loading = ref(false); const comp = ref('')
function run() {
  const c = [...input.value.trim()][0]; if (!c) return; comp.value = c; loading.value = true
  setTimeout(() => { results.value = mode.value === 'r' ? engine.findCharsDeep(c) : engine.findCharsWith(c); loading.value = false }, 50)
}
const grouped = computed(() => {
  if (!engine.charsets.size) return null
  const groups: { name: string; chars: string[] }[] = []; const shown = new Set<string>()
  for (const [name, cs] of engine.charsets) {
    const csSet = new Set(cs); const matched = results.value.filter(c => csSet.has(c))
    if (matched.length) { groups.push({ name, chars: matched.slice(0, 120) }); matched.forEach(c => shown.add(c)) }
  }
  const rest = results.value.filter(c => !shown.has(c))
  if (rest.length) groups.push({ name: '其他', chars: rest.slice(0, 60) })
  return groups
})
</script>
<template>
  <div class="panel">
    <div class="panel-head">🔎 部件检索</div>
    <div class="panel-body">
      <div class="input-row">
        <input v-model="input" type="text" placeholder="输入部件..." maxlength="2" @keydown.enter="run" />
        <select v-model="mode"><option value="d">直接包含</option><option value="r">递归包含</option></select>
        <button class="btn" @click="run">检索</button>
      </div>
      <div v-if="loading" style="text-align:center;padding:40px;color:var(--text2)"><div class="spinner" />搜索中...</div>
      <template v-if="results.length > 0 && !loading">
        <p style="color:var(--text2);margin-bottom:8px">包含 <b style="color:var(--accent)">{{ comp }}</b> ({{ results.length }}个)</p>
        <template v-if="grouped">
          <div v-for="g in grouped" :key="g.name" style="margin-bottom:8px">
            <span class="tag tag-blue">{{ g.name }}</span> <span style="color:var(--text2);font-size:12px">({{ g.chars.length }})</span>
            <div class="fr"><span v-for="ch in g.chars" :key="ch" class="fc" @click="selectChar(ch)">{{ ch }}</span></div>
          </div>
        </template>
        <div v-else class="fr"><span v-for="ch in results.slice(0, 200)" :key="ch" class="fc" @click="selectChar(ch)">{{ ch }}</span></div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.fr { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.fc { display: inline-block; padding: 4px 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; font-size: 18px; cursor: pointer; transition: all 0.15s; }
.fc:hover { border-color: var(--accent); transform: scale(1.1); }
</style>
