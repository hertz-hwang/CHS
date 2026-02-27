<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEngine } from '../../composables/useEngine'
import type { CoverageResult } from '../../engine/engine'
const { engine, refreshStats, selectChar, toast } = useEngine()
const charsetName = ref(''); const result = ref<CoverageResult | null>(null); const loading = ref(false)
const opts = computed(() => {
  const o = [{ value: '', label: `全部 (${engine.decomp.size} 字)` }]
  for (const [name, chars] of engine.charsets) o.push({ value: name, label: `${name} (${chars.length} 字)` })
  return o
})
function run() {
  if (!engine.decomp.size) { toast('请先加载数据'); return }
  loading.value = true; setTimeout(() => { result.value = engine.coverage(charsetName.value || null); loading.value = false }, 50)
}
function addRoot(comp: string) { engine.addRoots(comp); refreshStats(); toast(`已添加: ${comp}`); run() }
</script>
<template>
  <div class="panel">
    <div class="panel-head">📊 覆盖率分析</div>
    <div class="panel-body">
      <div class="input-row">
        <select v-model="charsetName"><option v-for="o in opts" :key="o.value" :value="o.value">{{ o.label }}</option></select>
        <button class="btn" @click="run">分析</button>
      </div>
      <div v-if="loading" class="loading-state">
        <div class="spinner" />
        <span>分析中...</span>
      </div>
      <template v-if="result">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ result.total }}</div>
            <div class="stat-label">目标字集</div>
          </div>
          <div class="stat-card">
            <div class="stat-value success">{{ result.covered }}</div>
            <div class="stat-label">完全覆盖</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ (result.rate * 100).toFixed(1) }}%</div>
            <div class="stat-label">覆盖率</div>
          </div>
          <div class="stat-card">
            <div class="stat-value primary">{{ engine.roots.size }}</div>
            <div class="stat-label">字根数</div>
          </div>
        </div>
        <div class="progress-bar"><div class="progress-fill" :style="{ width: (result.rate * 100) + '%' }" /></div>
        <template v-if="result.missing.length > 0">
          <h4 class="section-title">缺失部件 Top-20 (共{{ result.missing.length }}个)</h4>
          <table class="data-table">
            <thead><tr><th>部件</th><th>影响</th><th>笔画</th><th>操作</th></tr></thead>
            <tbody><tr v-for="([comp, cnt], i) in result.missing.slice(0, 20)" :key="i">
              <td class="char-col" style="cursor:pointer" @click="selectChar(comp)">{{ comp }}</td>
              <td>{{ cnt }} 字</td><td>{{ engine.strokeCount(comp) || '?' }}</td>
              <td><button class="btn btn-sm btn-outline" @click="addRoot(comp)">加入字根</button></td>
            </tr></tbody>
          </table>
        </template>
        <template v-if="result.uncovered.length > 0 && result.uncovered.length <= 200">
          <h4 class="section-title">未覆盖 ({{ result.uncovered.length }})</h4>
          <div class="uncovered-list">
            <span v-for="ch in result.uncovered.slice(0, 200)" :key="ch" class="uncovered-char" @click="selectChar(ch)">{{ ch }}</span>
          </div>
        </template>
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
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.stat-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 6px;
}
.stat-value.success {
  color: var(--success);
}
.stat-value.primary {
  color: var(--primary);
}
.stat-label {
  font-size: 12px;
  color: var(--text2);
  font-weight: 500;
}
.section-title {
  margin: 16px 0 12px;
  font-size: 13px;
  color: var(--text2);
  font-weight: 600;
}
.uncovered-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.uncovered-char {
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
.uncovered-char:hover {
  border-color: var(--primary);
  background: var(--primary-bg);
}
</style>