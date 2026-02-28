<script setup lang="ts">
import { ref } from 'vue'
import { useEngine } from '../../composables/useEngine'
import type { SuggestItem } from '../../engine/engine'
const { engine, refreshStats, toast, selectChar } = useEngine()
const minUse = ref(5); const maxStroke = ref<number | undefined>(undefined)
const results = ref<(SuggestItem & { checked: boolean })[]>([]); const loading = ref(false)
function run() {
  if (!engine.decomp.size) { toast('请先加载数据'); return }
  loading.value = true
  setTimeout(() => {
    // 过滤掉已存在的字根，只显示当前不存在的字根
    const filtered = engine.suggestRoots(minUse.value, maxStroke.value ?? null)
      .filter(s => !engine.roots.has(s.comp))
      .slice(0, 100)
      .map(s => ({ ...s, checked: false })); // 默认不选中
    results.value = filtered;
    loading.value = false
  }, 50)
}
function adoptAll() {
  // 采用当前显示的所有字根（已过滤，都是新字根）
  const roots = new Set(results.value.map(r => r.comp))
  engine.addRoots(roots); refreshStats(); toast(`已采用 ${roots.size} 个`)
  // 重新过滤显示
  run()
}
function adoptSelected() {
  const roots = new Set(results.value.filter(r => r.checked).map(r => r.comp))
  if (!roots.size) { toast('未选中'); return }
  engine.addRoots(roots); refreshStats(); toast(`已采用 ${roots.size} 个`)
  // 重新过滤显示
  run()
}
function selectAll() { results.value.forEach(r => r.checked = true) }
function deselectAll() { results.value.forEach(r => r.checked = false) }
function onCharClick(ch: string) { selectChar(ch) }
</script>
<template>
  <div class="panel">
    <div class="panel-head">💡 推荐字根</div>
    <div class="panel-body">
      <div class="input-row">
        <input v-model.number="minUse" type="number" placeholder="最小使用次数 (5)" />
        <input v-model.number="maxStroke" type="number" placeholder="最大笔画数 (不限)" />
        <button class="btn" @click="run">分析</button>
      </div>
      <div v-if="loading" style="text-align:center;padding:40px;color:var(--text2)"><div class="spinner" />分析中...</div>
      <template v-if="results.length > 0">
        <p style="color:var(--text2);margin-bottom:8px">推荐 {{ results.length }} 个</p>
        <div style="margin-bottom:8px;display:flex;gap:8px">
          <button class="btn btn-sm btn-success" @click="adoptAll">✔ 全部采用</button>
          <button class="btn btn-sm btn-purple" @click="adoptSelected">✔ 采用选中</button>
          <button class="btn btn-sm btn-outline" @click="selectAll">全选</button>
          <button class="btn btn-sm btn-outline" @click="deselectAll">取消全选</button>
        </div>
        <div style="max-height:500px;overflow-y:auto">
          <label v-for="(it, i) in results" :key="i" class="si">
            <input v-model="it.checked" type="checkbox" style="accent-color:var(--accent)" @click.stop />
            <span class="sc clickable" @click="onCharClick(it.comp)">{{ it.comp }}</span>
            <span class="cn">使用 {{ it.cnt }} 次</span>
            <span class="ss">{{ it.sc ? it.sc + '画' : '未知' }}</span>
          </label>
        </div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.si { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s; }
.si:hover { background: var(--bg3); }
.sc { font-size: 22px; width: 36px; text-align: center; }
.sc.clickable { cursor: pointer; border-radius: 4px; transition: background 0.15s; }
.sc.clickable:hover { background: var(--bg2); color: var(--primary); }
.cn { color: var(--accent); font-size: 13px; }
.ss { color: var(--text2); font-size: 12px; }
</style>
