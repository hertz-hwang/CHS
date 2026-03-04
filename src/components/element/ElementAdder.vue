<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { codeToString } from '../../engine/config'
import { unicodeHex } from '../../engine/unicode'
import KeySelect from './KeySelect.vue'

const props = defineProps<{
  selectedElement?: string  // 当前选中元素
  selectedKey?: string      // 当前选中的键位（用于双击快速添加）
}>()

const emit = defineEmits<{
  (e: 'added'): void
  (e: 'close'): void
}>()

const {
  engine, toast, refreshStats, rootsVersion, saveCurrentConfig,
  bracedRootToPua, isBracedRoot
} = useEngine()

// 编码选择器状态（4位编码）
const codePositions = ref<string[]>(['', '', '', ''])

// 归并目标选择器状态
const mergeTarget = ref<string>('')

// 搜索关键词（用于归并目标选择）
const mergeSearchQuery = ref('')
const mergeSearchDebounced = ref('')

// 归并搜索下拉位置
const mergeDropdownPosition = ref<'below' | 'above'>('below')

// 关闭归并搜索下拉
function closeMergeDropdown() {
  mergeSearchQuery.value = ''
}

// 搜索防抖
let mergeSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(mergeSearchQuery, (val) => {
  if (mergeSearchTimer) clearTimeout(mergeSearchTimer)
  mergeSearchTimer = setTimeout(() => {
    mergeSearchDebounced.value = val
    // 检测下拉位置
    if (val.trim()) {
      checkMergeDropdownPosition()
    }
  }, 300)
})

// 检测归并下拉框位置
function checkMergeDropdownPosition() {
  setTimeout(() => {
    const wrapper = document.querySelector('.merge-input-wrapper')
    if (!wrapper) return
    
    const rect = wrapper.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const dropdownHeight = 150  // 下拉框最大高度
    
    // 如果下方空间不足，改为向上展开
    if (rect.bottom + dropdownHeight > viewportHeight - 20) {
      mergeDropdownPosition.value = 'above'
    } else {
      mergeDropdownPosition.value = 'below'
    }
  }, 0)
}

// 元素信息
const elementInfo = computed(() => {
  if (!props.selectedElement) return null
  const element = props.selectedElement
  const code = engine.rootCodes.get(element)
  const strokes = engine.getStrokes(element)
  
  // 检查是否是归并字根
  const isMerged = engine.isMergedRoot(element)
  const mergedFrom = engine.mergedRoots.get(element)
  
  // 检查是否是半归并字根
  const codeEquivs = engine.getCodeEquivalencesForRoot(element)
  const isCodeEquiv = codeEquivs.size > 0

  return {
    unicode: unicodeHex(element),
    strokeCount: engine.strokeCount(element),
    strokeCode: strokes.length > 0 ? strokes[0] : '',
    code: code ? codeToString(code) : '',
    isAdded: engine.roots.has(element),
    isMerged,
    mergedFrom,
    isCodeEquiv,
    codeEquivs,
    displayChar: bracedRootToPua(element),
    fontClass: isBracedRoot(element) ? 'pua-font' : ''
  }
})

// 判断是否为笔画编码搜索
function isStrokeCodeQuery(query: string): boolean {
  return /^[1-5]+$/.test(query)
}

// 归并目标搜索结果
const mergeSearchResults = computed(() => {
  rootsVersion.value
  const query = mergeSearchDebounced.value.trim().toLowerCase()
  if (!query) return []

  const results: { root: string; code: string }[] = []
  const strokeSearch = isStrokeCodeQuery(query)
  
  for (const [root, code] of engine.rootCodes) {
    if (!code || !code.main) continue
    if (root === props.selectedElement) continue  // 排除自己

    if (strokeSearch) {
      // 笔画编码搜索
      const strokes = engine.getStrokes(root)
      const strokeCode = strokes.length > 0 ? strokes[0] : ''
      if (strokeCode.includes(query)) {
        results.push({ root, code: codeToString(code) })
      }
    } else {
      // 汉字搜索
      if (root.toLowerCase().includes(query) || codeToString(code).toLowerCase().includes(query)) {
        results.push({ root, code: codeToString(code) })
      }
    }
  }

  // 笔画搜索时，完全匹配的排在前面
  if (strokeSearch) {
    results.sort((a, b) => {
      const strokesA = engine.getStrokes(a.root)
      const strokesB = engine.getStrokes(b.root)
      const codeA = strokesA.length > 0 ? strokesA[0] : ''
      const codeB = strokesB.length > 0 ? strokesB[0] : ''
      
      const exactMatchA = codeA === query ? 0 : 1
      const exactMatchB = codeB === query ? 0 : 1
      
      return exactMatchA - exactMatchB
    })
  }

  return results.slice(0, 20)
})

// 重置状态并初始化编码位置
watch(() => props.selectedElement, (element) => {
  mergeTarget.value = ''
  mergeSearchQuery.value = ''
  
  // 如果有选中的元素
  if (element) {
    // 检查是否是归并字根
    const mergedFrom = engine.mergedRoots.get(element)
    if (mergedFrom) {
      // 归并字根：显示源字根编码，但不可编辑
      const sourceCode = engine.rootCodes.get(mergedFrom)
      if (sourceCode) {
        const fullCode = (sourceCode.main || '') + (sourceCode.sub || '') + (sourceCode.supplement || '')
        codePositions.value = [
          fullCode[0] || '',
          fullCode[1] || '',
          fullCode[2] || '',
          fullCode[3] || ''
        ]
      } else {
        codePositions.value = ['', '', '', '']
      }
      return
    }
    
    // 检查是否是半归并字根
    const codeEquivs = engine.getCodeEquivalencesForRoot(element)
    if (codeEquivs.size > 0) {
      // 半归并字根：显示引用源字根码位
      codePositions.value = ['', '', '', '']
      // 获取当前编码长度
      const code = engine.rootCodes.get(element)
      const fullCode = code ? (code.main || '') + (code.sub || '') + (code.supplement || '') : ''
      
      for (let i = 0; i < 4; i++) {
        if (codeEquivs.has(i)) {
          // 有半归并引用，显示引用
          codePositions.value[i] = codeEquivs.get(i)!
        } else if (i < fullCode.length) {
          // 没有半归并引用但有编码，显示实际编码
          codePositions.value[i] = fullCode[i]
        }
      }
      return
    }
    
    // 普通字根：显示当前编码
    const code = engine.rootCodes.get(element)
    if (code) {
      const fullCode = (code.main || '') + (code.sub || '') + (code.supplement || '')
      codePositions.value = [
        fullCode[0] || '',
        fullCode[1] || '',
        fullCode[2] || '',
        fullCode[3] || ''
      ]
    } else {
      codePositions.value = ['', '', '', '']
    }
  } else {
    codePositions.value = ['', '', '', '']
  }
})

// 判断是否为码位引用（如 "白.0"）
function isCodeRef(value: string): boolean {
  return value.includes('.')
}

// 添加字根
function addElement() {
  if (!props.selectedElement) {
    toast('请先选择元素')
    return
  }

  const mainKey = codePositions.value[0]
  if (!mainKey) {
    toast('请选择主码（第一位）')
    return
  }

  // 收集所有码位引用，用于创建半归并
  const codeEquivalences: { targetIndex: number; sourceRef: string }[] = []
  const codeChars: string[] = []

  for (let i = 0; i < codePositions.value.length; i++) {
    const pos = codePositions.value[i]
    if (!pos) continue

    if (isCodeRef(pos)) {
      // 码位引用，解析并记录半归并关系
      const parsed = engine.parseCodeRef(pos)
      if (parsed) {
        const sourceCodeChar = engine.getRootCodeAt(parsed.root, parsed.codeIndex)
        if (sourceCodeChar) {
          codeChars.push(sourceCodeChar)
          codeEquivalences.push({
            targetIndex: i,
            sourceRef: pos
          })
        }
      }
    } else {
      // 直接键位
      codeChars.push(pos)
    }
  }

  const code = codeChars.join('')

  // 设置编码
  engine.setRootCode(props.selectedElement, code)

  // 设置半归并关系
  for (const equiv of codeEquivalences) {
    const targetRef = `${props.selectedElement}.${equiv.targetIndex}`
    engine.setCodeEquivalence(targetRef, equiv.sourceRef)
  }

  saveCurrentConfig()
  refreshStats()

  // 构建提示信息
  let msg = `已添加「${props.selectedElement}」→ ${code.toUpperCase()}`
  if (codeEquivalences.length > 0) {
    msg += `（含 ${codeEquivalences.length} 个半归并）`
  }
  toast(msg)
  emit('added')

  // 重置
  codePositions.value = ['', '', '', '']
}

// 快速添加到选中键位
function quickAddToKey() {
  if (!props.selectedElement) {
    toast('请先选择元素')
    return
  }
  if (!props.selectedKey) {
    toast('请先选择键位')
    return
  }

  engine.setRootCode(props.selectedElement, props.selectedKey)
  saveCurrentConfig()
  refreshStats()

  toast(`已添加「${props.selectedElement}」→ ${props.selectedKey.toUpperCase()}`)
  emit('added')
}

// 执行归并
function applyMerge() {
  if (!props.selectedElement) {
    toast('请先选择元素')
    return
  }
  if (!mergeTarget.value) {
    toast('请选择归并目标')
    return
  }

  engine.setMergedRoot(props.selectedElement, mergeTarget.value)
  saveCurrentConfig()
  refreshStats()

  toast(`已将「${props.selectedElement}」归并到「${mergeTarget.value}」`)
  emit('added')

  // 重置
  mergeTarget.value = ''
  mergeSearchQuery.value = ''
}

// 选择归并目标
function selectMergeTarget(root: string) {
  mergeTarget.value = root
  mergeSearchQuery.value = ''
}

// 显示元素
function displayElement(element: string): string {
  return bracedRootToPua(element)
}

// 获取字体类
function getFontClass(element: string): string {
  return isBracedRoot(element) ? 'pua-font' : ''
}

// 关闭面板
function closePanel() {
  emit('close')
}
</script>

<template>
  <div class="element-adder">
    <!-- 选中元素信息 -->
    <div v-if="selectedElement && elementInfo" class="selected-info">
      <div class="info-row">
        <span class="info-char" :class="elementInfo.fontClass">{{ elementInfo.displayChar }}</span>
        <span class="info-details">
          <span class="info-unicode">{{ elementInfo.unicode }}</span>
          <span class="info-stroke">{{ elementInfo.strokeCount }}画</span>
          <span v-if="elementInfo.code" class="info-code">{{ elementInfo.code.toUpperCase() }}</span>
          <span v-else class="info-no-code">未编码</span>
        </span>
        <button class="btn-close" @click="closePanel" title="关闭">×</button>
      </div>
    </div>
    <div v-else class="no-selection">
      点击上方元素池选择元素
    </div>

    <!-- 添加操作 -->
    <div v-if="selectedElement" class="operation-section">
      <!-- 已添加提示 -->
      <div v-if="elementInfo?.isAdded" class="already-added">
        <span class="added-tag">已添加</span>
        <span v-if="elementInfo.isMerged" class="merged-tag">归并于 {{ elementInfo.mergedFrom }}</span>
      </div>

      <!-- 快速添加到选中键位 -->
      <div v-if="selectedKey && !elementInfo?.isAdded" class="quick-add">
        <button class="btn btn-success btn-sm" @click="quickAddToKey">
          添加到「{{ selectedKey === '_' ? '空格' : selectedKey.toUpperCase() }}」键
        </button>
      </div>

      <!-- 添加编码 -->
      <div class="add-form" :class="{ 'disabled': elementInfo?.isMerged }">
        <div class="form-label">
          编码设置：
          <span v-if="elementInfo?.isMerged" class="disabled-hint">（归并字根不可编辑）</span>
        </div>
        <div class="code-inputs">
          <KeySelect
            v-model="codePositions[0]"
            :allow-empty="false"
            placeholder="主码"
            :disabled="elementInfo?.isMerged"
          />
          <KeySelect
            v-model="codePositions[1]"
            :allow-empty="true"
            placeholder="2码"
            :disabled="elementInfo?.isMerged"
          />
          <KeySelect
            v-model="codePositions[2]"
            :allow-empty="true"
            placeholder="3码"
            :disabled="elementInfo?.isMerged"
          />
          <KeySelect
            v-model="codePositions[3]"
            :allow-empty="true"
            placeholder="4码"
            :disabled="elementInfo?.isMerged"
          />
        </div>
        <div v-if="!elementInfo?.isMerged" class="form-hint">提示：选择「字根码位」可创建半归并关系</div>
        <button
          v-if="!elementInfo?.isMerged"
          class="btn btn-primary btn-sm"
          :disabled="!codePositions[0]"
          @click="addElement"
        >
          添加
        </button>
      </div>

      <!-- 归并操作 -->
      <div class="merge-form">
        <div class="form-label">归并至：</div>
        <div class="merge-input-wrapper" v-click-outside="closeMergeDropdown">
          <input
            v-model="mergeSearchQuery"
            type="search"
            class="merge-search-input"
            placeholder="搜索已有字根（支持笔画12345）..."
          />
          <div v-if="mergeSearchResults.length > 0 && mergeSearchQuery" class="merge-results" :class="mergeDropdownPosition">
            <div
              v-for="item in mergeSearchResults"
              :key="item.root"
              class="merge-result-item"
              @click="selectMergeTarget(item.root)"
            >
              <span class="result-root" :class="getFontClass(item.root)">{{ displayElement(item.root) }}</span>
              <span class="result-code">{{ item.code.toUpperCase() }}</span>
            </div>
          </div>
        </div>
        <div v-if="mergeTarget" class="merge-selected">
          已选：<strong :class="getFontClass(mergeTarget)">{{ displayElement(mergeTarget) }}</strong>
          <span class="selected-code">({{ codeToString(engine.rootCodes.get(mergeTarget)!).toUpperCase() }})</span>
        </div>
        <button
          class="btn btn-outline btn-sm"
          :disabled="!mergeTarget"
          @click="applyMerge"
        >
          归并
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.element-adder {
  padding: 12px;
  background: var(--bg3);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.selected-info {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-char {
  font-size: 24px;
  font-weight: 600;
}

.info-details {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--text2);
}

.info-unicode {
  font-family: monospace;
}

.info-code {
  color: var(--success);
  font-family: monospace;
  font-weight: 500;
}

.info-no-code {
  color: var(--text3);
}

.btn-close {
  width: 24px;
  height: 24px;
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

.btn-close:hover {
  background: var(--bg2);
  color: var(--text);
}

.no-selection {
  color: var(--text3);
  font-size: 13px;
  text-align: center;
  padding: 16px;
}

.already-added {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.added-tag {
  padding: 2px 8px;
  background: rgba(0, 180, 42, 0.15);
  color: var(--success);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.merged-tag {
  font-size: 12px;
  color: var(--text2);
}

.quick-add {
  margin-bottom: 12px;
}

.operation-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-label {
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 4px;
}

.disabled-hint {
  color: var(--text3);
  font-weight: normal;
}

.add-form.disabled {
  opacity: 0.6;
}

.add-form.disabled .form-label {
  color: var(--text3);
}

.form-hint {
  font-size: 11px;
  color: var(--text3);
  margin-top: 2px;
}

.add-form,
.merge-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.code-inputs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.code-inputs .key-select {
  flex: 1;
  min-width: 60px;
  max-width: 80px;
}

.merge-input-wrapper {
  position: relative;
}

.merge-search-input {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
}

.merge-results {
  position: absolute;
  left: 0;
  right: 0;
  max-height: 150px;
  overflow-y: auto;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  z-index: 10;
  box-shadow: var(--shadow2);
}

/* 默认在下方 */
.merge-results.below {
  top: 100%;
}

/* 上方空间不足时，显示在上方 */
.merge-results.above {
  bottom: 100%;
  top: auto;
}

.merge-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.merge-result-item:hover {
  background: var(--bg3);
}

.result-root {
  font-size: 16px;
}

.result-code {
  font-family: monospace;
  font-size: 12px;
  color: var(--success);
}

.merge-selected {
  font-size: 12px;
  color: var(--text);
}

.selected-code {
  color: var(--success);
  font-family: monospace;
}
</style>