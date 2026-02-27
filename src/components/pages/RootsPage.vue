<script setup lang="ts">
import { ref, computed } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import RootCodeEditor from '../shared/RootCodeEditor.vue'
import NamedRootEditor from '../shared/NamedRootEditor.vue'
import { useEngine } from '../../composables/useEngine'
const { engine, refreshStats, toast, rootsVersion } = useEngine()
const modalMode = ref<'set' | 'add' | 'remove' | null>(null); const modalInput = ref('')
const showCodeEditor = ref(false)
const showNamedRootEditor = ref(false)

const rootsByStroke = computed(() => {
  // 依赖 rootsVersion 确保在 roots 变化时重新计算
  rootsVersion.value
  const bySC = new Map<number, string[]>()
  for (const r of [...engine.roots].sort()) { const sc = engine.strokeCount(r); if (!bySC.has(sc)) bySC.set(sc, []); bySC.get(sc)!.push(r) }
  return [...bySC.entries()].sort(([a], [b]) => a - b)
})

// 带编码显示的字根
const rootsWithCode = computed(() => {
  rootsVersion.value
  const result: { root: string; sc: number; code: string }[] = []
  for (const r of [...engine.roots].sort()) {
    const sc = engine.strokeCount(r)
    const code = engine.getRootCodeString(r)
    result.push({ root: r, sc, code })
  }
  return result
})

function openModal(mode: 'set' | 'add' | 'remove') { modalMode.value = mode; modalInput.value = mode === 'set' ? [...engine.roots].join('') : '' }
function confirmModal() {
  if (modalMode.value === 'set') { engine.setRoots(modalInput.value); toast(`已设置 ${engine.roots.size} 个字根`) }
  else if (modalMode.value === 'add') { engine.addRoots(modalInput.value); toast(`已追加，共 ${engine.roots.size} 个`) }
  else if (modalMode.value === 'remove') { engine.removeRoots(modalInput.value); toast(`已移除，共 ${engine.roots.size} 个`) }
  modalMode.value = null; refreshStats()
}
function removeRoot(r: string) { engine.removeRoots(r); toast(`移除: ${r}`); refreshStats() }
function initAtomic() { if (!engine.decomp.size) { toast('请先加载数据'); return }; engine.useAtomicRoots(); refreshStats(); toast(`原子字根: ${engine.roots.size} 个`) }
function exportRoots() {
  const blob = new Blob([engine.exportRootsText()], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'roots.txt'; a.click(); toast('已导出')
}
const modalTitle = computed(() => ({ set: '✏️ 手动设置字根', add: '➕ 追加字根', remove: '➖ 移除字根' }[modalMode.value!] || ''))

// 渲染编码（带颜色）
function renderCode(code: string): { main: string; sub?: string; supplement?: string } {
  if (!code) return { main: '' }
  return {
    main: code[0] || '',
    sub: code.length > 1 ? code[1] : undefined,
    supplement: code.length > 2 ? code.slice(2) : undefined,
  }
}
</script>
<template>
  <div class="panel">
    <div class="panel-head">⚙️ 设置字根</div>
    <div class="panel-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <button class="btn btn-success" @click="initAtomic">🧩 原子字根</button>
        <button class="btn btn-outline" @click="openModal('set')">✏️ 手动输入</button>
        <button class="btn btn-purple" @click="openModal('add')">➕ 追加字根</button>
        <button class="btn btn-danger" @click="openModal('remove')">➖ 移除字根</button>
      </div>
      <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" @click="exportRoots">💾 导出字根</button>
        <button class="btn btn-sm" @click="showCodeEditor = true">🔤 编码管理</button>
        <button class="btn btn-sm" @click="showNamedRootEditor = true">🏷️ 命名字根</button>
        <span style="color:var(--text2);font-size:12px">当前 {{ engine.roots.size }} 个</span>
      </div>
      <div class="rg">
        <template v-for="item in rootsWithCode" :key="item.root">
          <span class="rc" title="点击移除" @click="removeRoot(item.root)">
            {{ item.root }}
            <span v-if="item.code" class="code">
              <span class="main">{{ renderCode(item.code).main }}</span>
              <span v-if="renderCode(item.code).sub" class="sub">{{ renderCode(item.code).sub }}</span>
              <span v-if="renderCode(item.code).supplement" class="supplement">{{ renderCode(item.code).supplement }}</span>
            </span>
            <span class="x">✕</span>
          </span>
        </template>
      </div>
    </div>
  </div>

  <ModalDialog :visible="modalMode !== null" :title="modalTitle" @close="modalMode = null">
    <p style="font-size:13px;color:var(--text2);margin-bottom:8px">{{ modalMode === 'set' ? '输入字根（替换全部）：' : modalMode === 'add' ? '输入要追加的字根：' : '输入要移除的字根：' }}</p>
    <textarea v-model="modalInput" style="width:100%" />
    <template #actions>
      <button class="btn btn-outline" @click="modalMode = null">取消</button>
      <button class="btn" :class="modalMode === 'remove' ? 'btn-danger' : modalMode === 'add' ? 'btn-purple' : ''" @click="confirmModal">
        {{ modalMode === 'set' ? '确定' : modalMode === 'add' ? '追加' : '移除' }}
      </button>
    </template>
  </ModalDialog>

  <!-- 字根编码编辑器 -->
  <ModalDialog :visible="showCodeEditor" title="🔤 字根编码管理" @close="showCodeEditor = false">
    <RootCodeEditor />
  </ModalDialog>

  <!-- 命名字根编辑器 -->
  <ModalDialog :visible="showNamedRootEditor" title="🏷️ 命名字根" @close="showNamedRootEditor = false">
    <NamedRootEditor />
  </ModalDialog>
</template>
<style scoped>
.rg { display: flex; flex-wrap: wrap; gap: 4px; max-height: 400px; overflow-y: auto; padding: 8px; }
.rc { display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px; font-size: 16px; cursor: pointer; transition: all 0.15s; user-select: none; }
.rc:hover { border-color: var(--red); background: #b71c1c22; }
.rc .code { font-family: monospace; font-size: 12px; margin-left: 4px; }
.rc .code .sub { color: #2196F3; }
.rc .code .supplement { color: #4CAF50; }
.x { font-size: 10px; color: var(--red); opacity: 0; transition: opacity 0.15s; }
.rc:hover .x { opacity: 1; }
</style>