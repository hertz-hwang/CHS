<script setup lang="ts">
import { ref, computed } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { useEngine } from '../../composables/useEngine'
import { parseCode, codeToString, RootCode } from '../../engine/config'
import { GB_STROKE_EQUIVALENT_ROOTS } from '../../engine/engine'

const { engine, toast, refreshStats, rootsVersion, saveCurrentConfig } = useEngine()

// 归并字根相关状态
const showMergeModal = ref(false)
const mergeForm = ref({
  targetRoot: '',
  sourceRoot: '',
})

// 码位等值相关状态
const mergeModalTab = ref<'merge' | 'codeEquiv'>('merge')
const codeEquivForm = ref({
  targetRef: '',  // 如 "目.1"
  sourceRef: '',  // 如 "日.1"
})

// 等效字根相关状态
const showEquivModal = ref(false)
const equivSearchQuery = ref('')
const selectedMainRoot = ref<string | null>(null)
const draggedRoot = ref<string | null>(null)
const editingEquivRoot = ref<string | null>(null)
const editingEquivCode = ref('')

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
  // 检查是否可以编辑（整字归并检查）
  const editCheck = canEditRoot(root)
  if (!editCheck.canEdit) {
    toast(editCheck.reason)
    return
  }
  
  // 检查是否有码位等值限制
  const restrictedIndices = getRestrictedCodeIndices(root)
  if (restrictedIndices.length > 0) {
    // 允许编辑，但提示用户有码位限制
    const positions = restrictedIndices.map(i => formatCodeIndex(i)).join('、')
    toast(`注意：${positions}已设置码位等值，修改将被阻止`)
  }
  
  editingRoot.value = root
  const code = engine.rootCodes.get(root)
  editCode.value = code ? codeToString(code) : ''
}

// 获取某键位上的所有字根及其编码（排除归并字根）
const rootsOnKey = computed(() => {
  rootsVersion.value
  const result = new Map<string, { root: string; code: RootCode; subCode: string }[]>()

  // 初始化所有键位
  for (const row of KEYBOARD_LAYOUT) {
    for (const key of row) {
      result.set(key, [])
    }
  }

  // 遍历所有字根（排除归并字根）
  for (const root of engine.roots) {
    // 跳过归并字根（归并字根只显示在右侧面板的归并区域）
    if (engine.isMergedRoot(root)) continue
    
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
  // 检查是否可以编辑（整字归并检查）
  const editCheck = canEditRoot(root)
  if (!editCheck.canEdit) {
    toast(editCheck.reason)
    return
  }
  
  editingRoot.value = root
  const code = engine.rootCodes.get(root)
  editCode.value = code ? codeToString(code) : ''
}

// 保存编辑
function saveEdit() {
  if (!editingRoot.value || !editCode.value) return
  
  const root = editingRoot.value
  
  // 检查整字归并限制
  const editCheck = canEditRoot(root)
  if (!editCheck.canEdit) {
    toast(editCheck.reason)
    cancelEdit()
    return
  }
  
  // 检查码位等值限制
  const restrictedPositions = getRestrictedPositions(root, editCode.value.length)
  if (restrictedPositions.length > 0) {
    // 获取旧编码
    const oldCode = engine.rootCodes.get(root)
    const oldCodeStr = oldCode ? codeToString(oldCode) : ''
    
    // 检查每个受限位置是否被修改
    for (const pos of restrictedPositions) {
      const oldChar = oldCodeStr[pos.index] || ''
      const newChar = editCode.value[pos.index] || ''
      
      if (oldChar !== newChar) {
        toast(`${formatCodeIndex(pos.index)}已设置为等于「${pos.source}」，无法修改。如需修改，请先取消码位等值设置。`)
        return
      }
    }
  }
  
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

// ============ 等效字根相关方法 ============

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

// 判断是否是花括号字根
function isBracedRoot(char: string): boolean {
  return char.startsWith('{') && char.endsWith('}')
}

// 所有部件列表（按笔画数升序，支持检索）
const allComponentsList = computed(() => {
  rootsVersion.value
  const query = equivSearchQuery.value.trim()
  const components = engine.atomicComponents()
  
  const list: { char: string; strokeCount: number; isMain: boolean; isEquiv: boolean; mainRoot?: string; isBraced: boolean }[] = []
  
  for (const char of components) {
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

// 打开等效字根弹窗
function openEquivModal() {
  showEquivModal.value = true
  selectedMainRoot.value = null
  equivSearchQuery.value = ''
}

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
  
  const parsed = parseCode(editingEquivCode.value)
  engine.rootCodes.set(editingEquivRoot.value, { root: editingEquivRoot.value, ...parsed })
  engine.roots.add(editingEquivRoot.value)
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

// ============ 归并字根相关方法 ============

// 归并字根列表（用于显示 - 全部）
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

// 当前键位的归并字根列表（只显示当前键位相关的）
const mergedRootsOnKey = computed(() => {
  if (!selectedKey.value) return []
  const key = selectedKey.value
  
  const result: { target: string; source: string; sourceCode: string }[] = []
  for (const [target, source] of engine.mergedRoots) {
    // 获取目标字根的编码（首码）
    const targetCode = engine.rootCodes.get(target)
    if (targetCode && targetCode.main) {
      // 只显示首码与当前选中键位匹配的归并字根
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

// 当前键位的码位等值列表（只显示当前键位相关的）
const codeEquivalencesOnKey = computed(() => {
  if (!selectedKey.value) return []
  const key = selectedKey.value
  
  const result: { targetRef: string; sourceRef: string; targetCode: string; sourceCode: string }[] = []
  for (const [targetRef, sourceRef] of engine.codeEquivalences) {
    const targetParsed = engine.parseCodeRef(targetRef)
    const sourceParsed = engine.parseCodeRef(sourceRef)
    
    if (targetParsed && sourceParsed) {
      // 获取目标字根的编码（首码）
      const targetRootCode = engine.rootCodes.get(targetParsed.root)
      if (targetRootCode && targetRootCode.main) {
        // 只显示首码与当前选中键位匹配的码位等值
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
const allRootsForMerge = computed(() => {
  rootsVersion.value
  return [...engine.roots].sort()
})

// ============ 编辑限制相关方法 ============

// 检查字根是否被整字归并
function isMergedRoot(root: string): boolean {
  return engine.mergedRoots.has(root)
}

// 获取字根的归并来源
function getMergedSource(root: string): string | undefined {
  return engine.mergedRoots.get(root)
}

// 获取字根被限制编辑的码位索引列表（由于码位等值）
function getRestrictedCodeIndices(root: string): number[] {
  const indices: number[] = []
  for (const [targetRef] of engine.codeEquivalences) {
    const parsed = engine.parseCodeRef(targetRef)
    if (parsed && parsed.root === root) {
      indices.push(parsed.codeIndex)
    }
  }
  return indices
}

// 检查字根是否可以编辑（考虑整字归并和码位等值）
function canEditRoot(root: string): { canEdit: boolean; reason: string } {
  // 检查整字归并
  if (isMergedRoot(root)) {
    const source = getMergedSource(root)
    return { 
      canEdit: false, 
      reason: `此字根已归并到「${source}」，无法修改编码。如需修改，请先取消归并设置。` 
    }
  }
  return { canEdit: true, reason: '' }
}

// 检查编码字符串中哪些位置被限制编辑
function getRestrictedPositions(root: string, codeLength: number): { index: number; source: string }[] {
  const restricted: { index: number; source: string }[] = []
  for (const [targetRef, sourceRef] of engine.codeEquivalences) {
    const targetParsed = engine.parseCodeRef(targetRef)
    if (targetParsed && targetParsed.root === root) {
      restricted.push({
        index: targetParsed.codeIndex,
        source: sourceRef
      })
    }
  }
  return restricted
}

// 格式化码位索引为"第N码"
function formatCodeIndex(index: number): string {
  return `第${index + 1}码`
}

// ============ 码位等值相关方法 ============

// 码位等值列表（用于显示）
const codeEquivalencesList = computed(() => {
  rootsVersion.value
  const result: { targetRef: string; sourceRef: string; targetCode: string; sourceCode: string }[] = []
  for (const [targetRef, sourceRef] of engine.codeEquivalences) {
    const targetParsed = engine.parseCodeRef(targetRef)
    const sourceParsed = engine.parseCodeRef(sourceRef)
    
    if (targetParsed && sourceParsed) {
      const targetCode = engine.getRootCodeAt(targetParsed.root, targetParsed.codeIndex) || ''
      const sourceCode = engine.getRootCodeAt(sourceParsed.root, sourceParsed.codeIndex) || ''
      result.push({ targetRef, sourceRef, targetCode, sourceCode })
    }
  }
  return result.sort((a, b) => a.targetRef.localeCompare(b.targetRef))
})

// 执行码位等值
function applyCodeEquiv() {
  const { targetRef, sourceRef } = codeEquivForm.value
  
  if (!targetRef) {
    toast('请输入目标码位引用（如：目.1）')
    return
  }
  if (!sourceRef) {
    toast('请输入来源码位引用（如：日.1）')
    return
  }
  
  // 验证格式
  const targetParsed = engine.parseCodeRef(targetRef)
  const sourceParsed = engine.parseCodeRef(sourceRef)
  
  if (!targetParsed) {
    toast('目标码位引用格式错误，正确格式：字根.索引（如：目.1）')
    return
  }
  if (!sourceParsed) {
    toast('来源码位引用格式错误，正确格式：字根.索引（如：日.1）')
    return
  }
  
  // 执行码位等值
  const success = engine.setCodeEquivalence(targetRef, sourceRef)
  
  if (success) {
    saveCurrentConfig()
    refreshStats()
    codeEquivForm.value = { targetRef: '', sourceRef: '' }
    toast(`已设置「${targetRef}」=「${sourceRef}」`)
  } else {
    toast('设置失败，请检查来源字根是否有编码')
  }
}

// 取消码位等值
function removeCodeEquiv(targetRef: string) {
  engine.removeCodeEquivalence(targetRef)
  saveCurrentConfig()
  refreshStats()
  toast(`已取消「${targetRef}」的码位等值`)
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
        <button class="btn btn-sm btn-info" @click="openEquivModal">等效字根设置</button>
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
          <div class="panel-header-actions">
            <button class="btn btn-sm btn-purple" @click="openMergeModal()">归并设置</button>
            <span class="count">{{ selectedRoots.length }} 个字根</span>
          </div>
        </div>
        
        <!-- 归并字根列表（只显示当前键位相关） -->
        <div v-if="mergedRootsOnKey.length > 0" class="merged-roots-section">
          <div class="merged-roots-header">
            <span class="merged-label">归并字根</span>
            <span class="merged-count">{{ mergedRootsOnKey.length }} 个</span>
          </div>
          <div class="merged-roots-list">
            <div v-for="item in mergedRootsOnKey" :key="item.target" class="merged-item">
              <span class="merged-target">{{ item.target }}</span>
              <span class="merged-arrow">→</span>
              <span class="merged-source">{{ item.source }}</span>
              <span class="merged-code">({{ item.sourceCode.toUpperCase() }})</span>
              <button class="btn btn-sm btn-outline merged-remove" @click="removeMerge(item.target)">取消</button>
            </div>
          </div>
        </div>
        
        <!-- 码位等值列表（只显示当前键位相关） -->
        <div v-if="codeEquivalencesOnKey.length > 0" class="code-equiv-section">
          <div class="code-equiv-header">
            <span class="code-equiv-label">码位等值</span>
            <span class="code-equiv-count">{{ codeEquivalencesOnKey.length }} 个</span>
          </div>
          <div class="code-equiv-list">
            <div v-for="item in codeEquivalencesOnKey" :key="item.targetRef" class="code-equiv-item">
              <span class="equiv-target">{{ item.targetRef }}</span>
              <span class="equiv-arrow">=</span>
              <span class="equiv-source">{{ item.sourceRef }}</span>
              <span class="equiv-code">({{ item.targetCode.toUpperCase() }} = {{ item.sourceCode.toUpperCase() }})</span>
              <button class="btn btn-sm btn-outline equiv-remove" @click="removeCodeEquiv(item.targetRef)">取消</button>
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

  <!-- 归并字根设置弹窗 -->
  <ModalDialog :visible="showMergeModal" title="归并管理" @close="showMergeModal = false">
    <div class="merge-modal-content">
      <!-- 标签页切换 -->
      <div class="merge-tabs">
        <button 
          class="merge-tab" 
          :class="{ active: mergeModalTab === 'merge' }"
          @click="mergeModalTab = 'merge'"
        >
          整字归并
        </button>
        <button 
          class="merge-tab" 
          :class="{ active: mergeModalTab === 'codeEquiv' }"
          @click="mergeModalTab = 'codeEquiv'"
        >
          码位等值
        </button>
      </div>

      <!-- 整字归并标签页 -->
      <div v-if="mergeModalTab === 'merge'" class="merge-tab-content">
        <p class="merge-desc">将一个字根的编码设置为与另一个字根相同。归并后，两个字根将拥有相同的编码。</p>
        
        <div class="merge-form-row">
          <label>要归并的字根</label>
          <input
            v-model="mergeForm.targetRoot"
            type="text"
            placeholder="输入要归并的字根"
            class="merge-input"
          />
          <span class="merge-hint">此字根将获得与来源字根相同的编码</span>
        </div>
        
        <div class="merge-form-row">
          <label>来源字根（已有编码）</label>
          <input
            v-model="mergeForm.sourceRoot"
            type="text"
            placeholder="输入来源字根"
            class="merge-input"
            list="roots-merge-datalist"
          />
          <datalist id="roots-merge-datalist">
            <option v-for="root in allRootsForMerge" :key="root" :value="root" />
          </datalist>
          <span class="merge-hint">此字根的编码将被复制到目标字根</span>
        </div>
        
        <div v-if="mergeForm.sourceRoot && engine.rootCodes.get(mergeForm.sourceRoot)" class="merge-preview">
          <span class="preview-label">来源字根编码：</span>
          <span class="preview-code">{{ codeToString(engine.rootCodes.get(mergeForm.sourceRoot)!).toUpperCase() }}</span>
        </div>

        <!-- 已设置的归并列表 -->
        <div v-if="mergedRootsList.length > 0" class="merge-list-section">
          <div class="merge-list-header">
            <span>已设置的归并 ({{ mergedRootsList.length }})</span>
          </div>
          <div class="merge-list-body">
            <div v-for="item in mergedRootsList" :key="item.target" class="merge-list-item">
              <span class="merge-target">{{ item.target }}</span>
              <span class="merge-arrow">=</span>
              <span class="merge-source">{{ item.source }}</span>
              <span class="merge-code">({{ item.sourceCode.toUpperCase() }})</span>
              <button class="btn btn-xs btn-outline" @click="removeMerge(item.target)">取消</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 码位等值标签页 -->
      <div v-if="mergeModalTab === 'codeEquiv'" class="merge-tab-content">
        <p class="merge-desc">设置某字根的第 N 码等于另一字根的第 N 码。例如：「目.1」=「日.1」表示目的第2码等于日的第2码。简写格式：「目」=「日」表示目的第1码等于日的第1码。</p>
        
        <div class="merge-form-row">
          <label>目标码位（格式：字根 或 字根.索引）</label>
          <input
            v-model="codeEquivForm.targetRef"
            type="text"
            placeholder="如：目 或 目.1（表示目的第2码）"
            class="merge-input"
          />
          <span class="merge-hint">简写「目」表示第1码（索引0），完整格式「目.1」表示第2码</span>
        </div>
        
        <div class="merge-form-row">
          <label>来源码位（格式：字根 或 字根.索引）</label>
          <input
            v-model="codeEquivForm.sourceRef"
            type="text"
            placeholder="如：日 或 日.1（表示日的第2码）"
            class="merge-input"
          />
          <span class="merge-hint">来源字根必须有编码</span>
        </div>

        <!-- 码位等值预览 -->
        <div v-if="codeEquivForm.sourceRef" class="merge-preview">
          <template v-if="engine.parseCodeRef(codeEquivForm.sourceRef)">
            <span class="preview-label">来源码位值：</span>
            <span class="preview-code">{{ engine.getRootCodeAt(engine.parseCodeRef(codeEquivForm.sourceRef)!.root, engine.parseCodeRef(codeEquivForm.sourceRef)!.codeIndex)?.toUpperCase() || '不存在' }}</span>
          </template>
          <span v-else class="preview-error">格式错误</span>
        </div>

        <!-- 已设置的码位等值列表 -->
        <div v-if="codeEquivalencesList.length > 0" class="merge-list-section">
          <div class="merge-list-header">
            <span>已设置的码位等值 ({{ codeEquivalencesList.length }})</span>
          </div>
          <div class="merge-list-body">
            <div v-for="item in codeEquivalencesList" :key="item.targetRef" class="merge-list-item">
              <span class="merge-target">{{ item.targetRef }}</span>
              <span class="merge-arrow">=</span>
              <span class="merge-source">{{ item.sourceRef }}</span>
              <span class="merge-code">({{ item.targetCode.toUpperCase() }} = {{ item.sourceCode.toUpperCase() }})</span>
              <button class="btn btn-xs btn-outline" @click="removeCodeEquiv(item.targetRef)">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #actions>
      <button class="btn btn-ghost" @click="showMergeModal = false">取消</button>
      <button v-if="mergeModalTab === 'merge'" class="btn btn-purple" @click="applyMerge">确认归并</button>
      <button v-if="mergeModalTab === 'codeEquiv'" class="btn btn-purple" @click="applyCodeEquiv">确认设置</button>
    </template>
  </ModalDialog>

  <!-- 等效字根设置弹窗 -->
  <ModalDialog :visible="showEquivModal" title="等效字根设置" @close="showEquivModal = false">
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
              <span class="root-char">{{ item.mainRoot }}</span>
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
                {{ equiv }}
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
            {{ comp.char }}
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

/* 等效字根弹窗样式 */
.equiv-modal-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 850px;
  max-height: 75vh;
}

.equiv-list-section {
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.equiv-list-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
}

.equiv-list-header {
  display: grid;
  grid-template-columns: 120px 1fr 60px;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg3);
  font-size: 12px;
  font-weight: 600;
  color: var(--text2);
  border-bottom: 1px solid var(--border);
}

/* 拖放区域样式 */
.drop-zone {
  padding: 12px 16px;
  background: rgba(24, 144, 255, 0.08);
  border-bottom: 1px solid var(--border);
  transition: all 0.2s ease;
}

.drop-zone.drag-over {
  background: rgba(24, 144, 255, 0.2);
  border-color: #1890ff;
}

.drop-zone-label {
  font-size: 13px;
  color: var(--text);
}

.drop-zone-label strong {
  font-size: 18px;
  color: #1890ff;
}

.drop-zone-hint {
  font-size: 11px;
  color: var(--text2);
  margin-top: 4px;
}

.equiv-list-body {
  max-height: 200px;
  overflow-y: auto;
}

.equiv-item {
  display: grid;
  grid-template-columns: 120px 1fr 60px;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s ease;
}

.equiv-item:last-child {
  border-bottom: none;
}

.equiv-item:hover {
  background: var(--bg3);
}

.equiv-item.selected {
  background: var(--primary-bg);
  border-color: var(--primary);
}

.main-root {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.main-root .root-char {
  font-size: 18px;
}

.main-root .root-code {
  font-size: 11px;
  color: var(--text2);
  font-family: monospace;
}

.main-root .root-code.editable {
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.main-root .root-code.editable:hover {
  background: var(--primary-bg);
  color: var(--primary);
}

.equiv-code-input {
  width: 60px;
  font-family: monospace;
  font-size: 11px;
  padding: 2px 4px;
  border: 1px solid var(--primary);
  border-radius: 4px;
  outline: none;
}

.btn-xs {
  padding: 2px 6px;
  font-size: 10px;
}

.equiv-roots {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-content: flex-start;
}

.equiv-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--primary-bg);
  color: var(--primary);
  border-radius: 4px;
  font-size: 14px;
}

.equiv-tag .remove-btn {
  width: 16px;
  height: 16px;
  border: none;
  background: rgba(245, 63, 63, 0.2);
  color: var(--danger);
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: all 0.15s ease;
}

.equiv-tag .remove-btn:hover {
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
  background: rgba(245, 63, 63, 0.1);
  color: var(--danger);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-group-btn:hover {
  background: var(--danger);
  color: white;
}

.empty-list {
  padding: 20px;
  text-align: center;
  color: var(--text3);
  font-size: 13px;
}

.components-section {
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
}

.search-input-sm {
  width: 150px;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  outline: none;
}

.search-input-sm:focus {
  border-color: var(--primary);
}

.components-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.component-item {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.component-item:hover {
  border-color: var(--primary);
  background: var(--primary-bg);
}

.component-item.draggable {
  cursor: grab;
}

.component-item.is-main {
  background: rgba(114, 46, 209, 0.15);
  border-color: #722ed1;
  color: #722ed1;
}

.component-item.is-equiv {
  background: rgba(19, 194, 194, 0.15);
  border-color: #13c2c2;
  color: #13c2c2;
}

/* 花括号字根长条形样式 */
.component-item.is-braced {
  width: auto;
  min-width: 28px;
  padding: 0 8px;
  font-size: 12px;
  background: rgba(245, 166, 35, 0.15);
  border-color: #f5a623;
  color: #a37718;
}

.component-item.is-braced:hover {
  background: rgba(245, 166, 35, 0.25);
}

.components-hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text2);
  background: var(--bg3);
  border-top: 1px solid var(--border);
}

/* 按钮样式补充 */
.btn-info {
  background: #1890ff;
  color: white;
}

.btn-info:hover {
  background: #40a9ff;
}

/* 面板头部操作区 */
.panel-header-actions {
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

/* 码位等值区块 */
.code-equiv-section {
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
  padding: 12px 16px;
}

.code-equiv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.code-equiv-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
}

.code-equiv-count {
  font-size: 11px;
  color: var(--text2);
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
}

.code-equiv-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.code-equiv-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg);
  border: 1px solid #13c2c2;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
}

.equiv-target {
  font-weight: 600;
  color: #13c2c2;
}

.equiv-arrow {
  color: var(--text2);
  font-size: 12px;
}

.equiv-source {
  color: var(--primary);
}

.equiv-code {
  font-family: monospace;
  font-size: 12px;
  color: var(--text2);
  background: var(--bg3);
  padding: 2px 6px;
  border-radius: 4px;
}

.equiv-remove {
  font-size: 11px;
  padding: 2px 6px;
  margin-left: 4px;
}

/* 归并弹窗样式 */
.merge-modal-content {
  min-width: 360px;
  min-height: 380px;
}

.merge-desc {
  font-size: 13px;
  color: var(--text2);
  margin: 0 0 16px 0;
  line-height: 1.5;
  min-height: 42px;
}

.merge-form-row {
  margin-bottom: 16px;
}

.merge-form-row label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}

.merge-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 15px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
}

.merge-input:focus {
  outline: none;
  border-color: var(--primary);
}

.merge-hint {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-top: 4px;
}

.merge-preview {
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

.preview-error {
  color: var(--danger);
  font-size: 13px;
}

/* 标签页样式 */
.merge-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}

.merge-tab {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  color: var(--text2);
  transition: all 0.15s ease;
}

.merge-tab:hover {
  background: var(--bg3);
  color: var(--text);
}

.merge-tab.active {
  background: var(--primary-bg);
  color: var(--primary);
  border-bottom: 2px solid var(--primary);
  margin-bottom: -9px;
}

.merge-tab-content {
  min-height: 200px;
}

/* 归并列表样式 */
.merge-list-section {
  margin-top: 20px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.merge-list-header {
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  margin-bottom: 12px;
}

.merge-list-body {
  max-height: 150px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.merge-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg3);
  border-radius: 6px;
  font-size: 13px;
}

.merge-list-item .merge-target {
  font-weight: 600;
  color: var(--purple);
}

.merge-list-item .merge-arrow {
  color: var(--text3);
}

.merge-list-item .merge-source {
  color: var(--primary);
}

.merge-list-item .merge-code {
  font-family: monospace;
  font-size: 11px;
  color: var(--text2);
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
