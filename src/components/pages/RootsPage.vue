<script setup lang="ts">
import { ref, computed } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { useEngine } from '../../composables/useEngine'
const { engine, refreshStats, toast, rootsVersion } = useEngine()
const modalMode = ref<'set' | 'add' | 'remove' | null>(null); const modalInput = ref('')

const rootsByStroke = computed(() => {
  // 依赖 rootsVersion 确保在 roots 变化时重新计算
  rootsVersion.value
  const bySC = new Map<number, string[]>()
  for (const r of [...engine.roots].sort()) { const sc = engine.strokeCount(r); if (!bySC.has(sc)) bySC.set(sc, []); bySC.get(sc)!.push(r) }
  return [...bySC.entries()].sort(([a], [b]) => a - b)
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
      <div style="margin-bottom:12px;display:flex;align-items:center;gap:12px">
        <button class="btn btn-outline btn-sm" @click="exportRoots">💾 导出字根</button>
        <span style="color:var(--text2);font-size:12px">当前 {{ engine.roots.size }} 个</span>
      </div>
      <div class="rg">
        <template v-for="[sc, roots] in rootsByStroke" :key="sc">
          <div class="gt">[{{ sc ? sc + '画' : '未知' }}] {{ roots.length }}个</div>
          <span v-for="r in roots" :key="r" class="rc" title="点击移除" @click="removeRoot(r)">{{ r }}<span class="x">✕</span></span>
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
</template>
<style scoped>
.rg { display: flex; flex-wrap: wrap; gap: 4px; max-height: 400px; overflow-y: auto; padding: 8px; }
.gt { width: 100%; font-size: 11px; color: var(--text2); padding: 4px 0 2px; margin-top: 4px; border-bottom: 1px solid var(--border); }
.rc { display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); border: 1px solid var(--border); padding: 4px 8px; border-radius: 6px; font-size: 16px; cursor: pointer; transition: all 0.15s; user-select: none; }
.rc:hover { border-color: var(--red); background: #b71c1c22; }
.x { font-size: 10px; color: var(--red); opacity: 0; transition: opacity 0.15s; }
.rc:hover .x { opacity: 1; }
</style>
