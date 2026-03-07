<script setup lang="ts">
import { ref, watch, computed, shallowRef } from 'vue'
import { useEngine } from '../../composables/useEngine'
import KeyboardHeatmap from '../shared/KeyboardHeatmap.vue'
import Icon from '../Icon.vue'
import {
  evaluateScheme,
  evaluateWords,
  parseCodeTable,
  loadEquivalenceData,
  zipLines,
  zipWordLines,
  getColumnValue,
  getWordColumnValue,
  getWeightedValue,
  getWordWeightedEq,
  getWordComboWeightPercent,
  getWordLackWeightPercent,
  calcFingerBalance,
  type EvaluationResult,
  type EvaluateLine,
  type EvaluateHanziItem,
  type EvaluationWordResult,
  type EvaluateWordLine,
  type EvaluateWordItem,
} from '../../utils/evaluate'

const {
  engine, rootsVersion, configVersion, charsetVersion, toast,
} = useEngine()

// 主标签页
const activeTab = ref<'single' | 'upload'>('single')

// 子标签页（用于切换单字/词组测评结果）
const subTab = ref<'char' | 'word'>('char')

// 测评结果 - 使用 shallowRef 避免深层响应式带来的性能开销
const evaluationResult = shallowRef<EvaluationResult | null>(null)
const wordEvaluationResult = shallowRef<EvaluationWordResult | null>(null)
const isEvaluating = ref(false)

// 上传码表相关
// 注意：parseCodeTable 返回 Map<string, string[]>，每个字可能有多个编码
const uploadedCodeMap = ref<Map<string, string[]> | null>(null)
const uploadedFileName = ref('')
const uploadedResult = shallowRef<EvaluationResult | null>(null)
const uploadedWordResult = shallowRef<EvaluationWordResult | null>(null)

// 上传码表组词规则
// 规则格式：大写字母表示字序(A=第1字,B=第2字...Z=末字)，小写字母表示码位(a=第1码,b=第2码...)
// 例如：AaAbBaBb 表示取第1字前两码+第2字前两码
const uploadedWord2Rule = ref('AaAbBaBb')  // 2字词规则
const uploadedWord3Rule = ref('AaBaCaCb')  // 3字词规则
const uploadedWord4Rule = ref('AaBaCaZa')  // 4字以上词规则

// 方案名称
const currentSchemeName = ref('当前方案')
const uploadedSchemeName = ref('')

// 编辑方案名称
const editingSchemeName = ref(false)
const editingUploadedSchemeName = ref(false)

// 从文件名提取方案名称
function extractSchemeName(fileName: string): string {
  // 去掉扩展名
  const lastDot = fileName.lastIndexOf('.')
  return lastDot > 0 ? fileName.substring(0, lastDot) : fileName
}

// 开始编辑方案名称
function startEditSchemeName(type: 'current' | 'upload') {
  if (type === 'current') {
    editingSchemeName.value = true
  } else {
    editingUploadedSchemeName.value = true
  }
}

// 完成编辑方案名称
function finishEditSchemeName(type: 'current' | 'upload') {
  if (type === 'current') {
    editingSchemeName.value = false
  } else {
    editingUploadedSchemeName.value = false
  }
}

// 测评配置
const selectKeys = ref(";'456789")
const maxCodeLength = ref(4)

// 默认字频数据（kc6000.txt）
const defaultFreqMap = ref<Map<string, number> | null>(null)

// 加载默认字频数据
async function loadDefaultFreq() {
  if (defaultFreqMap.value) return defaultFreqMap.value
  
  try {
    const base = import.meta.env.BASE_URL
    const res = await fetch(`${base}data/kc6000.txt`)
    if (!res.ok) throw new Error('加载字频数据失败')
    
    const text = await res.text()
    const freqMap = new Map<string, number>()
    const lines = text.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      
      const parts = trimmed.split('\t')
      if (parts.length >= 2) {
        const char = parts[0]
        const freq = parseInt(parts[1], 10)
        if (char.length === 1 && freq > 0) {
          freqMap.set(char, freq)
        }
      }
    }
    
    defaultFreqMap.value = freqMap
    return freqMap
  } catch (e) {
    toast('加载字频数据失败')
    return null
  }
}

// 获取字根的完整编码字符串
function getRootFullCode(root: string): string {
  const rootCode = engine.rootCodes.get(root)
  if (rootCode) {
    return (rootCode.main || '') + (rootCode.sub || '') + (rootCode.supplement || '')
  }
  const effectiveCode = engine.getEffectiveRootCode(root)
  if (effectiveCode) {
    return (effectiveCode.main || '') + (effectiveCode.sub || '') + (effectiveCode.supplement || '')
  }
  return ''
}

// 检查字是否有缺失（与编码页面逻辑一致）
function isCharMissing(char: string): boolean {
  const decomp = engine.decompose(char)
  const roots = decomp.leaves
  
  if (!roots.length) return true
  
  for (const root of roots) {
    const fullCode = getRootFullCode(root)
    if (!fullCode) return true
  }
  
  const code = calculateCharCode(char)
  if (!code) return true
  
  return false
}

// 根据用户定义的规则计算编码
function calculateCharCode(char: string): string {
  configVersion.value
  const rules = engine.getCodeRules()
  if (rules.length < 2) return ''
  
  const hasActualRules = rules.some(r => r.type !== 'start' && r.type !== 'end')
  if (!hasActualRules) return ''
  
  const decomp = engine.decompose(char)
  const roots = decomp.leaves
  if (!roots.length) return ''
  
  let code = ''
  let currentNodeId = 'start'
  const visited = new Set<string>()
  const maxIterations = 100
  
  while (currentNodeId !== 'end' && !visited.has(currentNodeId) && visited.size < maxIterations) {
    visited.add(currentNodeId)
    const node = rules.find(r => r.id === currentNodeId)
    if (!node) break
    
    if (node.type === 'start') {
      if (node.nextNode) currentNodeId = node.nextNode
      else break
    } else if (node.type === 'pick') {
      const rootIdx = node.rootIndex || 1
      const codeIdx = node.codeIndex || 1
      const actualRootIdx = rootIdx === -1 ? roots.length - 1 : rootIdx - 1
      
      if (actualRootIdx >= 0 && actualRootIdx < roots.length) {
        const root = roots[actualRootIdx]
        const fullCode = getRootFullCode(root)
        if (fullCode) {
          const actualCodeIdx = codeIdx === -1 ? fullCode.length - 1 : codeIdx - 1
          if (actualCodeIdx >= 0 && actualCodeIdx < fullCode.length) {
            code += fullCode[actualCodeIdx]
          }
        }
      }
      
      if (node.nextNode) currentNodeId = node.nextNode
      else break
    } else if (node.type === 'condition') {
      let conditionMet = false
      
      if (node.conditionType === 'root_exists') {
        const idx = (node.conditionValue || 1) - 1
        conditionMet = idx >= 0 && idx < roots.length
      } else if (node.conditionType === 'root_has_code') {
        const rootIdx = (node.conditionValue || 1) - 1
        const codeIdx = (node.conditionCodeIndex || 1) - 1
        if (rootIdx >= 0 && rootIdx < roots.length) {
          const root = roots[rootIdx]
          const fullCode = getRootFullCode(root)
          conditionMet = codeIdx >= 0 && codeIdx < fullCode.length
        }
      } else if (node.conditionType === 'root_count') {
        conditionMet = roots.length >= (node.conditionValue || 1)
      }
      
      if (conditionMet && node.trueBranch) currentNodeId = node.trueBranch
      else if (!conditionMet && node.falseBranch) currentNodeId = node.falseBranch
      else break
    } else if (node.type === 'end') {
      break
    } else {
      break
    }
  }
  
  return code
}

// 执行当前编码方案的测评
async function runEvaluation() {
  isEvaluating.value = true

  try {
    await loadEquivalenceData()

    // 加载字频数据（用于单字测评）
    const freqMap = await loadDefaultFreq()
    if (!freqMap) {
      toast('无法加载字频数据')
      return
    }

    // 单字测评
    const codeMap = new Map<string, string>()
    const missingSet = new Set<string>()

    for (const [char] of freqMap) {
      if (isCharMissing(char)) {
        missingSet.add(char)
      } else {
        const code = calculateCharCode(char)
        if (code) codeMap.set(char, code)
      }
    }

    const result = evaluateScheme(codeMap, freqMap, selectKeys.value, maxCodeLength.value, missingSet)
    evaluationResult.value = result

    // 词组测评
    const wordFreqMap = await loadWordFreq()
    if (wordFreqMap) {
      const wordCodeMap = new Map<string, string>()

      for (const [word, freq] of wordFreqMap) {
        if (word.length >= 2) {
          const code = calculateWordCode(word)
          if (code) {
            wordCodeMap.set(word, code)
          }
        }
      }

      const wordResult = evaluateWords(wordCodeMap, wordFreqMap)
      wordEvaluationResult.value = wordResult
    }

    // 统计词数
    let wordCount = 0
    if (wordFreqMap) {
      for (const [word] of wordFreqMap) {
        if (word.length >= 2) wordCount++
      }
    }

    toast(`测评完成：${freqMap.size} 字，${wordCount} 词`)
  } catch (e) {
    toast('测评失败: ' + (e as Error).message)
  } finally {
    isEvaluating.value = false
  }
}

// 计算多字词编码
function calculateWordCode(word: string): string {
  configVersion.value
  const rules = engine.getWordCodeRules()

  if (rules.length < 2) return ''

  const hasActualRules = rules.some(r => r.type !== 'start' && r.type !== 'end')
  if (!hasActualRules) return ''

  // 获取每个字的字根
  const charsRoots: string[][] = []
  for (const char of word) {
    const decomp = engine.decompose(char)
    charsRoots.push(decomp.leaves)
  }

  let code = ''
  let currentNodeId = 'start'
  const visited = new Set<string>()
  const maxIterations = 100

  while (currentNodeId !== 'end' && !visited.has(currentNodeId) && visited.size < maxIterations) {
    visited.add(currentNodeId)
    const node = rules.find(r => r.id === currentNodeId)
    if (!node) break

    if (node.type === 'start') {
      if (node.nextNode) currentNodeId = node.nextNode
      else break
    } else if (node.type === 'pick') {
      const charIdx = node.charIndex || 1
      const rootIdx = node.rootIndex || 1
      const codeIdx = node.codeIndex || 1

      // 计算实际字索引
      let actualCharIdx: number
      if (charIdx === -1) {
        actualCharIdx = charsRoots.length - 1
      } else if (charIdx === -2) {
        actualCharIdx = charsRoots.length - 2
      } else {
        actualCharIdx = charIdx - 1
      }

      const charRoots = charsRoots[actualCharIdx] || []

      // 计算实际字根索引
      let actualRootIdx: number
      let adjustedCodeIdx: number = codeIdx

      if (rootIdx === -1) {
        actualRootIdx = charRoots.length - 1
      } else if (rootIdx > charRoots.length) {
        actualRootIdx = charRoots.length - 1
        adjustedCodeIdx = codeIdx + (rootIdx - charRoots.length)
      } else {
        actualRootIdx = rootIdx - 1
      }

      if (actualRootIdx >= 0 && actualRootIdx < charRoots.length) {
        const root = charRoots[actualRootIdx]
        const fullCode = getRootFullCode(root)

        if (fullCode) {
          const actualCodeIdx = adjustedCodeIdx === -1 ? fullCode.length - 1 : adjustedCodeIdx - 1
          if (actualCodeIdx >= 0 && actualCodeIdx < fullCode.length) {
            code += fullCode[actualCodeIdx]
          }
        }
      }

      if (node.nextNode) currentNodeId = node.nextNode
      else break
    } else if (node.type === 'condition') {
      let conditionMet = false

      if (node.conditionType === 'char_exists') {
        const idx = (node.conditionValue || 1) - 1
        conditionMet = idx >= 0 && idx < charsRoots.length
      } else if (node.conditionType === 'root_exists') {
        const idx = (node.conditionValue || 1) - 1
        const roots = charsRoots[0] || []
        conditionMet = idx >= 0 && idx < roots.length
      } else if (node.conditionType === 'root_count') {
        const roots = charsRoots[0] || []
        conditionMet = roots.length >= (node.conditionValue || 1)
      }

      if (conditionMet && node.trueBranch) currentNodeId = node.trueBranch
      else if (!conditionMet && node.falseBranch) currentNodeId = node.falseBranch
      else break
    } else if (node.type === 'end') {
      break
    } else {
      break
    }
  }

  return code
}

// 检查多字词是否缺失
function isWordMissing(word: string): boolean {
  for (const char of word) {
    const decomp = engine.decompose(char)
    const roots = decomp.leaves

    if (!roots.length) return true

    for (const root of roots) {
      const fullCode = getRootFullCode(root)
      if (!fullCode) return true
    }
  }

  const code = calculateWordCode(word)
  return !code
}

// 默认词频数据
const defaultWordFreqMap = ref<Map<string, number> | null>(null)

// 加载词频数据（包含多字词）
async function loadWordFreq(): Promise<Map<string, number> | null> {
  if (defaultWordFreqMap.value) return defaultWordFreqMap.value

  try {
    const base = import.meta.env.BASE_URL
    const res = await fetch(`${base}data/kc6000.txt`)
    if (!res.ok) throw new Error('加载词频数据失败')

    const text = await res.text()
    const freqMap = new Map<string, number>()
    const lines = text.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const parts = trimmed.split('\t')
      if (parts.length >= 2) {
        const word = parts[0]
        const freq = parseInt(parts[1], 10)
        if (freq > 0) {
          freqMap.set(word, freq)
        }
      }
    }

    defaultWordFreqMap.value = freqMap
    return freqMap
  } catch (e) {
    toast('加载词频数据失败')
    return null
  }
}

// 处理码表上传
function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  uploadedFileName.value = file.name
  uploadedSchemeName.value = extractSchemeName(file.name)
  
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string
      const codeMap = parseCodeTable(content, file.name)
      uploadedCodeMap.value = codeMap
      toast(`已加载 ${codeMap.size} 个编码`)
    } catch (err) {
      toast('解析码表失败')
    }
  }
  reader.readAsText(file)
}

// 解析组词规则
// 规则格式：大写字母表示字序(A=第1字,B=第2字...Z=末字)，小写字母表示码位(a=第1码,b=第2码...z=末码)
// 例如：AaAbBaBb 表示取第1字前两码+第2字前两码
interface RulePart {
  charIndex: number  // 字索引（0-based，-1表示末字）
  codeIndex: number  // 码位索引（0-based，-1表示末码）
}

function parseWordRule(rule: string): RulePart[] {
  const parts: RulePart[] = []
  
  // 规则是成对的大写+小写字母
  // 使用更清晰的遍历方式
  for (let i = 0; i < rule.length; i += 2) {
    // 确保有完整的一对字符
    if (i + 1 >= rule.length) break
    
    const charLetter = rule[i]
    const codeLetter = rule[i + 1]
    
    // 解析字序：A=0, B=1, ... Y=24, Z=-1(末字)
    let charIndex: number
    if (charLetter === 'Z') {
      charIndex = -1  // 末字
    } else {
      charIndex = charLetter.charCodeAt(0) - 'A'.charCodeAt(0)
    }
    
    // 解析码位：a=0, b=1, c=2, ..., z=-1(末码)
    let codeIndex: number
    if (codeLetter === 'z') {
      codeIndex = -1  // 末码
    } else {
      codeIndex = codeLetter.charCodeAt(0) - 'a'.charCodeAt(0)
    }
    
    parts.push({ charIndex, codeIndex })
  }
  
  return parts
}

// 根据规则计算上传码表的词组编码
function calculateUploadedWordCode(word: string, rule: string): string {
  if (!uploadedCodeMap.value) return ''
  
  const parts = parseWordRule(rule)
  const wordLen = word.length
  let code = ''
  
  for (const part of parts) {
    // 计算实际的字索引
    let actualCharIdx: number
    if (part.charIndex === -1) {
      actualCharIdx = wordLen - 1  // 末字
    } else {
      actualCharIdx = part.charIndex
    }
    
    // 检查字索引是否有效
    if (actualCharIdx < 0 || actualCharIdx >= wordLen) {
      continue
    }
    
    const char = word[actualCharIdx]
    const charCodes = uploadedCodeMap.value.get(char)
    
    if (!charCodes || charCodes.length === 0) {
      continue
    }
    
    // 取最长的编码（全码），避免组词时误用简码
    // 例如："来"有简码"a"和全码"al"，组词时应用全码"al"
    const primaryCode = charCodes.reduce((a, b) => a.length >= b.length ? a : b, charCodes[0])
    
    // 计算实际的码位索引
    let actualCodeIdx: number
    if (part.codeIndex === -1) {
      actualCodeIdx = primaryCode.length - 1  // 末码
    } else {
      actualCodeIdx = part.codeIndex
    }
    
    // 获取指定码位
    if (actualCodeIdx >= 0 && actualCodeIdx < primaryCode.length) {
      code += primaryCode[actualCodeIdx]
    }
  }
  
  return code
}

// 执行上传码表的测评
async function runUploadedEvaluation() {
  if (!uploadedCodeMap.value) {
    toast('请先上传码表')
    return
  }
  
  isEvaluating.value = true
  
  try {
    await loadEquivalenceData()
    
    const freqMap = await loadDefaultFreq()
    if (!freqMap) {
      toast('无法加载字频数据')
      return
    }
    
    // 单字测评
    const result = evaluateScheme(uploadedCodeMap.value, freqMap, selectKeys.value, maxCodeLength.value)
    uploadedResult.value = result
    
    // 词组测评
    const wordFreqMap = await loadWordFreq()
    if (wordFreqMap) {
      const wordCodeMap = new Map<string, string>()
      
      for (const [word, freq] of wordFreqMap) {
        if (word.length >= 2) {
          // 根据词长选择规则
          let rule: string
          if (word.length === 2) {
            rule = uploadedWord2Rule.value
          } else if (word.length === 3) {
            rule = uploadedWord3Rule.value
          } else {
            rule = uploadedWord4Rule.value
          }
          
          const code = calculateUploadedWordCode(word, rule)
          if (code) {
            wordCodeMap.set(word, code)
          }
        }
      }
      
      const wordResult = evaluateWords(wordCodeMap, wordFreqMap)
      uploadedWordResult.value = wordResult
    }
    
    // 统计词数
    let wordCount = 0
    if (wordFreqMap) {
      for (const [word] of wordFreqMap) {
        if (word.length >= 2) wordCount++
      }
    }
    
    toast(`测评完成：${freqMap.size} 字，${wordCount} 词`)
  } catch (e) {
    toast('测评失败: ' + (e as Error).message)
  } finally {
    isEvaluating.value = false
  }
}

// 清除上传的码表
function clearUploaded() {
  uploadedCodeMap.value = null
  uploadedFileName.value = ''
  uploadedResult.value = null
}

// 格式化数字
function fmt(n: number, decimals: number = 3): string {
  return n.toFixed(decimals)
}

// 计算缓存 - 用于缓存小计行和加权比重的计算结果
const subtotalCache = new Map<string, EvaluateLine>()
const wordSubtotalCache = new Map<string, EvaluateWordLine>()

// 获取小计行（带缓存）
function getSubtotal(lines: EvaluateLine[]): EvaluateLine {
  const cacheKey = lines.map(l => `${l.start}-${l.end}`).join(',')
  if (subtotalCache.has(cacheKey)) {
    return subtotalCache.get(cacheKey)!
  }
  const result = zipLines(lines)
  subtotalCache.set(cacheKey, result)
  return result
}

// 获取多字词小计行（带缓存）
function getWordSubtotal(lines: EvaluateWordLine[]): EvaluateWordLine {
  const cacheKey = lines.map(l => `${l.start}-${l.end}`).join(',')
  if (wordSubtotalCache.has(cacheKey)) {
    return wordSubtotalCache.get(cacheKey)!
  }
  const result = zipWordLines(lines)
  wordSubtotalCache.set(cacheKey, result)
  return result
}

// 清除计算缓存
function clearCalculationCache() {
  subtotalCache.clear()
  wordSubtotalCache.clear()
}

// 计算加权比重
function getWeightPercent(line: EvaluateLine, column: string): string {
  const { weight } = getColumnValue(line, column)
  return line.totalFreq > 0 ? fmt(weight / line.totalFreq * 100, 4) : '0.0000'
}

// 获取手感指标的加权值
function getComboWeightPercent(line: EvaluateLine, column: string): string {
  let totalCombo = 0
  let weightedValue = 0
  
  for (const item of line.items) {
    if (item.isLack || item.overKey > 0) continue
    const keysLen = item.code.length + item.selectKey.length
    const comboCount = keysLen < 2 ? 1 : keysLen - 1
    totalCombo += comboCount * item.freq
    
    switch (column) {
      case 'dh': weightedValue += item.dh * item.freq; break
      case 'ms': weightedValue += item.ms * item.freq; break
      case 'ss': weightedValue += item.ss * item.freq; break
      case 'pd': weightedValue += item.pd * item.freq; break
      case 'lfd': weightedValue += item.lfd * item.freq; break
    }
  }
  
  return totalCombo > 0 ? fmt(weightedValue / totalCombo * 100, 4) : '0.0000'
}

// 获取缺字标记的加权比重
function getLackWeightPercent(line: EvaluateLine): string {
  let lackWeight = 0
  for (const item of line.items) {
    if (item.isLack) lackWeight += item.freq
  }
  return line.totalFreq > 0 ? fmt(lackWeight / line.totalFreq * 100, 4) : '0.0000'
}

// 计算多字词加权比重
function getWordWeightPercent(line: EvaluateWordLine, column: string): string {
  const { weight } = getWordColumnValue(line, column)
  return line.totalFreq > 0 ? fmt(weight / line.totalFreq * 100, 4) : '0.0000'
}

// 详情弹窗相关
const showDetailModal = ref(false)
const detailTitle = ref('')
const detailItems = ref<EvaluateHanziItem[]>([])
const detailWordItems = ref<EvaluateWordItem[]>([])
const isWordDetail = ref(false)

// 弹窗分页相关
const detailPageSize = 10  // 每页显示数量
const detailCurrentPage = ref(1)
const detailWordCurrentPage = ref(1)

// 总页数（单字）
const detailTotalPages = computed(() => {
  return Math.ceil(detailItems.value.length / detailPageSize)
})

// 总页数（词组）
const detailWordTotalPages = computed(() => {
  return Math.ceil(detailWordItems.value.length / detailPageSize)
})

// 获取当前页显示的详情数据（单字）
const paginatedDetailItems = computed(() => {
  const start = (detailCurrentPage.value - 1) * detailPageSize
  const end = start + detailPageSize
  return detailItems.value.slice(start, end)
})

// 获取当前页显示的详情数据（词组）
const paginatedDetailWordItems = computed(() => {
  const start = (detailWordCurrentPage.value - 1) * detailPageSize
  const end = start + detailPageSize
  return detailWordItems.value.slice(start, end)
})

// 分页控制函数（单字）
function goToDetailFirstPage() {
  detailCurrentPage.value = 1
}

function goToDetailPrevPage() {
  if (detailCurrentPage.value > 1) {
    detailCurrentPage.value--
  }
}

function goToDetailNextPage() {
  if (detailCurrentPage.value < detailTotalPages.value) {
    detailCurrentPage.value++
  }
}

function goToDetailLastPage() {
  detailCurrentPage.value = detailTotalPages.value
}

function goToDetailPage(page: number) {
  if (page >= 1 && page <= detailTotalPages.value) {
    detailCurrentPage.value = page
  }
}

// 分页控制函数（词组）
function goToDetailWordFirstPage() {
  detailWordCurrentPage.value = 1
}

function goToDetailWordPrevPage() {
  if (detailWordCurrentPage.value > 1) {
    detailWordCurrentPage.value--
  }
}

function goToDetailWordNextPage() {
  if (detailWordCurrentPage.value < detailWordTotalPages.value) {
    detailWordCurrentPage.value++
  }
}

function goToDetailWordLastPage() {
  detailWordCurrentPage.value = detailWordTotalPages.value
}

function goToDetailWordPage(page: number) {
  if (page >= 1 && page <= detailWordTotalPages.value) {
    detailWordCurrentPage.value = page
  }
}

// 重置分页
function resetDetailPagination() {
  detailCurrentPage.value = 1
  detailWordCurrentPage.value = 1
}

// 跳转页码输入
const detailJumpPage = ref('')
const detailWordJumpPage = ref('')

function handleDetailJump() {
  const page = parseInt(detailJumpPage.value)
  if (!isNaN(page)) {
    goToDetailPage(page)
    detailJumpPage.value = ''
  }
}

function handleDetailWordJump() {
  const page = parseInt(detailWordJumpPage.value)
  if (!isNaN(page)) {
    goToDetailWordPage(page)
    detailWordJumpPage.value = ''
  }
}

// 滚动到表格顶部
function scrollModalBodyToTop() {
  const modalBody = document.querySelector('.modal-body')
  if (modalBody) {
    modalBody.scrollTop = 0
  }
}

// 处理弹窗滚动事件
function handleModalScroll(event: Event) {
  // 用于可能的滚动相关逻辑
}

// 分页时滚动到顶部
watch([detailCurrentPage, detailWordCurrentPage], () => {
  scrollModalBodyToTop()
})

// 列名映射
const COLUMN_NAMES: Record<string, string> = {
  cd1: '1 码', cd2: '2 码', cd3: '3 码', cd4: '4 码', cd5: '5 码',
  simpleCollision: '出简重', fullCollision: '全码重', brief2: '理论二简', lack: '缺字标记',
  dh: '左右互击', ms: '同指大跨排', ss: '同指小跨排',
  pd: '小指干扰', lfd: '错手', trible: '三连击', overKey: '超标键位'
}

// 可点击的列
const CLICKABLE_COLUMNS = ['cd1', 'cd2', 'cd3', 'cd4', 'cd5', 'simpleCollision', 'fullCollision', 'brief2', 'lack', 'dh', 'ms', 'ss', 'pd', 'lfd', 'trible', 'overKey']

// 过滤符合条件的汉字
function filterItemsByColumn(line: EvaluateLine, column: string): EvaluateHanziItem[] {
  const items: EvaluateHanziItem[] = []
  
  for (const item of line.items) {
    let match = false
    
    switch (column) {
      case 'cd1': match = item.codeLen === 1 && !item.isLack; break
      case 'cd2': match = item.codeLen === 2 && !item.isLack; break
      case 'cd3': match = item.codeLen === 3 && !item.isLack; break
      case 'cd4': match = item.codeLen === 4 && !item.isLack; break
      case 'cd5': match = item.codeLen >= 5 && !item.isLack; break
      case 'simpleCollision': match = item.simpleCollision > 1 && !item.isLack; break
      case 'fullCollision': match = item.fullCollision > 1 && !item.isLack; break
      case 'brief2': match = item.brief2 && !item.isLack; break
      case 'lack': match = item.isLack; break
      case 'dh': match = item.dh > 0 && !item.isLack && item.overKey === 0; break
      case 'ms': match = item.ms > 0 && !item.isLack && item.overKey === 0; break
      case 'ss': match = item.ss > 0 && !item.isLack && item.overKey === 0; break
      case 'pd': match = item.pd > 0 && !item.isLack && item.overKey === 0; break
      case 'lfd': match = item.lfd > 0 && !item.isLack && item.overKey === 0; break
      case 'trible': match = item.trible > 0 && !item.isLack && item.overKey === 0; break
      case 'overKey': match = item.overKey > 0 && !item.isLack; break
    }
    
    if (match) items.push(item)
  }
  
  return items.sort((a, b) => b.freq - a.freq)
}

// 点击单元格查看详情
function handleCellClick(line: EvaluateLine, column: string, rangeLabel: string) {
  if (!CLICKABLE_COLUMNS.includes(column)) return
  
  const { count } = getColumnValue(line, column)
  if (count === 0) return
  
  const items = filterItemsByColumn(line, column)
  if (items.length === 0) return
  
  detailTitle.value = `${rangeLabel} - ${COLUMN_NAMES[column] || column}（共 ${items.length} 字）`
  detailItems.value = items
  isWordDetail.value = false
  showDetailModal.value = true
}

// 过滤符合条件的词组
function filterWordItemsByColumn(line: EvaluateWordLine, column: string): EvaluateWordItem[] {
  const items: EvaluateWordItem[] = []
  
  for (const item of line.items) {
    let match = false
    
    switch (column) {
      case 'select': match = item.collision > 1 && !item.isLack; break
      case 'lack': match = item.isLack; break
      case 'dh': match = item.dh > 0 && !item.isLack && item.overKey === 0; break
      case 'ms': match = item.ms > 0 && !item.isLack && item.overKey === 0; break
      case 'ss': match = item.ss > 0 && !item.isLack && item.overKey === 0; break
      case 'pd': match = item.pd > 0 && !item.isLack && item.overKey === 0; break
      case 'lfd': match = item.lfd > 0 && !item.isLack && item.overKey === 0; break
      case 'trible': match = item.trible > 0 && !item.isLack && item.overKey === 0; break
      case 'overKey': match = item.overKey > 0 && !item.isLack; break
    }
    
    if (match) items.push(item)
  }
  
  return items.sort((a, b) => b.freq - a.freq)
}

// 词组表格列名映射
const WORD_COLUMN_NAMES: Record<string, string> = {
  select: '选重',
  lack: '缺词标记',
  dh: '左右互击',
  ms: '同指大跨',
  ss: '同指小跨',
  pd: '小指干扰',
  lfd: '错手',
  trible: '三连击',
  overKey: '超标键位'
}

// 词组可点击的列
const WORD_CLICKABLE_COLUMNS = ['select', 'lack', 'dh', 'ms', 'ss', 'pd', 'lfd', 'trible', 'overKey']

// 点击词组单元格查看详情
function handleWordCellClick(line: EvaluateWordLine, column: string, rangeLabel: string) {
  if (!WORD_CLICKABLE_COLUMNS.includes(column)) return
  
  const { count } = getWordColumnValue(line, column)
  if (count === 0) return
  
  const items = filterWordItemsByColumn(line, column)
  if (items.length === 0) return
  
  detailTitle.value = `${rangeLabel} - ${WORD_COLUMN_NAMES[column] || column}（共 ${items.length} 词）`
  detailWordItems.value = items
  isWordDetail.value = true
  showDetailModal.value = true
}

// 关闭详情弹窗
function closeDetailModal() {
  showDetailModal.value = false
  detailItems.value = []
  detailWordItems.value = []
  resetDetailPagination()
}

// 监听配置变化
watch([rootsVersion, configVersion, charsetVersion], () => {
  evaluationResult.value = null
  wordEvaluationResult.value = null
})
</script>

<template>
  <div class="evaluate-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title"><Icon name="chart" :size="18" /> 编码测评</span>
      </div>
      <div class="toolbar-right">
        <div class="config-group">
          <label>选重键:</label>
          <input v-model="selectKeys" type="text" class="config-input" placeholder="1234" />
        </div>
        <div class="config-group">
          <label>最大码长:</label>
          <input v-model.number="maxCodeLength" type="number" class="config-input" min="1" max="6" />
        </div>
      </div>
    </div>

    <!-- 标签页切换 -->
    <div class="tabs">
      <button class="tab-btn" :class="{ active: activeTab === 'single' }" @click="activeTab = 'single'">
        当前方案测评
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'upload' }" @click="activeTab = 'upload'">
        上传码表测评
      </button>
    </div>

    <!-- 当前方案测评 -->
    <div v-if="activeTab === 'single'" class="tab-content">
      <div class="action-bar">
        <button class="btn btn-primary" :disabled="isEvaluating" @click="runEvaluation">
          {{ isEvaluating ? '测评中...' : '开始测评' }}
        </button>
        <span class="hint">测评当前编码方案的单字和词组性能指标</span>
      </div>

      <!-- 测评结果：子标签切换 -->
      <div v-if="evaluationResult || wordEvaluationResult" class="result-panel">
        <!-- 子标签 -->
        <div class="sub-tabs">
          <button class="sub-tab-btn" :class="{ active: subTab === 'char' }" @click="subTab = 'char'">
            单字测评
          </button>
          <button class="sub-tab-btn" :class="{ active: subTab === 'word' }" @click="subTab = 'word'">
            词组测评
          </button>
        </div>

        <!-- 单字测评表格 -->
        <div v-if="subTab === 'char' && evaluationResult" class="table-container">
          <table class="eval-table">
            <thead>
              <tr class="scheme-title-row">
                <th colspan="20" class="scheme-title-cell">
                  <div class="scheme-title-content">
                    <template v-if="editingSchemeName">
                      <input
                        v-model="currentSchemeName"
                        class="scheme-name-input"
                        @blur="finishEditSchemeName('current')"
                        @keyup.enter="finishEditSchemeName('current')"
                        ref="currentNameInput"
                        autofocus
                      />
                      <span class="scheme-subtitle">单字测评数据</span>
                    </template>
                    <template v-else>
                      <span class="scheme-name-text" @click="startEditSchemeName('current')">{{ currentSchemeName }}</span>
                      <Icon name="edit" :size="14" class="edit-icon" @click="startEditSchemeName('current')" />
                      <span class="scheme-subtitle">单字测评数据</span>
                    </template>
                  </div>
                </th>
              </tr>
              <tr>
                <th class="sticky-col">统计范围</th>
                <th>1 码</th>
                <th>2 码</th>
                <th>3 码</th>
                <th>4 码</th>
                <th>5 码</th>
                <th>出简重</th>
                <th class="col-select">全码重</th>
                <th>理论二简</th>
                <th>加权键长</th>
                <th>字均当量</th>
                <th>键均当量</th>
                <th>用指平衡</th>
                <th>左右互击</th>
                <th>同指大跨</th>
                <th>同指小跨</th>
                <th>小指干扰</th>
                <th>错手</th>
                <th>三连击</th>
                <th>超标键位</th>
                <th>缺字标记</th>
              </tr>
            </thead>
            <tbody>
              <!-- 数据行 -->
              <template v-for="(line, idx) in evaluationResult.lines" :key="idx">
                <tr :class="{ 'row-highlight': idx < 3 }">
                  <td class="sticky-col">{{ line.start + 1 }}~{{ line.end }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd1', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd1').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd2', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd2').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd3', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd3').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd4', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd4').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd5', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd5').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'simpleCollision', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'simpleCollision').count }}</td>
                  <td class="col-select clickable" @click="handleCellClick(line, 'fullCollision', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'fullCollision').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'brief2', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'brief2').count }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'cl')) }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'ziEq')) }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'keyEq')) }}</td>
                  <td>{{ fmt(calcFingerBalance(line.usage), 4) }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'dh', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'dh').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'ms', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'ms').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'ss', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'ss').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'pd', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'pd').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'lfd', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'lfd').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'trible', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'trible').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'overKey', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'overKey').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'lack', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'lack').count }}</td>
                </tr>
                
                <!-- 小计行（在第3行后） -->
                <tr v-if="idx === 2" class="row-subtotal">
                  <td class="sticky-col">小计</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd1', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd1').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd2', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd2').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd3', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd3').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd4', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd4').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd5', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd5').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'simpleCollision', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'simpleCollision').count }}</td>
                  <td class="col-select clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'fullCollision', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'fullCollision').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'brief2', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'brief2').count }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cl')) }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ziEq')) }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'keyEq')) }}</td>
                  <td>{{ fmt(calcFingerBalance(getSubtotal(evaluationResult.lines.slice(0, 3)).usage), 4) }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'dh', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'dh').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ms', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ms').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ss', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ss').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'pd', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'pd').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lfd', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lfd').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'trible', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'trible').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'overKey', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'overKey').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lack', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lack').count }}</td>
                </tr>
                
                <!-- 加权比重行（在小计行后） -->
                <tr v-if="idx === 2" class="row-weight">
                  <td class="sticky-col">加权比重</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd1') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd2') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd3') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd4') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd5') }}%</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'simpleCollision', '小计')">{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'simpleCollision') }}%</td>
                  <td class="col-select">{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'fullCollision') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'brief2') }}%</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'dh') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ms') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ss') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'pd') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lfd') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'trible') }}%</td>
                  <td>-</td>
                  <td>{{ getLackWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3))) }}%</td>
                </tr>
              </template>
              
              <!-- 总计行 -->
              <tr class="row-total">
                <td class="sticky-col">总计</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd1', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd1').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd2', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd2').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd3', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd3').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd4', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd4').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd5', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd5').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'simpleCollision', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'simpleCollision').count }}</td>
                <td class="col-select clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'fullCollision', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'fullCollision').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'brief2', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'brief2').count }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines), 'cl')) }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines), 'ziEq')) }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines), 'keyEq')) }}</td>
                <td>{{ fmt(calcFingerBalance(getSubtotal(evaluationResult.lines).usage), 4) }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'dh', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'dh').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'ms', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'ms').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'ss', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'ss').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'pd', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'pd').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'lfd', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'lfd').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'trible', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'trible').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'overKey', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'overKey').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'lack', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'lack').count }}</td>
              </tr>
              
              <!-- 总加权比重行 -->
              <tr class="row-weight">
                <td class="sticky-col">加权比重</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd1') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd2') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd3') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd4') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd5') }}%</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'simpleCollision', '总计')">{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'simpleCollision') }}%</td>
                <td class="col-select">{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'fullCollision') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'brief2') }}%</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'dh') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'ms') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'ss') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'pd') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'lfd') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'trible') }}%</td>
                <td>-</td>
                <td>{{ getLackWeightPercent(getSubtotal(evaluationResult.lines)) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 键位热力图 -->
        <div v-if="subTab === 'char' && evaluationResult" class="heatmap-container">
          <h3 class="section-title">键位热力图（单位：%）</h3>
          <KeyboardHeatmap :usage="evaluationResult.usage" />
        </div>

        <!-- 词组测评表格 -->
        <div v-if="subTab === 'word' && wordEvaluationResult" class="table-container">
          <table class="eval-table word-eval-table">
            <thead>
              <tr class="scheme-title-row">
                <th colspan="12" class="scheme-title-cell">
                  <div class="scheme-title-content">
                    <span class="scheme-name-text">{{ currentSchemeName }}</span>
                    <span class="scheme-subtitle">词组测评数据</span>
                  </div>
                </th>
              </tr>
              <tr>
                <th class="sticky-col">统计范围</th>
                <th class="col-select">选重</th>
                <th>加权词均当量</th>
                <th>左右互击</th>
                <th>同指大跨</th>
                <th>同指小跨</th>
                <th>小指干扰</th>
                <th>错手</th>
                <th>三连击</th>
                <th>超标键位</th>
                <th>缺词标记</th>
              </tr>
            </thead>
            <tbody>
              <!-- 数据行 -->
              <template v-for="(line, idx) in wordEvaluationResult.lines" :key="idx">
                <tr :class="{ 'row-highlight': idx < 3 }">
                  <td class="sticky-col">{{ line.start + 1 }}~{{ line.end }}</td>
                  <td class="col-select clickable" @click="handleWordCellClick(line, 'select', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'select').count }}</td>
                  <td>{{ fmt(getWordWeightedEq(line)) }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'dh', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'dh').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'ms', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'ms').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'ss', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'ss').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'pd', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'pd').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'lfd', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'lfd').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'trible', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'trible').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'overKey', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'overKey').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'lack', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'lack').count }}</td>
                </tr>

                <!-- 小计行（在第3行后） -->
                <tr v-if="idx === 2" class="row-subtotal">
                  <td class="sticky-col">小计</td>
                  <td class="col-select">{{ getWordWeightPercent(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3)), 'select') }}%</td>
                  <td>{{ fmt(getWordWeightedEq(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3)))) }}</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3)), 'dh') }}%</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3)), 'ms') }}%</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3)), 'ss') }}%</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3)), 'pd') }}%</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3)), 'lfd') }}%</td>
                  <td>{{ getWordWeightPercent(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3)), 'trible') }}%</td>
                  <td>-</td>
                  <td>{{ getWordLackWeightPercent(getWordSubtotal(wordEvaluationResult.lines.slice(0, 3))) }}%</td>
                </tr>
              </template>

              <!-- 总计行 -->
              <tr class="row-total">
                <td class="sticky-col">总计</td>
                <td class="col-select clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'select', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'select').count }}</td>
                <td>{{ fmt(getWordWeightedEq(getWordSubtotal(wordEvaluationResult.lines))) }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'dh', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'dh').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'ms', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'ms').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'ss', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'ss').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'pd', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'pd').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'lfd', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'lfd').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'trible', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'trible').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'overKey', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'overKey').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(wordEvaluationResult.lines), 'lack', '总计')">{{ getWordColumnValue(getWordSubtotal(wordEvaluationResult.lines), 'lack').count }}</td>
              </tr>

              <!-- 总加权比重行 -->
              <tr class="row-weight">
                <td class="sticky-col">加权比重</td>
                <td class="col-select">{{ getWordWeightPercent(getWordSubtotal(wordEvaluationResult.lines), 'select') }}%</td>
                <td>-</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines), 'dh') }}%</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines), 'ms') }}%</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines), 'ss') }}%</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines), 'pd') }}%</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(wordEvaluationResult.lines), 'lfd') }}%</td>
                <td>{{ getWordWeightPercent(getWordSubtotal(wordEvaluationResult.lines), 'trible') }}%</td>
                <td>-</td>
                <td>{{ getWordLackWeightPercent(getWordSubtotal(wordEvaluationResult.lines)) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 词组键位热力图 -->
        <div v-if="subTab === 'word' && wordEvaluationResult" class="heatmap-container">
          <h3 class="section-title">键位热力图（单位：%）</h3>
          <KeyboardHeatmap :usage="wordEvaluationResult.usage" />
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">📊</div>
        <p>点击"开始测评"按钮，测评当前编码方案</p>
      </div>
    </div>

    <!-- 上传码表测评 -->
    <div v-if="activeTab === 'upload'" class="tab-content">
      <div class="upload-section">
        <div class="upload-area" @click="($refs.fileInput as HTMLInputElement).click()">
          <input ref="fileInput" type="file" accept=".txt,.mb,.code,.yaml,.yml" @change="handleFileUpload" style="display: none" />
          <div class="upload-icon">📁</div>
          <div class="upload-text">
            <template v-if="uploadedFileName">
              <p class="file-name">{{ uploadedFileName }}</p>
              <p class="file-info">已加载 {{ uploadedCodeMap?.size || 0 }} 个编码</p>
            </template>
            <template v-else>
              <p>点击或拖拽码表文件到此处</p>
              <p class="upload-hint">支持 .txt, .mb, .code, .yaml, .yml 格式</p>
            </template>
          </div>
        </div>

        <!-- 组词规则配置 -->
        <div v-if="uploadedCodeMap" class="rule-config">
          <h4 class="rule-title">组词规则</h4>
          <p class="rule-hint">格式：大写字母表示字序(A=第1字,B=第2字...Z=末字)，小写字母表示码位(a=第1码,b=第2码...z=末码)</p>
          <div class="rule-inputs">
            <div class="rule-item">
              <label>2字词:</label>
              <input v-model="uploadedWord2Rule" type="text" class="rule-input" placeholder="AaAbBaBb" />
              <span class="rule-example">如 AaAbBaBb = 第1字前2码+第2字前2码</span>
            </div>
            <div class="rule-item">
              <label>3字词:</label>
              <input v-model="uploadedWord3Rule" type="text" class="rule-input" placeholder="AaBaCaCb" />
              <span class="rule-example">如 AaBaCaCb = 各字第1码+末字第2码</span>
            </div>
            <div class="rule-item">
              <label>4字以上:</label>
              <input v-model="uploadedWord4Rule" type="text" class="rule-input" placeholder="AaBaCaZa" />
              <span class="rule-example">如 AaBaCaZa = 前3字第1码+末字第1码</span>
            </div>
          </div>
        </div>

        <div class="action-bar">
          <button class="btn btn-primary" :disabled="isEvaluating || !uploadedCodeMap" @click="runUploadedEvaluation">
            {{ isEvaluating ? '测评中...' : '开始测评' }}
          </button>
          <button v-if="uploadedCodeMap" class="btn btn-secondary" @click="clearUploaded">
            清除码表
          </button>
        </div>
      </div>

      <!-- 上传码表测评结果 -->
      <div v-if="uploadedResult || uploadedWordResult" class="result-panel">
        <!-- 子标签 -->
        <div class="sub-tabs">
          <button class="sub-tab-btn" :class="{ active: subTab === 'char' }" @click="subTab = 'char'">
            单字测评
          </button>
          <button class="sub-tab-btn" :class="{ active: subTab === 'word' }" @click="subTab = 'word'">
            词组测评
          </button>
        </div>
        <!-- 单字测评表格 -->
        <div v-if="subTab === 'char' && uploadedResult" class="table-container">
          <table class="eval-table">
            <thead>
              <tr class="scheme-title-row">
                <th colspan="20" class="scheme-title-cell">
                  <div class="scheme-title-content">
                    <template v-if="editingUploadedSchemeName">
                      <input 
                        v-model="uploadedSchemeName" 
                        class="scheme-name-input" 
                        @blur="finishEditSchemeName('upload')"
                        @keyup.enter="finishEditSchemeName('upload')"
                        autofocus
                      />
                      <span class="scheme-subtitle">单字测评数据</span>
                    </template>
                    <template v-else>
                      <span class="scheme-name-text" @click="startEditSchemeName('upload')">{{ uploadedSchemeName }}</span>
                      <Icon name="edit" :size="14" class="edit-icon" @click="startEditSchemeName('upload')" />
                      <span class="scheme-subtitle">单字测评数据</span>
                    </template>
                  </div>
                </th>
              </tr>
              <tr>
                <th class="sticky-col">统计范围</th>
                <th>1 码</th>
                <th>2 码</th>
                <th>3 码</th>
                <th>4 码</th>
                <th>5 码</th>
                <th>出简重</th>
                <th class="col-select">全码重</th>
                <th>理论二简</th>
                <th>加权键长</th>
                <th>字均当量</th>
                <th>键均当量</th>
                <th>用指平衡</th>
                <th>左右互击</th>
                <th>同指大跨</th>
                <th>同指小跨</th>
                <th>小指干扰</th>
                <th>错手</th>
                <th>三连击</th>
                <th>超标键位</th>
                <th>缺字标记</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(line, idx) in uploadedResult.lines" :key="idx">
                <tr :class="{ 'row-highlight': idx < 3 }">
                  <td class="sticky-col">{{ line.start + 1 }}~{{ line.end }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd1', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd1').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd2', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd2').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd3', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd3').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd4', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd4').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd5', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd5').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'simpleCollision', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'simpleCollision').count }}</td>
                  <td class="col-select clickable" @click="handleCellClick(line, 'fullCollision', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'fullCollision').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'brief2', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'brief2').count }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'cl')) }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'ziEq')) }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'keyEq')) }}</td>
                  <td>{{ fmt(calcFingerBalance(line.usage), 4) }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'dh', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'dh').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'ms', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'ms').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'ss', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'ss').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'pd', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'pd').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'lfd', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'lfd').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'trible', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'trible').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'overKey', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'overKey').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'lack', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'lack').count }}</td>
                </tr>
                
                <!-- 小计行（在第3行后） -->
                <tr v-if="idx === 2" class="row-subtotal">
                  <td class="sticky-col">小计</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd1', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd1').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd2', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd2').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd3', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd3').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd4', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd4').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd5', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd5').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'simpleCollision', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'simpleCollision').count }}</td>
                  <td class="col-select clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'fullCollision', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'fullCollision').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'brief2', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'brief2').count }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cl')) }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ziEq')) }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'keyEq')) }}</td>
                  <td>{{ fmt(calcFingerBalance(getSubtotal(uploadedResult.lines.slice(0, 3)).usage), 4) }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'dh', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'dh').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ms', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ms').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ss', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ss').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'pd', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'pd').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lfd', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lfd').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'trible', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'trible').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'overKey', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'overKey').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lack', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lack').count }}</td>
                </tr>
                
                <!-- 加权比重行（在小计行后） -->
                <tr v-if="idx === 2" class="row-weight">
                  <td class="sticky-col">加权比重</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd1') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd2') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd3') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd4') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd5') }}%</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'simpleCollision', '小计')">{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'simpleCollision') }}%</td>
                  <td class="col-select">{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'fullCollision') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'brief2') }}%</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'dh') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ms') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ss') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'pd') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lfd') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'trible') }}%</td>
                  <td>-</td>
                  <td>{{ getLackWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3))) }}%</td>
                </tr>
              </template>
              
              <!-- 总计行 -->
              <tr class="row-total">
                <td class="sticky-col">总计</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd1', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd1').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd2', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd2').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd3', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd3').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd4', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd4').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd5', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd5').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'simpleCollision', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'simpleCollision').count }}</td>
                <td class="col-select clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'fullCollision', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'fullCollision').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'brief2', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'brief2').count }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines), 'cl')) }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines), 'ziEq')) }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines), 'keyEq')) }}</td>
                <td>{{ fmt(calcFingerBalance(getSubtotal(uploadedResult.lines).usage), 4) }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'dh', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'dh').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'ms', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'ms').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'ss', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'ss').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'pd', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'pd').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'lfd', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'lfd').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'trible', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'trible').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'overKey', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'overKey').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'lack', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'lack').count }}</td>
              </tr>
              
              <!-- 总加权比重行 -->
              <tr class="row-weight">
                <td class="sticky-col">加权比重</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd1') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd2') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd3') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd4') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd5') }}%</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'simpleCollision', '总计')">{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'simpleCollision') }}%</td>
                <td class="col-select">{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'fullCollision') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'brief2') }}%</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'dh') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'ms') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'ss') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'pd') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'lfd') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'trible') }}%</td>
                <td>-</td>
                <td>{{ getLackWeightPercent(getSubtotal(uploadedResult.lines)) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 单字键位热力图 -->
        <div v-if="subTab === 'char' && uploadedResult" class="heatmap-container">
          <h3 class="section-title">键位使用分布（单位：%）</h3>
          <KeyboardHeatmap :usage="uploadedResult.usage" />
        </div>

        <!-- 词组测评表格 -->
        <div v-if="subTab === 'word' && uploadedWordResult" class="table-container">
          <table class="eval-table word-eval-table">
            <thead>
              <tr class="scheme-title-row">
                <th colspan="12" class="scheme-title-cell">
                  <div class="scheme-title-content">
                    <span class="scheme-name-text">{{ uploadedSchemeName }}</span>
                    <span class="scheme-subtitle">词组测评数据</span>
                  </div>
                </th>
              </tr>
              <tr>
                <th class="sticky-col">统计范围</th>
                <th class="col-select">选重</th>
                <th>加权词均当量</th>
                <th>左右互击</th>
                <th>同指大跨</th>
                <th>同指小跨</th>
                <th>小指干扰</th>
                <th>错手</th>
                <th>三连击</th>
                <th>超标键位</th>
                <th>缺词标记</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(line, idx) in uploadedWordResult.lines" :key="idx">
                <tr :class="{ 'row-highlight': idx < 3 }">
                  <td class="sticky-col">{{ line.start + 1 }}~{{ line.end }}</td>
                  <td class="col-select clickable" @click="handleWordCellClick(line, 'select', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'select').count }}</td>
                  <td>{{ fmt(getWordWeightedEq(line)) }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'dh', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'dh').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'ms', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'ms').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'ss', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'ss').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'pd', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'pd').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'lfd', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'lfd').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'trible', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'trible').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'overKey', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'overKey').count }}</td>
                  <td class="clickable" @click="handleWordCellClick(line, 'lack', `${line.start + 1}~${line.end}`)">{{ getWordColumnValue(line, 'lack').count }}</td>
                </tr>

                <tr v-if="idx === 2" class="row-subtotal">
                  <td class="sticky-col">小计</td>
                  <td class="col-select">{{ getWordWeightPercent(getWordSubtotal(uploadedWordResult.lines.slice(0, 3)), 'select') }}%</td>
                  <td>{{ fmt(getWordWeightedEq(getWordSubtotal(uploadedWordResult.lines.slice(0, 3)))) }}</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines.slice(0, 3)), 'dh') }}%</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines.slice(0, 3)), 'ms') }}%</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines.slice(0, 3)), 'ss') }}%</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines.slice(0, 3)), 'pd') }}%</td>
                  <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines.slice(0, 3)), 'lfd') }}%</td>
                  <td>{{ getWordWeightPercent(getWordSubtotal(uploadedWordResult.lines.slice(0, 3)), 'trible') }}%</td>
                  <td>-</td>
                  <td>{{ getWordLackWeightPercent(getWordSubtotal(uploadedWordResult.lines.slice(0, 3))) }}%</td>
                </tr>
              </template>

              <tr class="row-total">
                <td class="sticky-col">总计</td>
                <td class="col-select clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'select', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'select').count }}</td>
                <td>{{ fmt(getWordWeightedEq(getWordSubtotal(uploadedWordResult.lines))) }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'dh', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'dh').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'ms', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'ms').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'ss', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'ss').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'pd', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'pd').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'lfd', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'lfd').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'trible', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'trible').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'overKey', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'overKey').count }}</td>
                <td class="clickable" @click="handleWordCellClick(getWordSubtotal(uploadedWordResult.lines), 'lack', '总计')">{{ getWordColumnValue(getWordSubtotal(uploadedWordResult.lines), 'lack').count }}</td>
              </tr>

              <tr class="row-weight">
                <td class="sticky-col">加权比重</td>
                <td class="col-select">{{ getWordWeightPercent(getWordSubtotal(uploadedWordResult.lines), 'select') }}%</td>
                <td>-</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines), 'dh') }}%</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines), 'ms') }}%</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines), 'ss') }}%</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines), 'pd') }}%</td>
                <td>{{ getWordComboWeightPercent(getWordSubtotal(uploadedWordResult.lines), 'lfd') }}%</td>
                <td>{{ getWordWeightPercent(getWordSubtotal(uploadedWordResult.lines), 'trible') }}%</td>
                <td>-</td>
                <td>{{ getWordLackWeightPercent(getWordSubtotal(uploadedWordResult.lines)) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 词组键位热力图 -->
        <div v-if="subTab === 'word' && uploadedWordResult" class="heatmap-container">
          <h3 class="section-title">键位热力图（单位：%）</h3>
          <KeyboardHeatmap :usage="uploadedWordResult.usage" />
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetailModal" class="modal-overlay" @click.self="closeDetailModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ detailTitle }}</h3>
          <button class="modal-close" @click="closeDetailModal">&times;</button>
        </div>
        <div class="modal-body" @scroll="handleModalScroll">
          <!-- 单字详情表格 -->
          <template v-if="!isWordDetail">
            <table class="detail-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>汉字</th>
                  <th>编码</th>
                  <th>选重</th>
                  <th>重码位</th>
                  <th>字当量</th>
                  <th>键当量</th>
                  <th>字频</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in paginatedDetailItems" :key="item.char" :class="{ 'is-lack': item.isLack }">
                  <td>{{ (detailCurrentPage - 1) * detailPageSize + idx + 1 }}</td>
                  <td class="char-col">
                    {{ item.char }}
                    <span v-if="item.primaryChar && item.primaryChar !== item.char" class="primary-char">({{ item.primaryChar }})</span>
                  </td>
                  <td class="code-col">{{ item.code || '-' }}</td>
                  <td>{{ item.selectKey || '-' }}</td>
                  <td>{{ item.collision > 1 ? item.collision : '-' }}</td>
                  <td>{{ item.isLack || item.overKey > 0 ? '-' : fmt(item.ziEqCombo) }}</td>
                  <td>{{ item.isLack || item.overKey > 0 ? '-' : fmt(item.keyEqCombo) }}</td>
                  <td>{{ item.freq }}</td>
                </tr>
              </tbody>
            </table>
            <!-- 单字分页控制 -->
            <div class="pagination" v-if="detailTotalPages > 1">
              <button class="page-btn" :disabled="detailCurrentPage === 1" @click="goToDetailFirstPage">首页</button>
              <button class="page-btn" :disabled="detailCurrentPage === 1" @click="goToDetailPrevPage">上一页</button>
              <span class="page-info">第 {{ detailCurrentPage }} / {{ detailTotalPages }} 页</span>
              <button class="page-btn" :disabled="detailCurrentPage === detailTotalPages" @click="goToDetailNextPage">下一页</button>
              <button class="page-btn" :disabled="detailCurrentPage === detailTotalPages" @click="goToDetailLastPage">尾页</button>
              <div class="page-jump">
                <input v-model="detailJumpPage" type="number" min="1" :max="detailTotalPages" class="page-input" placeholder="页码" @keyup.enter="handleDetailJump" />
                <button class="page-btn" @click="handleDetailJump">跳转</button>
              </div>
            </div>
          </template>
          <!-- 词组详情表格 -->
          <template v-else>
            <table class="detail-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>词组</th>
                  <th>编码</th>
                  <th>重码位</th>
                  <th>词频</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in paginatedDetailWordItems" :key="item.word" :class="{ 'is-lack': item.isLack }">
                  <td>{{ (detailWordCurrentPage - 1) * detailPageSize + idx + 1 }}</td>
                  <td class="char-col">
                    {{ item.word }}
                    <span v-if="item.primaryWord && item.primaryWord !== item.word" class="primary-char">({{ item.primaryWord }})</span>
                  </td>
                  <td class="code-col">{{ item.code || '-' }}</td>
                  <td>{{ item.collision > 1 ? item.collision : '-' }}</td>
                  <td>{{ item.freq }}</td>
                </tr>
              </tbody>
            </table>
            <!-- 词组分页控制 -->
            <div class="pagination" v-if="detailWordTotalPages > 1">
              <button class="page-btn" :disabled="detailWordCurrentPage === 1" @click="goToDetailWordFirstPage">首页</button>
              <button class="page-btn" :disabled="detailWordCurrentPage === 1" @click="goToDetailWordPrevPage">上一页</button>
              <span class="page-info">第 {{ detailWordCurrentPage }} / {{ detailWordTotalPages }} 页</span>
              <button class="page-btn" :disabled="detailWordCurrentPage === detailWordTotalPages" @click="goToDetailWordNextPage">下一页</button>
              <button class="page-btn" :disabled="detailWordCurrentPage === detailWordTotalPages" @click="goToDetailWordLastPage">尾页</button>
              <div class="page-jump">
                <input v-model="detailWordJumpPage" type="number" min="1" :max="detailWordTotalPages" class="page-input" placeholder="页码" @keyup.enter="handleDetailWordJump" />
                <button class="page-btn" @click="handleDetailWordJump">跳转</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.evaluate-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px;
}

/* 顶部工具栏 - 现代卡片风格 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--bg2) 0%, var(--bg1) 100%);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.title {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.config-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-group label {
  font-size: 13px;
  color: var(--text2);
  font-weight: 500;
}

.config-input {
  width: 80px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  transition: all 0.2s ease;
}

.config-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

/* 标签页 - 胶囊按钮风格 */
.tabs {
  display: flex;
  gap: 8px;
  padding: 6px;
  background: var(--bg2);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
  position: relative;
}

.tab-btn {
  flex: 1;
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}

.tab-btn.active {
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

/* 子标签 */
.sub-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg3);
  border-radius: 10px;
  margin-bottom: 16px;
  width: fit-content;
}

.sub-tab-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sub-tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}

.sub-tab-btn.active {
  background: var(--primary);
  color: white;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

/* 操作栏 */
.action-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg2);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  margin-bottom: 8px;
}

.hint {
  font-size: 13px;
  color: var(--text3);
}

.result-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 表格容器 - 现代卡片风格 */
.table-container {
  overflow-x: auto;
  background: var(--bg2);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.eval-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  text-align: center;
}

.eval-table th,
.eval-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  white-space: nowrap;
  min-width: 44px;
}

.eval-table th {
  background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%);
  font-weight: 600;
  font-size: 12px;
  color: var(--text2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.eval-table th:first-child {
  border-radius: 16px 0 0 0;
}

.eval-table th:last-child {
  border-radius: 0 16px 0 0;
}

.eval-table .sticky-col {
  position: sticky;
  left: 0;
  background: var(--bg2);
  z-index: 1;
  text-align: left;
  font-weight: 600;
  min-width: 80px;
}

.eval-table th.sticky-col {
  z-index: 3;
}

.eval-table .col-select {
  color: #f43f5e !important;
  font-weight: 700;
}

/* 选重列可点击时保持红色 */
.eval-table td.col-select.clickable {
  color: #f43f5e !important;
}

.eval-table td.col-select.clickable:hover {
  background: linear-gradient(135deg, #f43f5e 0%, #ec4899 100%);
  color: white !important;
}

.eval-table .row-highlight {
  background: rgba(99, 102, 241, 0.03);
}

.eval-table .row-subtotal {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%);
  font-weight: 600;
}

.eval-table .row-total {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, transparent 100%);
  font-weight: 700;
  font-size: 14px;
}

.eval-table .row-weight {
  background: var(--bg3);
  font-size: 12px;
  color: var(--text);
  font-weight: 500;
}

.eval-table .row-weight td {
  color: var(--text2);
}

/* 可点击单元格 - 现代标签风格 */
.eval-table td.clickable {
  cursor: pointer;
  color: var(--primary);
  font-weight: 600;
  transition: all 0.2s ease;
}

.eval-table td.clickable:hover {
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  color: white;
  border-radius: 6px;
  transform: scale(1.08);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

/* 热力图容器 */
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
}

.heatmap-container {
  background: var(--bg2);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 20px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

/* 方案名称表头 - 表格内部标题行 */
.scheme-title-row {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%);
}

.scheme-title-cell {
  padding: 16px !important;
  text-align: center !important;
  border-radius: 16px 16px 0 0;
}

.scheme-title-content {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}

.scheme-name-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  transition: color 0.2s ease;
}

.scheme-name-text:hover {
  color: var(--primary);
}

.scheme-name-input {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  background: var(--bg);
  border: 2px solid var(--primary);
  border-radius: 8px;
  padding: 4px 12px;
  outline: none;
  min-width: 200px;
}

.scheme-subtitle {
  font-size: 14px;
  font-weight: 500;
  color: var(--text2);
}

.edit-icon {
  color: var(--text3);
  cursor: pointer;
  transition: color 0.2s ease;
}

.edit-icon:hover {
  color: var(--primary);
}

/* 上传区域 */
.upload-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-area {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 24px;
  background: linear-gradient(135deg, var(--bg2) 0%, var(--bg1) 100%);
  border: 2px dashed rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.upload-area:hover {
  border-color: var(--primary);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
}

.upload-icon {
  font-size: 28px;
  opacity: 0.7;
}

.upload-text {
  text-align: center;
}

.upload-text p {
  margin: 6px 0;
}

.file-name {
  font-weight: 600;
  color: var(--primary);
  font-size: 15px;
}

.file-info {
  font-size: 13px;
  color: var(--text2);
}

.upload-hint {
  font-size: 12px;
  color: var(--text3);
}

/* 组词规则配置 */
.rule-config {
  padding: 16px 20px;
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.rule-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px 0;
}

.rule-hint {
  font-size: 12px;
  color: var(--text3);
  margin: 0 0 16px 0;
  line-height: 1.5;
}

.rule-inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.rule-item label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  min-width: 70px;
}

.rule-input {
  flex: 0 0 140px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  font-family: 'SF Mono', 'JetBrains Mono', 'Consolas', monospace;
  transition: all 0.2s ease;
}

.rule-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

.rule-input::placeholder {
  color: var(--text3);
}

.rule-example {
  font-size: 12px;
  color: var(--text3);
  font-style: italic;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 32px;
  color: var(--text2);
  background: var(--bg2);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.4;
}

/* 按钮样式 */
.btn {
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  background: var(--bg3);
  color: var(--text);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-secondary:hover {
  background: var(--bg1);
  border-color: rgba(255, 255, 255, 0.2);
}

/* 模态框 - 清晰实底风格 */
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
  max-width: 900px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg3);
}

.modal-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--text2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: #f43f5e;
  color: white;
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  background: var(--bg2);
}

/* 详情表格 - 清晰风格 */
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.detail-table th,
.detail-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.detail-table th {
  background: var(--bg3);
  font-weight: 600;
  font-size: 12px;
  color: var(--text2);
}

.detail-table tr:hover {
  background: var(--bg3);
}

.detail-table tr.is-lack {
  background: rgba(244, 63, 94, 0.08);
}

.detail-table tr.is-lack:hover {
  background: rgba(244, 63, 94, 0.12);
}

.detail-table .char-col {
  font-size: 18px;
  text-align: center;
  font-weight: 500;
}

.detail-table .primary-char {
  font-size: 14px;
  color: var(--text3);
  margin-left: 4px;
}

.detail-table .code-col {
  font-family: 'SF Mono', 'JetBrains Mono', 'Consolas', monospace;
  color: var(--primary);
  font-weight: 500;
}

/* 分页控制 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 0;
  margin-top: 16px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.page-btn {
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: var(--bg3);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.page-btn:hover:not(:disabled) {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--text2);
  font-weight: 500;
  margin: 0 8px;
}

.page-jump {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
}

.page-input {
  width: 60px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  text-align: center;
}

.page-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

/* 隐藏数字输入框的上下箭头 */
.page-input::-webkit-outer-spin-button,
.page-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}
.page-input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
