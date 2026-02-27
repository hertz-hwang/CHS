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
      <div v-if="loading" style="text-align:center;padding:40px;color:var(--text2)"><div class="spinner" />分析中...</div>
      <template v-if="result">
        <div class="cb">
          <div class="cc"><div class="val">{{ result.total }}</div><div class="lb">目标字集</div></div>
          <div class="cc"><div class="val" style="color:var(--green)">{{ result.covered }}</div><div class="lb">完全覆盖</div></div>
          <div class="cc"><div class="val">{{ (result.rate * 100).toFixed(1) }}%</div><div class="lb">覆盖率</div></div>
          <div class="cc"><div class="val" style="color:var(--purple)">{{ engine.roots.size }}</div><div class="lb">字根数</div></div>
        </div>
        <div class="progress-bar"><div class="progress-fill" :style="{ width: (result.rate * 100) + '%' }" /></div>
        <template v-if="result.missing.length > 0">
          <h4 style="margin:12px 0 8px;font-size:13px;color:var(--text2)">缺失部件 Top-20 (共{{ result.missing.length }}个)</h4>
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
          <h4 style="margin:12px 0 8px;font-size:13px;color:var(--text2)">未覆盖 ({{ result.uncovered.length }})</h4>
          <div class="fr"><span v-for="ch in result.uncovered.slice(0, 200)" :key="ch" class="fc" @click="selectChar(ch)">{{ ch }}</span></div>
        </template>
      </template>
    </div>
  </div>
</template>
<style scoped>
.cb { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
.cc { background: var(--bg3); border: 1px solid var(--border); border-radius: 10px; padding: 16px; text-align: center; }
.val { font-size: 28px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
.lb { font-size: 12px; color: var(--text2); }
.fr { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.fc { display: inline-block; padding: 4px 8px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; font-size: 18px; cursor: pointer; transition: all 0.15s; }
.fc:hover { border-color: var(--accent); transform: scale(1.1); }
</style>
