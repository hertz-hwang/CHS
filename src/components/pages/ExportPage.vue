<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEngine } from '../../composables/useEngine'
import Icon from '../Icon.vue'
const { engine, toast } = useEngine()
const format = ref('compact'); const charsetName = ref(''); const preview = ref(''); const showPreview = ref(false)
const opts = computed(() => {
  const o = [{ value: '', label: `全部 (${engine.decomp.size} 字)` }]
  for (const [name, chars] of engine.charsets) o.push({ value: name, label: `${name} (${chars.length} 字)` })
  return o
})
function gen(chars?: string[]): string {
  if (!chars) chars = engine.getCharset(charsetName.value || null)
  if (format.value === 'full') return engine.exportFull(chars)
  if (format.value === 'detail') return engine.exportDetail(chars)
  return engine.exportCompact(chars)
}
function doPreview() { if (!engine.decomp.size) { toast('请先加载数据'); return }; preview.value = gen(engine.getCharset(charsetName.value || null).slice(0, 20)); showPreview.value = true }
function doExport() {
  if (!engine.decomp.size) { toast('请先加载数据'); return }
  const chars = engine.getCharset(charsetName.value || null); const text = gen(chars)
  const fn = `output_${format.value}_${charsetName.value || 'all'}.txt`
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })); a.download = fn; a.click()
  toast(`已导出 ${chars.length} 字 → ${fn}`)
}
</script>
<template>
  <div class="panel">
    <div class="panel-head"><Icon name="export" :size="18" /> 导出结果</div>
    <div class="panel-body">
      <div class="input-row">
        <select v-model="format">
          <option value="full">完整表 (汉字/拆分/结构/笔画/拼音/词频)</option>
          <option value="compact">拆分表 (汉字/拆分/词频)</option>
          <option value="detail">详情表 (汉字/[拆分,拼音,UNICODE区,编码])</option>
        </select>
        <select v-model="charsetName"><option v-for="o in opts" :key="o.value" :value="o.value">{{ o.label }}</option></select>
        <button class="btn btn-success" @click="doExport"><Icon name="download" :size="14" /> 下载</button>
      </div>
      <div style="margin-top:8px"><button class="btn btn-outline btn-sm" @click="doPreview">预览前20行</button></div>
      <pre v-if="showPreview" class="ep">{{ preview }}</pre>
    </div>
  </div>
</template>
<style scoped>
.ep { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; white-space: pre; color: var(--text2); margin-top: 12px; }
</style>
