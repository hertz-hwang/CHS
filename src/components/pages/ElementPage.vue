<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { codeToString } from '../../engine/config'
import ElementPicker from '../element/ElementPicker.vue'
import ExportRootsImage from '../element/ExportRootsImage.vue'

const {
  engine, toast, refreshStats, rootsVersion, saveCurrentConfig,
  bracedRootToPua, isBracedRoot
} = useEngine()

// 31键布局
const KEYBOARD_LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ['_'], // 空格键
]

// 选中的键位
const selectedKey = ref<string | null>(null)

// 选中的编辑元素（用于传递给 ElementPicker）
const editingElement = ref<string | undefined>(undefined)

// 处理元素选择（点击已编码字根时定位键位）
function onElementSelect(element: string) {
  // 检查该元素是否有编码
  const code = engine.rootCodes.get(element)
  if (code && code.main) {
    // 定位到对应键位并展开详情
    const key = code.main.toLowerCase()
    selectedKey.value = key
  }
}

// 拖拽状态
const draggedRoot = ref<string | null>(null)

// 统计信息
const statsInfo = computed(() => {
  rootsVersion.value
  let encodedCount = 0
  let totalCode = 0
  
  for (const root of engine.roots) {
    const code = engine.rootCodes.get(root)
    if (code && code.main) {
      encodedCount++
      totalCode += 1 + (code.sub ? 1 : 0) + (code.supplement?.length || 0)
    }
  }
  
  return {
    total: engine.roots.size,
    encoded: encodedCount,
    avgCode: encodedCount > 0 ? (totalCode / encodedCount).toFixed(1) : '0'
  }
})

// 获取某键位上的所有字根及其编码（包含归并字根信息）
const rootsOnKey = computed(() => {
  rootsVersion.value
  const result = new Map<string, { root: string; code: ReturnType<typeof engine.rootCodes.get>; subCode: string; mergedRoots: string[] }[]>()

  // 初始化所有键位
  for (const row of KEYBOARD_LAYOUT) {
    for (const key of row) {
      result.set(key, [])
    }
  }

  // 遍历所有字根（排除归并字根）
  for (const [root, code] of engine.rootCodes) {
    if (engine.isMergedRoot(root)) continue
    
    if (code && code.main) {
      const mainKey = code.main.toLowerCase()
      if (result.has(mainKey)) {
        const subCode = (code.sub || '') + (code.supplement || '')
        // 获取归并到该字根的所有归并字根
        const mergedRoots = engine.getMergedToRoots(root)
        result.get(mainKey)!.push({ root, code, subCode, mergedRoots })
      }
    }
  }

  return result
})

// 当前选中键位的字根
const selectedRoots = computed(() => {
  if (!selectedKey.value) return []
  return rootsOnKey.value.get(selectedKey.value) || []
})

// 当前键位的归并字根列表
const mergedRootsOnKey = computed(() => {
  rootsVersion.value
  if (!selectedKey.value) return []
  const key = selectedKey.value
  
  const result: { target: string; source: string; sourceCode: string }[] = []
  for (const [target, source] of engine.mergedRoots) {
    const targetCode = engine.rootCodes.get(target)
    if (targetCode && targetCode.main) {
      if (targetCode.main.toLowerCase() === key) {
        const sourceCode = engine.rootCodes.get(source)
        result.push({
          target,
          source,
          sourceCode: sourceCode ? codeToString(sourceCode) : '',
        })
      }
    }
  }
  return result.sort((a, b) => a.target.localeCompare(b.target))
})

// 当前键位的字根半归并列表
const codeEquivalencesOnKey = computed(() => {
  rootsVersion.value
  if (!selectedKey.value) return []
  const key = selectedKey.value
  
  const result: { targetRef: string; sourceRef: string; targetCode: string; sourceCode: string }[] = []
  for (const [targetRef, sourceRef] of engine.codeEquivalences) {
    const targetParsed = engine.parseCodeRef(targetRef)
    const sourceParsed = engine.parseCodeRef(sourceRef)
    
    if (targetParsed && sourceParsed) {
      const targetRootCode = engine.rootCodes.get(targetParsed.root)
      if (targetRootCode && targetRootCode.main) {
        if (targetRootCode.main.toLowerCase() === key) {
          const targetCode = engine.getRootCodeAt(targetParsed.root, targetParsed.codeIndex) || ''
          const sourceCode = engine.getRootCodeAt(sourceParsed.root, sourceParsed.codeIndex) || ''
          result.push({ targetRef, sourceRef, targetCode, sourceCode })
        }
      }
    }
  }
  return result.sort((a, b) => a.targetRef.localeCompare(b.targetRef))
})

// 显示字根（花括号字根转为 PUA 字符）
function displayRoot(root: string): string {
  return bracedRootToPua(root)
}

// 获取字根的字体样式类
function getRootFontClass(root: string): string {
  return isBracedRoot(root) ? 'pua-font' : ''
}

// 选择键位
function selectKey(key: string) {
  selectedKey.value = selectedKey.value === key ? null : key
}

// 删除字根
function deleteRoot(root: string) {
  engine.rootCodes.delete(root)
  engine.roots.delete(root)
  refreshStats()
  toast(`已删除字根: ${root}`)
}

// 取消归并
function removeMerge(targetRoot: string) {
  engine.removeMergedRoot(targetRoot)
  saveCurrentConfig()
  refreshStats()
  toast(`已取消「${targetRoot}」的归并`)
}

// 取消字根半归并
function removeCodeEquiv(targetRef: string) {
  engine.removeCodeEquivalence(targetRef)
  saveCurrentConfig()
  refreshStats()
  toast(`已取消「${targetRef}」的字根半归并`)
}

// 元素添加完成回调
function onElementAdded() {
  refreshStats()
}

// 选择字根进行编辑（点击字根卡片）
function selectRootForEdit(root: string) {
  editingElement.value = root
}

// 选择归并字根进行编辑
function selectMergedRootForEdit(root: string) {
  editingElement.value = root
}

// 从半归并引用中解析字根
function parseRootFromRef(ref: string): string {
  const parsed = engine.parseCodeRef(ref)
  return parsed ? parsed.root : ref
}

// 拖拽开始
function onDragStart(event: DragEvent, root: string) {
  draggedRoot.value = root
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', root)
  }
}

// 拖拽结束
function onDragEnd() {
  draggedRoot.value = null
  dropPosition.value = null
}

// 拖放位置状态
const dropPosition = ref<'before' | 'after' | null>(null)

// 拖拽经过（根据位置决定插入点）
function onDragOver(event: DragEvent, targetRoot: string) {
  event.preventDefault()
  // 根据鼠标在目标元素上的位置决定插入点
  const target = (event.currentTarget as HTMLElement)
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left
  const width = rect.width
  dropPosition.value = x < width / 2 ? 'before' : 'after'
}

// 拖拽放置（根据位置插入）
function onDrop(targetRoot: string) {
  if (draggedRoot.value && draggedRoot.value !== targetRoot) {
    const success = engine.reorderRootOnKey(draggedRoot.value, targetRoot, dropPosition.value || 'after')
    if (success) {
      refreshStats()  // 触发响应式更新
      saveCurrentConfig()
      toast(`已调整字根顺序`)
    }
  }
  draggedRoot.value = null
  dropPosition.value = null
}

// 等效字根弹窗
const showEquivModal = ref(false)

function openEquivModal() {
  showEquivModal.value = true
}
</script>

<template>
  <div class="element-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="stats-item">
          <span class="stats-label">字根总数</span>
          <span class="stats-value">{{ statsInfo.total }}</span>
        </span>
        <span class="stats-item">
          <span class="stats-label">已编码</span>
          <span class="stats-value success">{{ statsInfo.encoded }}</span>
        </span>
        <span class="stats-item">
          <span class="stats-label">编码长度</span>
          <span class="stats-value">{{ statsInfo.avgCode }}</span>
        </span>
      </div>
      <div class="toolbar-right">
        <ExportRootsImage />
        <button class="btn btn-sm btn-info" @click="openEquivModal">等效字根设置</button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 左侧：元素选择面板（固定400px） -->
      <ElementPicker 
        :selected-key="selectedKey || undefined"
        :external-element="editingElement"
        @added="onElementAdded"
        @update:external-element="editingElement = $event"
        @select="onElementSelect"
      />

      <!-- 右侧：键盘映射面板（自适应宽度） -->
      <div class="keyboard-panel">
        <!-- 键盘布局 -->
        <div class="keyboard">
          <!-- 字母键 -->
          <div v-for="(row, ri) in KEYBOARD_LAYOUT.slice(0, 3)" :key="ri" class="keyboard-row">
            <div
              v-for="key in row"
              :key="key"
              class="key"
              :class="{
                'key-populated': rootsOnKey.get(key)?.length,
                'key-selected': selectedKey === key
              }"
              @click="selectKey(key)"
            >
              <span class="key-label">{{ key.toUpperCase() }}</span>
              <div v-if="rootsOnKey.get(key)?.length" class="key-roots">
                <div 
                  v-for="item in rootsOnKey.get(key)!.slice(0, 4)" 
                  :key="item.root"
                  class="root-chip"
                >
                  <span class="root-text" :class="getRootFontClass(item.root)">{{ displayRoot(item.root) }}</span>
                  <span v-if="item.subCode" class="root-sub" :title="`后续编码: ${item.subCode}`">
                    {{ item.subCode }}
                  </span>
                </div>
                <span v-if="rootsOnKey.get(key)!.length > 4" class="more">
                  +{{ rootsOnKey.get(key)!.length - 4 }}
                </span>
              </div>
              <span v-if="rootsOnKey.get(key)?.length" class="key-count">
                {{ rootsOnKey.get(key)!.length }}
              </span>
            </div>
          </div>
          
          <!-- 空格键 -->
          <div class="keyboard-row">
            <div
              class="key key-space"
              :class="{
                'key-populated': rootsOnKey.get('_')?.length,
                'key-selected': selectedKey === '_'
              }"
              @click="selectKey('_')"
            >
              <span class="key-label">空格</span>
              <span v-if="rootsOnKey.get('_')?.length" class="key-count">
                {{ rootsOnKey.get('_')!.length }}
              </span>
            </div>
          </div>
        </div>

        <!-- 选中键位的字根列表 -->
        <div v-if="selectedKey" class="roots-detail">
          <div class="detail-header">
            <h3>
              键位 <strong>{{ selectedKey === '_' ? '空格' : selectedKey.toUpperCase() }}</strong>
              <span class="root-count">{{ selectedRoots.length }} 个字根</span>
            </h3>
            <button class="btn-close-detail" @click="selectedKey = null" title="关闭">×</button>
          </div>

          <!-- 归并字根列表 -->
          <div v-if="mergedRootsOnKey.length > 0" class="merged-section">
            <div class="section-label">归并字根 ({{ mergedRootsOnKey.length }}) - 点击编辑</div>
            <div class="merged-list">
              <div 
                v-for="item in mergedRootsOnKey" 
                :key="item.target" 
                class="merged-item clickable"
                @click="selectMergedRootForEdit(item.target)"
              >
                <span class="merged-target">{{ item.target }}</span>
                <span class="merged-arrow">→</span>
                <span class="merged-source">{{ item.source }}</span>
                <span class="merged-code">({{ item.sourceCode.toUpperCase() }})</span>
                <button class="btn-remove" @click.stop="removeMerge(item.target)">×</button>
              </div>
            </div>
          </div>

          <!-- 字根半归并列表 -->
          <div v-if="codeEquivalencesOnKey.length > 0" class="equiv-section">
            <div class="section-label">字根半归并 ({{ codeEquivalencesOnKey.length }}) - 点击编辑</div>
            <div class="equiv-list">
              <div 
                v-for="item in codeEquivalencesOnKey" 
                :key="item.targetRef" 
                class="equiv-item clickable"
                @click="selectMergedRootForEdit(parseRootFromRef(item.targetRef))"
              >
                <span class="equiv-target">{{ item.targetRef }}</span>
                <span class="equiv-equal">=</span>
                <span class="equiv-source">{{ item.sourceRef }}</span>
                <span class="equiv-code">({{ item.targetCode.toUpperCase() }} = {{ item.sourceCode.toUpperCase() }})</span>
                <button class="btn-remove" @click.stop="removeCodeEquiv(item.targetRef)">×</button>
              </div>
            </div>
          </div>

          <!-- 字根网格 -->
          <div class="roots-grid">
            <div 
              v-for="item in selectedRoots" 
              :key="item.root" 
              class="root-card"
              :class="{ 'dragging': draggedRoot === item.root }"
              draggable="true"
              @click="selectRootForEdit(item.root)"
              @dragstart="onDragStart($event, item.root)"
              @dragend="onDragEnd"
              @dragover="onDragOver($event, item.root)"
              @drop="onDrop(item.root)"
            >
              <span class="root-char" :class="getRootFontClass(item.root)">{{ displayRoot(item.root) }}</span>
              <span class="root-code">
                <span class="main">{{ item.code?.main?.toUpperCase() }}</span>
                <span v-if="item.code?.sub" class="sub">{{ item.code.sub }}</span>
                <span v-if="item.code?.supplement" class="supplement">{{ item.code.supplement }}</span>
              </span>
              <!-- 归并字根显示 -->
              <span v-if="item.mergedRoots.length > 0" class="merged-badge" :title="`归并字根: ${item.mergedRoots.join(', ')}`">
                (<span v-for="r in item.mergedRoots" :key="r" :class="getRootFontClass(r)">{{ displayRoot(r) }}</span>)
              </span>
              <button class="btn-delete" @click.stop="deleteRoot(item.root)" title="删除">×</button>
            </div>
          </div>
        </div>

        <!-- 未选中键位提示 -->
        <div v-else class="no-selection-hint">
          <p>点击键盘上的键位查看该键位的字根列表</p>
          <p class="hint-sub">双击左侧元素池中的元素可快速添加到选中的键位</p>
        </div>
      </div>
    </div>

    <!-- 等效字根设置弹窗（简化版，后续可扩展） -->
    <div v-if="showEquivModal" class="modal-overlay" @click="showEquivModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>等效字根设置</h3>
          <button class="btn-close" @click="showEquivModal = false">×</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc">等效字根设置功能可在「字根管理」页面中使用。</p>
          <p class="modal-desc">此处暂未实现完整功能，请使用原页面的等效字根设置。</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="showEquivModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.element-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 20px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.stats-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stats-label {
  font-size: 12px;
  color: var(--text2);
}

.stats-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.stats-value.success {
  color: var(--success);
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* 键盘映射面板 */
.keyboard-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow-y: auto;
  background: var(--bg);
}

/* 键盘 */
.keyboard {
  background: var(--bg2);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.keyboard-row {
  display: flex;
  gap: 6px;
}

.key {
  flex: 1;
  min-height: 90px;
  background: var(--bg3);
  border: 2px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  padding: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.key:hover {
  border-color: var(--primary);
  background: var(--bg);
}

.key-populated {
  background: var(--bg);
  border-color: var(--primary);
}

.key-selected {
  background: var(--primary);
  border-color: var(--primary);
}

.key-selected .key-label {
  color: white;
}

.key-selected .root-text,
.key-selected .root-sub {
  color: white;
}

.key-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text3);
  margin-bottom: 4px;
}

.key-roots {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-content: flex-start;
}

.root-chip {
  display: flex;
  align-items: center;
  background: var(--primary-bg);
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 11px;
}

.root-text {
  font-size: 12px;
  color: var(--primary);
}

.root-sub {
  font-size: 10px;
  color: var(--success);
  margin-left: 1px;
}

.key-selected .root-chip {
  background: rgba(255,255,255,0.2);
}

.more {
  font-size: 10px;
  color: var(--text3);
  padding: 2px 4px;
}

.key-count {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 10px;
  background: var(--primary);
  color: white;
  padding: 1px 6px;
  border-radius: 10px;
}

.key-selected .key-count {
  background: rgba(255,255,255,0.3);
}

.key-space {
  min-height: 50px;
  flex: none;
  width: 50%;
  margin: 0 auto;
}

/* 字根详情面板 */
.roots-detail {
  margin-top: 16px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 16px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.detail-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.detail-header strong {
  color: var(--primary);
  font-size: 16px;
}

.root-count {
  font-size: 12px;
  color: var(--text2);
  margin-left: 8px;
  font-weight: normal;
}

.btn-close-detail {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text2);
  font-size: 18px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close-detail:hover {
  background: var(--bg3);
  color: var(--text);
}

/* 归并区块 */
.merged-section,
.equiv-section {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.section-label {
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 8px;
}

.merged-list,
.equiv-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.merged-item,
.equiv-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg3);
  border-radius: 4px;
  font-size: 12px;
}

.merged-item.clickable,
.equiv-item.clickable {
  cursor: pointer;
  transition: all 0.15s;
}

.merged-item.clickable:hover,
.equiv-item.clickable:hover {
  background: var(--primary-bg);
}

.merged-target,
.equiv-target {
  font-weight: 500;
  color: var(--purple);
}

.merged-arrow,
.equiv-equal {
  color: var(--text2);
}

.merged-source,
.equiv-source {
  color: var(--primary);
}

.merged-code,
.equiv-code {
  font-family: monospace;
  font-size: 11px;
  color: var(--text3);
}

.btn-remove {
  width: 18px;
  height: 18px;
  border: none;
  background: rgba(245, 63, 63, 0.15);
  color: var(--danger);
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  margin-left: 4px;
}

.btn-remove:hover {
  background: var(--danger);
  color: white;
}

/* 字根网格 */
.roots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
}

.root-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  position: relative;
  transition: all 0.15s;
}

.root-card:hover {
  border-color: var(--primary);
  cursor: pointer;
}

.root-card.dragging {
  opacity: 0.5;
  border-style: dashed;
}

.root-char {
  font-size: 24px;
  line-height: 1;
  margin-bottom: 4px;
}

.root-code {
  font-family: monospace;
  font-size: 12px;
}

.root-code .main {
  color: var(--primary);
  font-weight: 600;
}

.root-code .sub {
  color: var(--success);
}

.root-code .supplement {
  color: var(--warning);
}

.merged-badge {
  font-size: 11px;
  color: var(--primary);
  background: var(--primary-bg);
  padding: 1px 4px;
  border-radius: 3px;
  margin-top: 4px;
  font-weight: 500;
}

.btn-delete {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--text3);
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: all 0.15s;
}

.root-card:hover .btn-delete {
  opacity: 1;
}

.btn-delete:hover {
  background: var(--danger);
  color: white;
}

/* 未选中提示 */
.no-selection-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text2);
}

.no-selection-hint p {
  margin: 4px 0;
}

.hint-sub {
  font-size: 13px;
  color: var(--text3);
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid var(--border);
  min-width: 400px;
  max-width: 80vw;
  max-height: 80vh;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.btn-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text2);
  font-size: 20px;
  cursor: pointer;
  border-radius: 4px;
}

.btn-close:hover {
  background: var(--bg3);
}

.modal-body {
  padding: 20px;
}

.modal-desc {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text);
  line-height: 1.6;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

/* PUA 字体样式 */
.pua-font {
  font-family: 'CHS-PUA', 'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif !important;
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover {
  filter: brightness(1.1);
}

.btn-outline {
  background: transparent;
  border-color: var(--border);
  color: var(--text);
}

.btn-outline:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.btn-info {
  background: #1890ff;
  color: white;
}

.btn-info:hover {
  background: #40a9ff;
}
</style>