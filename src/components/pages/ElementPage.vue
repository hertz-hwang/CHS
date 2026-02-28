<script setup lang="ts">
import { ref, computed } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { useEngine } from '../../composables/useEngine'
import { parseCode, codeToString, RootCode } from '../../engine/config'

const { engine, toast, refreshStats, rootsVersion } = useEngine()

// 31键布局
const KEYBOARD_LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ['_'], // 空格键
]

// 搜索相关
const searchQuery = ref('')

// 选中的键位
const selectedKey = ref<string | null>(null)

// 弹窗状态
const showAddModal = ref(false)
const addForm = ref({ root: '', code: '' })

// 编辑状态
const editingRoot = ref<string | null>(null)
const editCode = ref('')

// 字根列表选择状态
const selectedRootsSet = ref<Set<string>>(new Set())
const selectAll = ref(false)

// 字根列表检索
const rootListQuery = ref('')

// 判断输入是否为笔画编码
function isStrokeCodeQueryForRoot(query: string): boolean {
  return /^[1-5]+$/.test(query)
}

// 获取字根列表（按编码排序，支持检索过滤）
const allRootsList = computed(() => {
  rootsVersion.value
  const query = rootListQuery.value.trim()
  const strokeSearch = isStrokeCodeQueryForRoot(query)
  
  const list: { root: string; code: RootCode; codeStr: string; strokeCode: string }[] = []
  
  for (const root of engine.roots) {
    // 如果有检索词，进行过滤
    if (query) {
      if (strokeSearch) {
        // 按笔画编码检索
        const strokes = engine.getStrokes(root)
        const strokeCode = strokes.length > 0 ? strokes[0] : ''
        if (!strokeCode.includes(query)) continue
      } else {
        // 按汉字检索（支持搜索命名字根的花括号内容）
        const searchTarget = root.startsWith('{') && root.endsWith('}')
          ? root.slice(1, -1) + ' ' + root  // 同时搜索去括号版本和原版
          : root
        if (!searchTarget.includes(query)) continue
      }
    }
    
    const code = engine.rootCodes.get(root)
    const strokes = engine.getStrokes(root)
    list.push({
      root,
      code: code || { root, main: '' },
      codeStr: code ? codeToString(code) : '',
      strokeCode: strokes.length > 0 ? strokes[0] : ''
    })
  }
  
  // 排序
  list.sort((a, b) => {
    // 有检索词时：完全匹配优先
    if (query) {
      const aExact = strokeSearch ? a.strokeCode === query : a.root === query
      const bExact = strokeSearch ? b.strokeCode === query : b.root === query
      if (aExact !== bExact) return aExact ? -1 : 1
    }
    // 按编码排序
    if (!a.codeStr && b.codeStr) return 1
    if (a.codeStr && !b.codeStr) return -1
    return a.codeStr.localeCompare(b.codeStr)
  })
  
  return list
})

// 全选/取消全选
function toggleSelectAll() {
  if (selectAll.value) {
    selectedRootsSet.value = new Set(allRootsList.value.map(r => r.root))
  } else {
    selectedRootsSet.value.clear()
  }
}

// 更新全选状态
function updateSelectAll() {
  selectAll.value = selectedRootsSet.value.size === allRootsList.value.length && allRootsList.value.length > 0
}

// 切换单个选择
function toggleRootSelect(root: string) {
  if (selectedRootsSet.value.has(root)) {
    selectedRootsSet.value.delete(root)
  } else {
    selectedRootsSet.value.add(root)
  }
  updateSelectAll()
}

// 批量删除选中的字根
function deleteSelectedRoots() {
  if (selectedRootsSet.value.size === 0) {
    toast('请先选择要删除的字根')
    return
  }
  
  const count = selectedRootsSet.value.size
  for (const root of selectedRootsSet.value) {
    engine.rootCodes.delete(root)
    engine.roots.delete(root)
  }
  
  selectedRootsSet.value.clear()
  selectAll.value = false
  refreshStats()
  toast(`已删除 ${count} 个字根`)
}

// 点击字根编辑编码
function clickRootToEdit(root: string) {
  editingRoot.value = root
  const code = engine.rootCodes.get(root)
  editCode.value = code ? codeToString(code) : ''
}

// 获取某键位上的所有字根及其编码
const rootsOnKey = computed(() => {
  rootsVersion.value
  const result = new Map<string, { root: string; code: RootCode; subCode: string }[]>()

  // 初始化所有键位
  for (const row of KEYBOARD_LAYOUT) {
    for (const key of row) {
      result.set(key, [])
    }
  }

  // 遍历所有字根
  for (const root of engine.roots) {
    const code = engine.rootCodes.get(root)
    if (code && code.main) {
      const mainKey = code.main.toLowerCase()
      if (result.has(mainKey)) {
        // 计算后续编码（除首码外的部分）
        const subCode = (code.sub || '') + (code.supplement || '')
        result.get(mainKey)!.push({ root, code, subCode })
      }
    }
  }

  // 排序
  for (const [key, roots] of result) {
    roots.sort((a, b) => a.root.localeCompare(b.root))
  }

  return result
})

// 当前选中键位的字根
const selectedRoots = computed(() => {
  if (!selectedKey.value) return []
  return rootsOnKey.value.get(selectedKey.value) || []
})

// 判断输入是否为笔画编码（仅包含1-5的数字）
function isStrokeCodeQuery(query: string): boolean {
  return /^[1-5]+$/.test(query)
}

// 字符类型枚举
type CharType = 'ids' | 'named' | 'atomic'

// 搜索汉字（智能识别：汉字或笔画编码）
// 支持三种类型：IDS所有汉字、IDS转换器字根（命名字根）、原子字根
const searchResults = computed(() => {
  rootsVersion.value  // 触发响应式更新
  const query = searchQuery.value.trim()
  if (!query) return []

  const results: { root: string; code: RootCode; isAdded: boolean; strokeCount: number; strokeCode: string; charType: CharType }[] = []
  
  // 判断是笔画编码搜索还是汉字搜索
  const strokeCodeSearch = isStrokeCodeQuery(query)
  
  // 收集所有待搜索的字符及其类型
  const allChars = new Map<string, CharType>()
  
  // 1. IDS 所有汉字
  for (const char of engine.getCharset()) {
    if (!allChars.has(char)) {
      allChars.set(char, 'ids')
    }
  }
  
  // 2. IDS 转换器字根（命名字根）
  for (const root of engine.roots) {
    if (!allChars.has(root)) {
      allChars.set(root, 'named')
    }
  }
  // 命名字根定义中的字根
  for (const root of engine.namedRoots.keys()) {
    if (!allChars.has(root)) {
      allChars.set(root, 'named')
    }
  }
  // 转换器规则中的命名字根
  if (engine.transformer) {
    for (const root of engine.transformer.getNamedRoots()) {
      if (!allChars.has(root)) {
        allChars.set(root, 'named')
      }
    }
  }
  
  // 3. 原子字根
  for (const root of engine.atomicComponents()) {
    if (!allChars.has(root)) {
      allChars.set(root, 'atomic')
    }
  }
  
  // 搜索所有字符
  for (const [char, charType] of allChars) {
    let match = false
    
    if (strokeCodeSearch) {
      // 按笔画编码搜索（12345代表横竖撇捺折）
      const strokes = engine.getStrokes(char)
      // 取第一个笔画编码（大陆标准）
      const strokeCode = strokes.length > 0 ? strokes[0] : ''
      if (strokeCode.includes(query)) {
        match = true
      }
    } else {
      // 按汉字搜索（支持搜索命名字根的花括号内容）
      // 例如搜索"在字框"也能匹配到"{在字框}"
      const searchTarget = char.startsWith('{') && char.endsWith('}') 
        ? char.slice(1, -1) + ' ' + char  // 同时搜索去括号版本和原版
        : char
      if (searchTarget.includes(query)) {
        match = true
      }
    }
    
    if (match) {
      const code = engine.rootCodes.get(char)
      const strokes = engine.getStrokes(char)
      results.push({ 
        root: char, 
        code: code || { root: char, main: '' },
        isAdded: engine.roots.has(char),
        strokeCount: engine.strokeCount(char),
        strokeCode: strokes.length > 0 ? strokes[0] : '',
        charType
      })
    }
  }

  // 排序：完全匹配优先，然后按类型（命名字根 > 原子字根 > IDS汉字），再按字频降序
  results.sort((a, b) => {
    // 完全匹配排最前
    const aExact = strokeCodeSearch ? a.strokeCode === query : a.root === query || a.root === `{${query}}`
    const bExact = strokeCodeSearch ? b.strokeCode === query : b.root === query || b.root === `{${query}}`
    if (aExact !== bExact) return aExact ? -1 : 1
    // 按类型排序：命名字根 > 原子字根 > IDS汉字
    const typeOrder: Record<CharType, number> = { named: 0, atomic: 1, ids: 2 }
    const typeCmp = typeOrder[a.charType] - typeOrder[b.charType]
    if (typeCmp !== 0) return typeCmp
    // 按字频降序
    const freqA = engine.freq.get(a.root) || 0
    const freqB = engine.freq.get(b.root) || 0
    return freqB - freqA
  })

  return results.slice(0, 50)
})

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

// 选择键位
function selectKey(key: string) {
  selectedKey.value = selectedKey.value === key ? null : key
}

// 打开添加弹窗
function openAddModal() {
  addForm.value = { root: '', code: '' }
  showAddModal.value = true
}

// 添加字根
function addRoot() {
  if (!addForm.value.root) {
    toast('请输入字根')
    return
  }
  if (!addForm.value.code || addForm.value.code.length < 1) {
    toast('请输入编码')
    return
  }

  const root = addForm.value.root
  const parsed = parseCode(addForm.value.code)
  
  engine.rootCodes.set(root, { root, ...parsed })
  engine.roots.add(root)
  
  showAddModal.value = false
  refreshStats()
  toast(`已添加字根: ${root}`)
}

// 开始编辑
function startEdit(root: string) {
  editingRoot.value = root
  const code = engine.rootCodes.get(root)
  editCode.value = code ? codeToString(code) : ''
}

// 保存编辑
function saveEdit() {
  if (!editingRoot.value || !editCode.value) return
  
  const parsed = parseCode(editCode.value)
  engine.rootCodes.set(editingRoot.value, { root: editingRoot.value, ...parsed })
  editingRoot.value = null
  refreshStats()
  toast('编码已更新')
}

// 取消编辑
function cancelEdit() {
  editingRoot.value = null
}

// 删除字根
function deleteRoot(root: string) {
  engine.rootCodes.delete(root)
  engine.roots.delete(root)
  refreshStats()
  toast(`已删除字根: ${root}`)
}

// 初始化原子字根
function initAtomic() {
  if (!engine.decomp.size) {
    toast('请先加载数据')
    return
  }
  
  engine.useAtomicRoots()
  refreshStats()
  toast(`已初始化 ${engine.roots.size} 个原子字根`)
}

// 从搜索结果点击（点击添加字根）
function clickSearchResult(root: string, isAdded: boolean) {
  if (isAdded) {
    // 已添加的字根，跳转到对应键位
    const code = engine.rootCodes.get(root)
    if (code && code.main) {
      selectedKey.value = code.main.toLowerCase()
    }
  } else {
    // 未添加的字根，打开添加弹窗
    addForm.value = { root, code: '' }
    showAddModal.value = true
  }
  searchQuery.value = ''
}

// 从搜索结果删除字根
function removeRootFromSearch(root: string) {
  engine.rootCodes.delete(root)
  engine.roots.delete(root)
  refreshStats()
  toast(`已删除字根: ${root}`)
}
</script>

<template>
  <div class="element-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">⌨️ 字根管理</span>
        <span class="count">{{ statsInfo.total }} 字根</span>
        <span class="encoded-info">已编码: {{ statsInfo.encoded }}</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm btn-success" @click="initAtomic">初始化原子字根</button>
        <button class="btn btn-sm btn-purple" @click="openAddModal">+ 添加字根</button>
      </div>
    </div>

    <!-- 搜索区域 -->
    <div class="search-bar">
      <input 
        v-model="searchQuery"
        type="search"
        class="search-input"
        placeholder="输入汉字搜索，或输入笔画编码（12345=横竖撇捺折）"
      />
      <!-- 搜索结果 -->
      <div v-if="searchResults.length > 0" class="search-results">
        <div 
          v-for="item in searchResults" 
          :key="item.root" 
          class="search-result-item"
          :class="{ 'is-added': item.isAdded }"
          @click="clickSearchResult(item.root, item.isAdded)"
        >
          <span class="result-root">{{ item.root }}</span>
          <span class="result-info">
            <span class="char-type-tag" :class="'type-' + item.charType">
              {{ item.charType === 'named' ? '命名' : item.charType === 'atomic' ? '原子' : 'IDS' }}
            </span>
            <span v-if="item.strokeCount" class="stroke">{{ item.strokeCount }}画</span>
            <span v-if="item.code.main" class="result-code">
              <span class="main">{{ item.code.main?.toUpperCase() }}</span>
              <span v-if="item.code.sub" class="sub">{{ item.code.sub }}</span>
              <span v-if="item.code.supplement" class="supplement">{{ item.code.supplement }}</span>
            </span>
            <span v-else class="no-code-hint">未编码</span>
          </span>
          <span class="result-action">
            <template v-if="item.isAdded">
              <span class="added-tag">已添加</span>
              <button class="btn-remove" @click.stop="removeRootFromSearch(item.root)">删除</button>
            </template>
            <span v-else class="add-hint">点击添加</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 键盘区域 -->
      <div class="keyboard-section">
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
                  <span class="root-text">{{ item.root }}</span>
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
        
        <!-- 字根列表容器 -->
        <div class="roots-container">
          <div class="roots-container-header">
            <div class="header-row">
              <input 
                v-model="rootListQuery"
                type="search"
                class="root-search-input"
                placeholder="检索字根（汉字/笔顺编码）"
              />
            </div>
            <div class="header-row">
              <div class="header-left">
                <input 
                  type="checkbox" 
                  v-model="selectAll" 
                  @change="toggleSelectAll"
                  class="checkbox"
                />
                <span class="select-label">全选</span>
                <span v-if="selectedRootsSet.size > 0" class="selected-count">
                  已选 {{ selectedRootsSet.size }} 项
                </span>
                <span v-if="rootListQuery" class="filter-count">
                  {{ allRootsList.length }} / {{ engine.roots.size }}
                </span>
              </div>
              <div class="header-right">
                <button 
                  v-if="selectedRootsSet.size > 0" 
                  class="btn btn-sm btn-danger" 
                  @click="deleteSelectedRoots"
                >
                  删除选中
                </button>
              </div>
            </div>
          </div>
          <div class="roots-container-body">
            <div 
              v-for="item in allRootsList" 
              :key="item.root" 
              class="root-grid-item"
              :class="{ 
                'selected': selectedRootsSet.has(item.root),
                'editing': editingRoot === item.root
              }"
            >
              <input 
                type="checkbox"
                :checked="selectedRootsSet.has(item.root)"
                @change="toggleRootSelect(item.root)"
                @click.stop
                class="checkbox"
              />
              <span class="root-char" @click="clickRootToEdit(item.root)">{{ item.root }}</span>
              <template v-if="editingRoot === item.root">
                <input 
                  v-model="editCode"
                  class="edit-code-input"
                  placeholder="编码"
                  maxlength="4"
                  @keyup.enter="saveEdit"
                  @keyup.esc="cancelEdit"
                  @click.stop
                />
                <button class="btn btn-sm" @click.stop="saveEdit">保存</button>
                <button class="btn btn-sm btn-ghost" @click.stop="cancelEdit">取消</button>
              </template>
              <span v-else class="root-code" @click="clickRootToEdit(item.root)">
                {{ item.codeStr || '-' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 字根详情面板 -->
      <div v-if="selectedKey" class="roots-panel">
        <div class="panel-header">
          <h3>
            键位 <strong>{{ selectedKey === '_' ? '空格' : selectedKey.toUpperCase() }}</strong>
          </h3>
          <span class="count">{{ selectedRoots.length }} 个字根</span>
        </div>
        <div class="roots-list">
          <div 
            v-for="item in selectedRoots" 
            :key="item.root" 
            class="root-item"
            :class="{ 'editing': editingRoot === item.root }"
          >
            <span class="root-char">{{ item.root }}</span>
            
            <!-- 编辑模式 -->
            <template v-if="editingRoot === item.root">
              <input 
                v-model="editCode"
                class="edit-input"
                placeholder="编码"
                maxlength="10"
                @keyup.enter="saveEdit"
                @keyup.esc="cancelEdit"
              />
              <button class="btn btn-sm" @click="saveEdit">保存</button>
              <button class="btn btn-sm btn-ghost" @click="cancelEdit">取消</button>
            </template>
            
            <!-- 显示模式 -->
            <template v-else>
              <span class="root-code-display" @click="startEdit(item.root)">
                <span class="main">{{ item.code.main?.toUpperCase() }}</span>
                <span v-if="item.code.sub" class="sub">{{ item.code.sub }}</span>
                <span v-if="item.code.supplement" class="supplement">{{ item.code.supplement }}</span>
              </span>
              <button class="btn btn-sm btn-ghost" @click="startEdit(item.root)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="deleteRoot(item.root)">删除</button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 添加字根弹窗 -->
  <ModalDialog :visible="showAddModal" title="添加字根" @close="showAddModal = false">
    <div class="add-form">
      <div class="form-row">
        <label>字根</label>
        <input v-model="addForm.root" type="text" placeholder="输入字根字符" />
      </div>
      <div class="form-row">
        <label>编码</label>
        <input v-model="addForm.code" type="text" maxlength="10" placeholder="如: dkbi" />
        <small>首字符为键位，最多4位编码</small>
      </div>
      <div v-if="addForm.code" class="code-preview">
        预览：
        <span class="key-hint">{{ addForm.code[0]?.toUpperCase() || '?' }}</span> 键 →
        <span class="root-preview">{{ addForm.root || '?' }}</span>
        <span v-if="addForm.code.length > 1" class="code-preview-sub">{{ addForm.code.slice(1) }}</span>
      </div>
    </div>
    <template #actions>
      <button class="btn btn-ghost" @click="showAddModal = false">取消</button>
      <button class="btn btn-success" @click="addRoot">添加</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.element-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 20px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 16px;
  font-weight: 600;
}

.count {
  font-size: 13px;
  color: var(--text2);
  background: var(--bg3);
  padding: 4px 10px;
  border-radius: 4px;
}

.encoded-info {
  font-size: 13px;
  color: var(--success);
  background: rgba(0, 180, 42, 0.15);
  padding: 4px 10px;
  border-radius: 4px;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.search-bar {
  position: relative;
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.search-type {
  width: 90px;
}

.search-input {
  flex: 1;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: var(--shadow2);
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
}

.search-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.search-result-item:hover {
  background: var(--bg3);
}

.result-root {
  font-size: 18px;
}

.result-code {
  font-family: monospace;
  font-size: 13px;
}

.result-code .main {
  color: var(--primary);
  font-weight: 600;
}

.result-code .sub {
  color: var(--primary);
  opacity: 0.7;
}

.result-code .supplement {
  color: var(--success);
}

.result-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stroke {
  font-size: 12px;
  color: var(--text2);
  background: var(--bg3);
  padding: 2px 6px;
  border-radius: 4px;
}

.no-code-hint {
  font-size: 12px;
  color: var(--text3);
}

/* 字符类型标签样式 */
.char-type-tag {
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 500;
}

.char-type-tag.type-named {
  background: rgba(114, 46, 209, 0.15);
  color: #722ed1;
}

.char-type-tag.type-atomic {
  background: rgba(19, 194, 194, 0.15);
  color: #13c2c2;
}

.char-type-tag.type-ids {
  background: rgba(245, 166, 35, 0.15);
  color: #f5a623;
}

.result-action {
  font-size: 12px;
}

.added-tag {
  color: var(--success);
  background: rgba(0, 180, 42, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
}

.add-hint {
  color: var(--primary);
}

.btn-remove {
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  background: rgba(245, 63, 63, 0.15);
  color: var(--danger);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-remove:hover {
  background: var(--danger);
  color: white;
}

.search-result-item.is-added {
  background: var(--bg3);
}

.search-result-item.is-added:hover {
  background: var(--bg);
}

.main-content {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.keyboard-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.keyboard {
  background: var(--bg2);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  width: 100%;
}

.roots-panel {
  width: 320px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
}

.panel-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}

.panel-header strong {
  color: var(--primary);
}

.roots-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.root-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  transition: all 0.15s ease;
}

.root-item.editing {
  border-color: var(--primary);
  background: var(--bg2);
}

.root-char {
  font-size: 20px;
  min-width: 32px;
  text-align: center;
}

.root-code-display {
  flex: 1;
  font-family: monospace;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  background: var(--bg3);
  border-radius: 4px;
}

.root-code-display:hover {
  background: var(--primary-bg);
}

.root-code-display .main {
  color: var(--primary);
  font-weight: 600;
}

.root-code-display .sub {
  color: var(--primary);
  opacity: 0.7;
}

.root-code-display .supplement {
  color: var(--success);
}

.edit-input {
  width: 80px;
  font-family: monospace;
}

.add-form {
  min-width: 300px;
}

.form-row {
  margin-bottom: 12px;
}

.form-row label {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 4px;
}

.form-row input {
  width: 100%;
}

.form-row small {
  display: block;
  font-size: 11px;
  color: var(--text3);
  margin-top: 4px;
}

.code-preview {
  padding: 12px;
  background: var(--bg3);
  border-radius: 6px;
  font-size: 14px;
}

.key-hint {
  font-weight: 600;
  color: var(--primary);
}

.root-preview {
  font-size: 18px;
}

.code-preview-sub {
  color: var(--success);
  font-family: monospace;
}

/* 字根列表容器 */
.roots-container {
  margin-top: 16px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  max-height: 300px;
}

.roots-container-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.root-search-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.3s ease;
}

.root-search-input:focus {
  border-color: var(--primary);
}

.filter-count {
  font-size: 12px;
  color: var(--text2);
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.select-label {
  font-size: 13px;
  color: var(--text2);
}

.selected-count {
  font-size: 12px;
  color: var(--primary);
  background: var(--primary-bg);
  padding: 2px 8px;
  border-radius: 4px;
}

.roots-container-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
}

.root-grid-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  transition: all 0.15s ease;
}

.root-grid-item:hover {
  border-color: var(--primary);
}

.root-grid-item.selected {
  background: var(--primary-bg);
  border-color: var(--primary);
}

.root-grid-item.editing {
  border-color: var(--primary);
  background: var(--bg2);
}

.root-grid-item .root-char {
  font-size: 16px;
  cursor: pointer;
  min-width: 24px;
}

.root-grid-item .root-code {
  font-family: monospace;
  font-size: 12px;
  color: var(--primary);
  cursor: pointer;
  padding: 2px 4px;
  background: var(--bg3);
  border-radius: 3px;
}

.root-grid-item .root-code:hover {
  background: var(--primary-bg);
}

.edit-code-input {
  width: 60px;
  font-family: monospace;
  font-size: 12px;
  padding: 2px 4px;
}
</style>
