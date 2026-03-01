<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { RootCode, codeToString, parseCode } from '../../engine/config'

const { engine, toast, refreshStats, rootsVersion, saveCurrentConfig } = useEngine()

// 31键布局
const KEYBOARD_LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ['_'], // 空格键
]

// 当前选中的键位
const selectedKey = ref<string | null>(null)

// 获取某键位上的所有字根
const rootsOnKey = computed(() => {
  rootsVersion.value
  const result = new Map<string, { root: string; code: RootCode }[]>()

  // 初始化所有键位
  for (const row of KEYBOARD_LAYOUT) {
    for (const key of row) {
      result.set(key, [])
    }
  }

  // 遍历所有字根，按主键位分组
  for (const root of engine.roots) {
    let code = engine.rootCodes.get(root)
    // 如果没有编码，默认为 "d"
    if (!code) {
      code = { root, main: 'd' }
    }
    const mainKey = code.main.toLowerCase()
    if (result.has(mainKey)) {
      result.get(mainKey)!.push({ root, code })
    }
  }

  // 对每个键位内的字根排序
  for (const [key, roots] of result) {
    roots.sort((a, b) => a.root.localeCompare(b.root))
  }

  return result
})

// 当前选中键位的字根列表
const selectedRoots = computed(() => {
  if (!selectedKey.value) return []
  return rootsOnKey.value.get(selectedKey.value) || []
})

// 编辑相关
const editingRoot = ref<string | null>(null)
const editForm = ref({ root: '', code: '' })

function selectKey(key: string) {
  selectedKey.value = selectedKey.value === key ? null : key
}

function openEditModal(root: string) {
  editingRoot.value = root
  const code = engine.rootCodes.get(root)
  editForm.value = {
    root,
    code: code ? codeToString(code) : 'd',
  }
}

function closeEditModal() {
  editingRoot.value = null
}

function saveCode() {
  if (!editForm.value.root) {
    toast('请输入字根')
    return
  }
  if (!editForm.value.code || editForm.value.code.length < 1) {
    toast('请输入编码')
    return
  }

  const parsed = parseCode(editForm.value.code)
  engine.rootCodes.set(editForm.value.root, { root: editForm.value.root, ...parsed })

  // 确保字根在 roots 集合中
  engine.roots.add(editForm.value.root)

  closeEditModal()
  refreshStats()
  toast('编码已保存')
}

function removeRoot(root: string) {
  engine.rootCodes.delete(root)
  engine.roots.delete(root)
  refreshStats()
  toast(`已移除字根: ${root}`)
}

// 更新字根编码
function updateRootCode(root: string, newCode: string) {
  if (!newCode) return
  const parsed = parseCode(newCode)
  engine.rootCodes.set(root, { root, ...parsed })
  refreshStats()
}

// ============ 归并字根功能 ============

// 归并设置弹窗
const showMergeModal = ref(false)
const mergeForm = ref({
  targetRoot: '',    // 要归并的字根
  sourceRoot: '',    // 来源字根
})

// 归并字根列表（用于显示）
const mergedRootsList = computed(() => {
  rootsVersion.value
  const result: { target: string; source: string; sourceCode: string }[] = []
  for (const [target, source] of engine.mergedRoots) {
    const sourceCode = engine.rootCodes.get(source)
    result.push({
      target,
      source,
      sourceCode: sourceCode ? codeToString(sourceCode) : '',
    })
  }
  return result.sort((a, b) => a.target.localeCompare(b.target))
})

// 打开归并设置弹窗
function openMergeModal(targetRoot?: string) {
  mergeForm.value = {
    targetRoot: targetRoot || '',
    sourceRoot: '',
  }
  showMergeModal.value = true
}

// 执行归并
function applyMerge() {
  const { targetRoot, sourceRoot } = mergeForm.value
  
  if (!targetRoot) {
    toast('请输入要归并的字根')
    return
  }
  if (!sourceRoot) {
    toast('请输入来源字根')
    return
  }
  if (targetRoot === sourceRoot) {
    toast('目标字根和来源字根不能相同')
    return
  }
  
  // 检查来源字根是否有编码
  const sourceCode = engine.rootCodes.get(sourceRoot)
  if (!sourceCode) {
    toast(`来源字根「${sourceRoot}」没有编码，请先为其设置编码`)
    return
  }
  
  // 执行归并
  engine.setMergedRoot(targetRoot, sourceRoot)
  
  // 保存配置
  saveCurrentConfig()
  refreshStats()
  
  showMergeModal.value = false
  toast(`已将「${targetRoot}」归并到「${sourceRoot}」`)
}

// 取消归并
function removeMerge(targetRoot: string) {
  engine.removeMergedRoot(targetRoot)
  saveCurrentConfig()
  refreshStats()
  toast(`已取消「${targetRoot}」的归并`)
}

// 获取所有字根列表（用于选择来源字根）
const allRootsList = computed(() => {
  rootsVersion.value
  return [...engine.roots].sort()
})
</script>

<template>
  <div class="keyboard-container">
    <!-- 键盘区域 -->
    <div class="keyboard">
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
          <span v-if="rootsOnKey.get(key)?.length" class="key-count">
            {{ rootsOnKey.get(key)?.length }}
          </span>
        </div>
      </div>
      <!-- 空格键 -->
      <div class="keyboard-row space-row">
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
            {{ rootsOnKey.get('_')?.length }}
          </span>
        </div>
      </div>
    </div>

    <!-- 字根详情区域 -->
    <div v-if="selectedKey" class="roots-panel">
      <div class="roots-panel-header">
        <h3>键位 <strong>{{ selectedKey === '_' ? '空格' : selectedKey.toUpperCase() }}</strong> 的字根</h3>
        <div class="roots-panel-actions">
          <button class="btn btn-sm btn-purple" @click="openMergeModal()">归并设置</button>
          <span class="roots-count">{{ selectedRoots.length }} 个</span>
        </div>
      </div>
      
      <!-- 归并字根列表 -->
      <div v-if="mergedRootsList.length > 0" class="merged-roots-section">
        <div class="merged-roots-header">
          <span class="merged-label">归并字根</span>
          <span class="merged-count">{{ mergedRootsList.length }} 个</span>
        </div>
        <div class="merged-roots-list">
          <div v-for="item in mergedRootsList" :key="item.target" class="merged-item">
            <span class="merged-target">{{ item.target }}</span>
            <span class="merged-arrow">→</span>
            <span class="merged-source">{{ item.source }}</span>
            <span class="merged-code">({{ item.sourceCode.toUpperCase() }})</span>
            <button class="btn btn-sm btn-outline merged-remove" @click="removeMerge(item.target)">取消</button>
          </div>
        </div>
      </div>
      
      <div class="roots-list">
        <div
          v-for="item in selectedRoots"
          :key="item.root"
          class="root-item"
          :class="{ 'editing': editingRoot === item.root }"
        >
          <span class="root-char">{{ item.root }}</span>
          <input
            v-if="editingRoot === item.root"
            v-model="editForm.code"
            class="code-input"
            maxlength="10"
            placeholder="编码"
            @keyup.enter="saveCode"
            @keyup.esc="closeEditModal"
          />
          <span v-else class="root-code" @click="openEditModal(item.root)">
            <span class="main">{{ item.code.main.toUpperCase() }}</span>
            <span v-if="item.code.sub" class="sub">{{ item.code.sub }}</span>
            <span v-if="item.code.supplement" class="supplement">{{ item.code.supplement }}</span>
          </span>
          <div v-if="editingRoot === item.root" class="root-actions">
            <button class="btn btn-sm" @click="saveCode">保存</button>
            <button class="btn btn-sm btn-outline" @click="closeEditModal">取消</button>
          </div>
          <div v-else class="root-actions">
            <button class="btn btn-sm btn-outline" @click="openEditModal(item.root)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="removeRoot(item.root)">删除</button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 归并设置弹窗 -->
    <div v-if="showMergeModal" class="modal-overlay" @click.self="showMergeModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h3>归并字根设置</h3>
          <button class="modal-close" @click="showMergeModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc">将一个字根的编码设置为与另一个字根相同。归并后，两个字根将拥有相同的编码。</p>
          
          <div class="form-group">
            <label>要归并的字根</label>
            <input
              v-model="mergeForm.targetRoot"
              type="text"
              placeholder="输入要归并的字根"
              class="form-input"
            />
            <span class="form-hint">此字根将获得与来源字根相同的编码</span>
          </div>
          
          <div class="form-group">
            <label>来源字根（已有编码）</label>
            <input
              v-model="mergeForm.sourceRoot"
              type="text"
              placeholder="输入来源字根"
              class="form-input"
              list="roots-datalist"
            />
            <datalist id="roots-datalist">
              <option v-for="root in allRootsList" :key="root" :value="root" />
            </datalist>
            <span class="form-hint">此字根的编码将被复制到目标字根</span>
          </div>
          
          <div v-if="mergeForm.sourceRoot && engine.rootCodes.get(mergeForm.sourceRoot)" class="source-code-preview">
            <span class="preview-label">来源字根编码：</span>
            <span class="preview-code">{{ codeToString(engine.rootCodes.get(mergeForm.sourceRoot)!).toUpperCase() }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="showMergeModal = false">取消</button>
          <button class="btn btn-purple" @click="applyMerge">确认归并</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.keyboard {
  background: var(--bg2);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border);
}

.keyboard-row {
  display: flex;
  gap: 6px;
}

.key {
  flex: 1;
  height: 56px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.key:hover {
  border-color: var(--primary);
  background: var(--bg);
}

.key-populated {
  background: var(--primary-bg);
  border-color: var(--primary);
}

.key-selected {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.key-selected .key-count {
  background: rgba(255,255,255,0.2);
  color: white;
}

.key-label {
  font-size: 16px;
  font-weight: 600;
}

.key-count {
  font-size: 11px;
  background: var(--primary);
  color: white;
  padding: 1px 6px;
  border-radius: 10px;
}

/* 空格键 */
.space-row {
  margin-top: 4px;
}

.key-space {
  max-width: none;
  width: 100%;
  height: 44px;
  flex: none;
}

/* 字根面板 */
.roots-panel {
  flex: 1;
  background: var(--bg2);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
}

.roots-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
}

.roots-panel-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}

.roots-panel-header strong {
  color: var(--primary);
}

.roots-count {
  font-size: 12px;
  color: var(--text2);
}

.roots-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
}

.root-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  transition: all 0.15s ease;
}

.root-item.editing {
  border-color: var(--primary);
  background: var(--bg2);
}

.root-char {
  font-size: 20px;
  min-width: 28px;
  text-align: center;
}

.root-code {
  font-family: monospace;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  background: var(--bg3);
  border-radius: 4px;
  min-width: 40px;
  text-align: center;
  transition: background 0.15s ease;
}

.root-code:hover {
  background: var(--primary-bg);
}

.root-code .main { color: var(--primary); font-weight: 600; }
.root-code .sub { color: var(--primary); opacity: 0.7; }
.root-code .supplement { color: var(--success); }

.code-input {
  width: 80px;
  padding: 4px 8px;
  font-family: monospace;
  font-size: 13px;
  border: 1px solid var(--primary);
  border-radius: 4px;
  background: var(--bg);
}

.root-actions {
  display: flex;
  gap: 4px;
}

/* 面板头部操作区 */
.roots-panel-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 归并字根区块 */
.merged-roots-section {
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
  padding: 12px 16px;
}

.merged-roots-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.merged-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
}

.merged-count {
  font-size: 11px;
  color: var(--text2);
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
}

.merged-roots-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.merged-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg);
  border: 1px solid var(--purple);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
}

.merged-target {
  font-weight: 600;
  color: var(--purple);
}

.merged-arrow {
  color: var(--text2);
  font-size: 12px;
}

.merged-source {
  color: var(--primary);
}

.merged-code {
  font-family: monospace;
  font-size: 12px;
  color: var(--text2);
  background: var(--bg3);
  padding: 2px 6px;
  border-radius: 4px;
}

.merged-remove {
  font-size: 11px;
  padding: 2px 6px;
  margin-left: 4px;
}

/* 弹窗样式 */
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
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text2);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.modal-close:hover {
  color: var(--text);
}

.modal-body {
  padding: 20px;
}

.modal-desc {
  font-size: 13px;
  color: var(--text2);
  margin: 0 0 20px 0;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 15px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
}

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-top: 4px;
}

.source-code-preview {
  background: var(--primary-bg);
  border-radius: 6px;
  padding: 12px;
  margin-top: 16px;
}

.preview-label {
  font-size: 12px;
  color: var(--text2);
}

.preview-code {
  font-family: monospace;
  font-size: 18px;
  font-weight: 600;
  color: var(--primary);
  margin-left: 8px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}
</style>
