<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { codeToString } from '../../engine/config'
import { GB_STROKE_EQUIVALENT_ROOTS } from '../../engine/engine'
import ModalDialog from '../ModalDialog.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  engine, toast, refreshStats, rootsVersion,
  bracedRootToPua, isBracedRoot
} = useEngine()

// 等效字根相关状态
const equivSearchQuery = ref('')
const selectedMainRoot = ref<string | null>(null)
const draggedRoot = ref<string | null>(null)
const editingEquivRoot = ref<string | null>(null)
const editingEquivCode = ref('')

// 显示字根（花括号字根转为 PUA 字符）
function displayRoot(root: string): string {
  return bracedRootToPua(root)
}

// 获取字根的字体样式类
function getRootFontClass(root: string): string {
  return isBracedRoot(root) ? 'pua-font' : ''
}

// 等效字根列表
const equivalentRootsList = computed(() => {
  rootsVersion.value
  const list: { mainRoot: string; equivalents: string[]; mainCode: string }[] = []
  for (const [mainRoot, equivs] of engine.equivalentRoots) {
    const mainCode = engine.getRootCodeString(mainRoot)
    list.push({ mainRoot, equivalents: equivs, mainCode })
  }
  return list
})

// 所有部件列表（按笔画数升序，支持检索）
const allComponentsList = computed(() => {
  rootsVersion.value
  const query = equivSearchQuery.value.trim()

  // 收集所有部件：实际分解的叶子节点 + 原子字根 + 已定义的字根 + 命名字根
  const allChars = new Set<string>()

  // 1. 实际分解后得到的叶子节点（经过转换规则处理）
  for (const char of engine.getCharset()) {
    const { leaves } = engine.decompose(char)
    for (const leaf of leaves) {
      allChars.add(leaf)
    }
  }

  // 2. 原子字根（原始 IDS 的叶子节点，不可再拆分）
  for (const char of engine.atomicComponents()) {
    allChars.add(char)
  }

  // 3. 已定义的字根
  for (const char of engine.roots) {
    allChars.add(char)
  }

  // 4. 命名字根
  for (const char of engine.namedRoots.keys()) {
    allChars.add(char)
  }

  const list: { char: string; strokeCount: number; isMain: boolean; isEquiv: boolean; mainRoot?: string; isBraced: boolean }[] = []

  for (const char of allChars) {
    // 检索过滤
    if (query && !char.includes(query)) {
      const strokes = engine.getStrokes(char)
      const strokeCode = strokes.length > 0 ? strokes[0] : ''
      if (!strokeCode.includes(query)) continue
    }

    const isMain = engine.equivalentRoots.has(char)
    const mainRoot = engine.getMainRoot(char)
    const isEquiv = !!mainRoot
    const isBraced = isBracedRoot(char)

    list.push({
      char,
      strokeCount: engine.strokeCount(char),
      isMain,
      isEquiv,
      mainRoot,
      isBraced
    })
  }

  // 按笔画数升序
  list.sort((a, b) => a.strokeCount - b.strokeCount)

  return list
})

// 选择主字根
function selectMainRoot(root: string) {
  if (selectedMainRoot.value === root) {
    selectedMainRoot.value = null
  } else {
    selectedMainRoot.value = root
  }
}

// 添加等效字根到主字根
function addToEquivRoots(mainRoot: string, equivRoot: string) {
  if (mainRoot === equivRoot) {
    toast('不能将自己设为等效字根')
    return
  }

  const current = engine.getEquivalentRoots(mainRoot)
  if (current.includes(equivRoot)) {
    toast('该字根已是等效字根')
    return
  }

  // 检查是否是其他主字根的等效字根
  const existingMain = engine.getMainRoot(equivRoot)
  if (existingMain) {
    // 从原来的主字根中移除
    const oldEquivs = engine.getEquivalentRoots(existingMain).filter(r => r !== equivRoot)
    engine.setEquivalentRoots(existingMain, oldEquivs)
  }

  engine.setEquivalentRoots(mainRoot, [...current, equivRoot])
  refreshStats()
  toast(`已将 "${equivRoot}" 设为 "${mainRoot}" 的等效字根`)
}

// 从主字根移除等效字根
function removeFromEquivRoots(mainRoot: string, equivRoot: string) {
  const current = engine.getEquivalentRoots(mainRoot)
  const updated = current.filter(r => r !== equivRoot)
  engine.setEquivalentRoots(mainRoot, updated)
  refreshStats()
  toast(`已移除等效字根 "${equivRoot}"`)
}

// 删除等效字根组
function deleteEquivGroup(mainRoot: string) {
  engine.equivalentRoots.delete(mainRoot)
  refreshStats()
  toast(`已删除 "${mainRoot}" 的等效字根组`)
}

// 拖拽开始
function onDragStart(root: string) {
  draggedRoot.value = root
}

// 拖拽结束
function onDragEnd() {
  draggedRoot.value = null
}

// 放置到主字根区域
function onDropToMain(mainRoot: string) {
  if (draggedRoot.value) {
    addToEquivRoots(mainRoot, draggedRoot.value)
    draggedRoot.value = null
  }
}

// 放置到选中的主字根区域
function onDropToSelected() {
  if (draggedRoot.value && selectedMainRoot.value) {
    addToEquivRoots(selectedMainRoot.value, draggedRoot.value)
    draggedRoot.value = null
  }
}

// 点击部件设为主字根
function onComponentClick(char: string) {
  // 检查是否已经是主字根
  if (engine.equivalentRoots.has(char)) {
    // 已经是主字根，选中它
    selectedMainRoot.value = char
    toast(`已选中主字根 "${char}"`)
    return
  }

  // 检查是否是其他主字根的等效字根
  const existingMain = engine.getMainRoot(char)
  if (existingMain) {
    // 是等效字根，切换选中主字根
    selectedMainRoot.value = existingMain
    toast(`"${char}" 是 "${existingMain}" 的等效字根，已选中该主字根`)
    return
  }

  // 创建新的等效字根组
  engine.setEquivalentRoots(char, [])
  selectedMainRoot.value = char
  refreshStats()
  toast(`已将 "${char}" 设为主字根，拖拽其他部件添加为等效字根`)
}

// 点击主字根编码区域开始编辑
function clickMainRootCode(mainRoot: string) {
  editingEquivRoot.value = mainRoot
  const code = engine.rootCodes.get(mainRoot)
  editingEquivCode.value = code ? codeToString(code) : ''
}

// 保存主字根编码
function saveEquivRootCode() {
  if (!editingEquivRoot.value) return

  // 使用 setRootCode 方法设置编码，自动同步归并字根编码
  engine.setRootCode(editingEquivRoot.value, editingEquivCode.value)
  editingEquivRoot.value = null
  editingEquivCode.value = ''
  refreshStats()
  toast('编码已更新')
}

// 取消编辑主字根编码
function cancelEquivRootCode() {
  editingEquivRoot.value = null
  editingEquivCode.value = ''
}

// 加载国标笔画五分类等效字根
function loadGBStrokeEquiv() {
  // 将国标笔画五分类等效字根加载到引擎
  for (const [mainRoot, equivs] of Object.entries(GB_STROKE_EQUIVALENT_ROOTS)) {
    engine.setEquivalentRoots(mainRoot, equivs)
  }
  refreshStats()
  toast('已加载国标笔画五分类等效字根')
}

// 关闭弹窗时重置状态
function onClose() {
  selectedMainRoot.value = null
  equivSearchQuery.value = ''
  editingEquivRoot.value = null
  editingEquivCode.value = ''
  emit('close')
}
</script>

<template>
  <ModalDialog :visible="visible" title="等效字根设置" @close="onClose">
    <div class="equiv-modal-content">
      <!-- 等效字根列表区域 -->
      <div class="equiv-list-section">
        <div class="equiv-list-header-row">
          <h4 class="section-title">等效字根列表</h4>
          <button class="btn btn-sm btn-info" @click="loadGBStrokeEquiv" title="加载国标笔画五分类：横竖撇捺折">
            加载国标笔画五分类
          </button>
        </div>
        <div class="equiv-list-header">
          <span class="col-main">主字根</span>
          <span class="col-equiv">等效根</span>
        </div>

        <!-- 当前选中主字根的放置区域 -->
        <div
          v-if="selectedMainRoot"
          class="drop-zone"
          :class="{ 'drag-over': draggedRoot }"
          @dragover.prevent
          @drop="onDropToSelected"
        >
          <div class="drop-zone-label">
            主字根：<strong>{{ selectedMainRoot }}</strong>
          </div>
          <div class="drop-zone-hint">
            拖拽部件到此处添加为等效字根
          </div>
        </div>

        <div class="equiv-list-body">
          <div
            v-for="item in equivalentRootsList"
            :key="item.mainRoot"
            class="equiv-item"
            :class="{ 'selected': selectedMainRoot === item.mainRoot }"
            @click="selectMainRoot(item.mainRoot)"
            @dragover.prevent
            @drop="onDropToMain(item.mainRoot)"
          >
            <div class="main-root">
              <span class="root-char" :class="getRootFontClass(item.mainRoot)">{{ displayRoot(item.mainRoot) }}</span>
              <template v-if="editingEquivRoot === item.mainRoot">
                <input
                  v-model="editingEquivCode"
                  class="equiv-code-input"
                  placeholder="编码"
                  maxlength="4"
                  @keyup.enter="saveEquivRootCode"
                  @keyup.esc="cancelEquivRootCode"
                  @click.stop
                />
                <button class="btn btn-xs" @click.stop="saveEquivRootCode">保存</button>
                <button class="btn btn-xs btn-ghost" @click.stop="cancelEquivRootCode">取消</button>
              </template>
              <span v-else class="root-code editable" @click.stop="clickMainRootCode(item.mainRoot)" title="点击编辑编码">
                {{ item.mainCode || '点击设置编码' }}
              </span>
            </div>
            <div class="equiv-roots">
              <span
                v-for="equiv in item.equivalents"
                :key="equiv"
                class="equiv-tag"
              >
                <span :class="getRootFontClass(equiv)">{{ displayRoot(equiv) }}</span>
                <button class="remove-btn" @click.stop="removeFromEquivRoots(item.mainRoot, equiv)">×</button>
              </span>
              <span v-if="item.equivalents.length === 0" class="empty-hint">拖拽添加</span>
            </div>
            <button class="delete-group-btn" @click.stop="deleteEquivGroup(item.mainRoot)" title="删除此组">删除</button>
          </div>
          <div v-if="equivalentRootsList.length === 0" class="empty-list">
            点击下方部件设为主字根
          </div>
        </div>
      </div>

      <!-- 部件选择区域 -->
      <div class="components-section">
        <div class="section-header">
          <h4 class="section-title">所有部件（点击或拖拽添加）</h4>
          <input
            v-model="equivSearchQuery"
            type="search"
            class="search-input-sm"
            placeholder="检索部件..."
          />
        </div>
        <div class="components-grid">
          <div
            v-for="comp in allComponentsList.slice(0, 200)"
            :key="comp.char"
            class="component-item"
            :class="{
              'is-main': comp.isMain,
              'is-equiv': comp.isEquiv,
              'is-braced': comp.isBraced
            }"
            :title="comp.isEquiv ? `等效于: ${comp.mainRoot}，拖拽到其他主字根可转移` : comp.isMain ? '已是主字根，拖拽其他部件添加为等效字根' : `${comp.strokeCount}画，点击设为主字根`"
            draggable="true"
            @click="onComponentClick(comp.char)"
            @dragstart="onDragStart(comp.char)"
            @dragend="onDragEnd"
          >
            <span :class="getRootFontClass(comp.char)">{{ displayRoot(comp.char) }}</span>
          </div>
        </div>
        <div class="components-hint">
          {{ selectedMainRoot ? `已选择主字根: ${selectedMainRoot}，拖拽其他部件添加为等效字根` : '点击部件设为主字根，然后拖拽其他部件添加为等效字根' }}
        </div>
      </div>
    </div>
  </ModalDialog>
</template>

<style scoped>
.equiv-modal-content {
  display: flex;
  gap: 20px;
  min-width: 700px;
  max-width: 90vw;
  max-height: 70vh;
}

.equiv-list-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 350px;
}

.equiv-list-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.equiv-list-header {
  display: flex;
  padding: 8px 12px;
  background: var(--bg3);
  border-radius: 6px 6px 0 0;
  font-size: 12px;
  color: var(--text2);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}

.col-main {
  width: 120px;
}

.col-equiv {
  flex: 1;
}

.drop-zone {
  padding: 12px;
  background: var(--primary-bg);
  border: 2px dashed var(--primary);
  border-radius: 8px;
  margin-bottom: 12px;
  text-align: center;
  transition: all 0.2s;
}

.drop-zone.drag-over {
  background: var(--primary);
  color: white;
}

.drop-zone-label {
  font-size: 13px;
  margin-bottom: 4px;
}

.drop-zone-hint {
  font-size: 12px;
  color: var(--text2);
}

.drop-zone.drag-over .drop-zone-hint {
  color: rgba(255, 255, 255, 0.8);
}

.equiv-list-body {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 0 0 6px 6px;
  border-top: none;
  max-height: 400px;
}

.equiv-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s;
}

.equiv-item:hover {
  background: var(--bg3);
}

.equiv-item.selected {
  background: var(--primary-bg);
}

.main-root {
  width: 120px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.root-char {
  font-size: 20px;
  width: 24px;
  text-align: center;
}

.root-code {
  font-family: monospace;
  font-size: 12px;
  color: var(--text2);
}

.root-code.editable {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg3);
}

.root-code.editable:hover {
  background: var(--primary-bg);
  color: var(--primary);
}

.equiv-code-input {
  width: 60px;
  padding: 2px 6px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
}

.equiv-roots {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.equiv-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: var(--success-bg, rgba(0, 180, 100, 0.1));
  color: var(--success);
  border-radius: 4px;
  font-size: 13px;
}

.remove-btn {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text3);
  cursor: pointer;
  border-radius: 50%;
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-btn:hover {
  background: var(--danger);
  color: white;
}

.empty-hint {
  font-size: 12px;
  color: var(--text3);
  font-style: italic;
}

.delete-group-btn {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--danger);
  background: transparent;
  border: 1px solid var(--danger);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
}

.equiv-item:hover .delete-group-btn {
  opacity: 1;
}

.delete-group-btn:hover {
  background: var(--danger);
  color: white;
}

.empty-list {
  padding: 40px;
  text-align: center;
  color: var(--text2);
  font-size: 13px;
}

.components-section {
  width: 300px;
  display: flex;
  flex-direction: column;
}

.section-header {
  margin-bottom: 12px;
}

.section-header .section-title {
  margin-bottom: 8px;
}

.search-input-sm {
  width: 100%;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
}

.search-input-sm:focus {
  outline: none;
  border-color: var(--primary);
}

.components-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
  gap: 6px;
  overflow-y: auto;
  max-height: 400px;
  padding: 4px;
}

.component-item {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.15s;
}

.component-item:hover {
  border-color: var(--primary);
  background: var(--primary-bg);
}

.component-item.is-main {
  background: var(--primary-bg);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 500;
}

.component-item.is-equiv {
  background: var(--success-bg, rgba(0, 180, 100, 0.1));
  border-color: var(--success);
  color: var(--success);
}

.component-item.is-braced {
  font-family: 'CHS-PUA', 'Noto Sans SC', sans-serif;
}

.components-hint {
  margin-top: 12px;
  padding: 10px;
  background: var(--bg3);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text2);
  text-align: center;
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

.btn-xs {
  padding: 2px 8px;
  font-size: 11px;
}

.btn-info {
  background: #1890ff;
  color: white;
}

.btn-info:hover {
  background: #40a9ff;
}

.btn-ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text);
}

.btn-ghost:hover {
  border-color: var(--primary);
  color: var(--primary);
}

/* PUA 字体样式 */
.pua-font {
  font-family: 'CHS-PUA', 'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', sans-serif !important;
}
</style>
