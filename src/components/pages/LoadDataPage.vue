<script setup lang="ts">
import { ref } from 'vue'
import FileDropZone from '../shared/FileDropZone.vue'
import IdsTransformer from '../shared/IdsTransformer.vue'
import { useEngine } from '../../composables/useEngine'
import Icon from '../Icon.vue'

const { engine, refreshStats, toast } = useEngine()
const statusIds = ref(''); const statusCustom = ref(''); const statusStroke = ref('')
const statusDict = ref(''); const statusCharset = ref(''); const statusRoots = ref('')

function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsText(file) })
}
async function onIDS(files: FileList) { const t = await readFile(files[0]); const n = engine.loadSkyIDS(t); statusIds.value = `<span class="tag tag-success">✔ ${n} 条拆分</span>`; refreshStats(); toast(`sky_ids: ${n} 条`) }
async function onCustom(files: FileList) { const t = await readFile(files[0]); const { total, overwritten } = engine.loadCustomIDS(t); statusCustom.value = `<span class="tag tag-success">✔ ${total} 条 (覆盖${overwritten})</span>`; refreshStats(); toast(`custom_ids: ${total} 条`) }
async function onStroke(files: FileList) { const t = await readFile(files[0]); const n = engine.loadStrokes(t); statusStroke.value = `<span class="tag tag-success">✔ ${n} 字</span>`; refreshStats(); toast(`stroke: ${n} 字`) }
async function onDict(files: FileList) { const t = await readFile(files[0]); const n = engine.loadDict(t); statusDict.value = `<span class="tag tag-success">✔ ${n} 条</span>`; refreshStats(); toast(`dict: ${n} 条`) }
async function onCharsets(files: FileList) {
  const msgs: string[] = []
  for (const file of Array.from(files)) { const t = await readFile(file); const name = file.name.replace(/\.txt$/i, ''); const n = engine.loadCharset(name, t); msgs.push(`✔ ${name}: ${n} 字`); toast(`字集 ${name}: ${n} 字`) }
  statusCharset.value = msgs.map(m => `<span class="tag tag-success">${m}</span>`).join('<br>'); refreshStats()
}
async function onRoots(files: FileList) { const t = await readFile(files[0]); const n = engine.loadRootsFromText(t); statusRoots.value = `<span class="tag tag-success">✔ ${n} 个</span>`; refreshStats(); toast(`字根: ${n} 个`) }
function initAtomic() { if (!engine.decomp.size) { toast('请先加载 IDS 数据！'); return }; const a = engine.useAtomicRoots(); refreshStats(); toast(`原子字根: ${a.size} 个`) }
function restoreRoots() { if (engine.loadSavedRoots()) { refreshStats(); toast(`恢复: ${engine.roots.size} 个`) } else toast('未找到保存的字根') }
</script>
<template>
  <div class="panel">
    <div class="panel-head">📂 加载数据文件</div>
    <div class="panel-body">
      <p class="hint">支持拖拽或点击上传。所有处理在本地完成。</p>
      <div class="file-grid">
        <FileDropZone icon="📄" title="sky_ids.txt" desc="IDS 序列 (必需)" :status="statusIds" @files="onIDS" />
        <FileDropZone icon="📄" title="custom_ids.txt" desc="自定义 IDS (可选)" :status="statusCustom" @files="onCustom" />
        <FileDropZone icon="📄" title="stroke.txt" desc="笔画数据 (可选)" :status="statusStroke" @files="onStroke" />
        <FileDropZone icon="📄" title="dictionary.txt" desc="字频/拼音 (可选)" :status="statusDict" @files="onDict" />
      </div>
      <h4 class="section-title">字集文件 (可选)</h4>
      <FileDropZone icon="📁" title="字集文件 (.txt)" desc="如 tg8105.txt 等" :status="statusCharset" :multiple="true" @files="onCharsets" />
      <h4 class="section-title">字根文件 (可选)</h4>
      <FileDropZone icon="🧩" title="字根文件 (.txt)" desc="每行一组字根" :status="statusRoots" @files="onRoots" />
      <div class="action-row">
        <button class="btn btn-success" @click="initAtomic"><Icon name="puzzle" :size="14" /> 使用原子字根</button>
        <button class="btn btn-outline" @click="restoreRoots"><Icon name="download" :size="14" /> 恢复保存的字根</button>
      </div>
    </div>
  </div>

  <!-- IDS 转换器 -->
  <IdsTransformer class="config-panel" />
</template>
<style scoped>
.hint {
  color: var(--text2);
  margin-bottom: 16px;
  font-size: 13px;
}
.file-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.section-title {
  font-size: 13px;
  color: var(--text2);
  margin: 16px 0 8px;
  font-weight: 600;
}
.action-row {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.config-panel {
  margin-top: 12px;
}
</style>