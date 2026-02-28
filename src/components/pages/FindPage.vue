<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useEngine } from '../../composables/useEngine'
const { engine, selectChar, searchChar, clearSearchChar } = useEngine()
const input = ref(''); const mode = ref('d'); const results = ref<string[]>([]); const loading = ref(false); const comp = ref('')
function run() {
  const c = [...input.value.trim()][0]; if (!c) return; comp.value = c; loading.value = true
  setTimeout(() => { results.value = mode.value === 'r' ? engine.findCharsDeep(c) : engine.findCharsWith(c); loading.value = false }, 50)
}

// 页面加载时检查是否有传递过来的查询字
onMounted(() => {
  if (searchChar.value) {
    input.value = searchChar.value
    run()
    clearSearchChar()
  }
})
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
      <div v-if="loading" class="loading-state">
        <div class="spinner" />
        <span>搜索中...</span>
      </div>
      <template v-if="results.length > 0 && !loading">
        <p class="result-info">
          包含 <b class="highlight">{{ comp }}</b> ({{ results.length }}个)
        </p>
        <template v-if="grouped">
          <div v-for="g in grouped" :key="g.name" class="result-group">
            <div class="group-header">
              <span class="tag tag-primary">{{ g.name }}</span>
              <span class="group-count">({{ g.chars.length }})</span>
            </div>
            <div class="char-list">
              <span v-for="ch in g.chars" :key="ch" class="char-item" @click="selectChar(ch)">{{ ch }}</span>
            </div>
          </div>
        </template>
        <div v-else class="char-list">
          <span v-for="ch in results.slice(0, 200)" :key="ch" class="char-item" @click="selectChar(ch)">{{ ch }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.loading-state {
  text-align: center;
  padding: 40px;
  color: var(--text2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.result-info {
  color: var(--text2);
  margin-bottom: 12px;
  font-size: 14px;
}
.result-info .highlight {
  color: var(--primary);
  font-size: 16px;
}
.result-group {
  margin-bottom: 16px;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.group-count {
  color: var(--text2);
  font-size: 12px;
}
.char-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.char-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.char-item:hover {
  border-color: var(--primary);
  background: var(--primary-bg);
}
</style>