<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { unicodeHex } from '../../engine/unicode'
import Icon from '../Icon.vue'

const { 
  engine, toast, rootsVersion, configVersion, selectChar, charsetVersion, getCurrentCharset,
  bracedRootToPua, isBracedRoot 
} = useEngine()

// ============ 标签切换 ============

const activeTab = ref<'char' | 'word'>('char')

// 显示字根（花括号字根转为 PUA 字符）
function displayRoot(root: string): string {
  return bracedRootToPua(root)
}

// 获取字根的字体样式类
function getRootFontClass(root: string): string {
  return isBracedRoot(root) ? 'pua-font' : ''
}

// 导出功能
function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 搜索、筛选和分页
const searchQuery = ref('')
const statusFilter = ref<'all' | '完整' | '缺失'>('all')
const currentPage = ref(1)
const pageSize = 50

// 获取字根的完整编码字符串（考虑等效字根）
function getRootFullCode(root: string): string {
  // 先尝试直接获取编码
  const rootCode = engine.rootCodes.get(root)
  if (rootCode) {
    return (rootCode.main || '') + (rootCode.sub || '') + (rootCode.supplement || '')
  }
  
  // 如果没有直接编码，检查是否是等效字根
  const effectiveCode = engine.getEffectiveRootCode(root)
  if (effectiveCode) {
    return (effectiveCode.main || '') + (effectiveCode.sub || '') + (effectiveCode.supplement || '')
  }
  
  return ''
}

function normalizePinyin(py: string): string {
  return py.toLowerCase().replace(/[^a-züv]/g, '')
}

function extractPinyinPart(ch: string, part: 'first_letter' | 'last_letter' | 'initial' | 'final'): string {
  const pyList = engine.getPinyinList(ch)
  if (pyList.length === 0) return ''
  const firstSyllable = pyList[0].py.split(/\s+/)[0] || ''
  const py = normalizePinyin(firstSyllable)
  if (!py) return ''

  if (part === 'first_letter') return py[0] || ''
  if (part === 'last_letter') return py[py.length - 1] || ''

  const initials = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']
  for (const initial of initials) {
    if (py.startsWith(initial)) {
      return part === 'initial' ? initial : py.slice(initial.length)
    }
  }
  return part === 'initial' ? '' : py
}

// 根据用户定义的规则计算单字编码
function calculateCharCode(char: string): string {
  // 触发 configVersion 依赖，确保规则变更时重新计算
  configVersion.value
  return engine.calculateCharCode(char)
}

// 执行编码规则（通用函数，支持多字词）
function executeCodeRules(rules: ReturnType<typeof engine.getCodeRules>, charsRoots: string[][]): string {
  let code = ''
  let currentNodeId = 'start'
  const visited = new Set<string>()
  const maxIterations = 100 // 防止无限循环
  
  while (currentNodeId !== 'end' && !visited.has(currentNodeId) && visited.size < maxIterations) {
    visited.add(currentNodeId)
    
    const node = rules.find(r => r.id === currentNodeId)
    if (!node) break
    
    if (node.type === 'start') {
      // 开始节点：跳转到 nextNode 指定的节点
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        break
      }
    } else if (node.type === 'pick') {
      // 取码节点
      const charIdx = node.charIndex || 1
      const rootIdx = node.rootIndex || 1
      const codeIdx = node.codeIndex || 1
      
      // 计算实际字索引（-1 表示末字，-2 表示末2字）
      let actualCharIdx: number
      if (charIdx === -1) {
        actualCharIdx = charsRoots.length - 1
      } else if (charIdx === -2) {
        actualCharIdx = charsRoots.length - 2
      } else {
        actualCharIdx = charIdx - 1
      }
      
      // 获取该字的字根列表
      const charRoots = charsRoots[actualCharIdx] || []
      
      // 计算实际字根索引（-1 表示末根）
      const actualRootIdx = rootIdx === -1 ? charRoots.length - 1 : rootIdx - 1
      
      if (actualRootIdx >= 0 && actualRootIdx < charRoots.length) {
        const root = charRoots[actualRootIdx]
        const fullCode = getRootFullCode(root)
        
        if (fullCode) {
          // 计算实际码位索引（-1 表示末码）
          const actualCodeIdx = codeIdx === -1 ? fullCode.length - 1 : codeIdx - 1
          
          if (actualCodeIdx >= 0 && actualCodeIdx < fullCode.length) {
            code += fullCode[actualCodeIdx]
          }
        }
      }
      
      // 跳转到下一节点
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        break
      }
    } else if (node.type === 'condition') {
      // 条件判断节点
      let conditionMet = false
      
      if (node.conditionType === 'char_exists') {
        // 多字词条件：判断第N个字是否存在
        const idx = (node.conditionValue || 1) - 1
        conditionMet = idx >= 0 && idx < charsRoots.length
      } else if (node.conditionType === 'root_exists') {
        // 单字条件：判断第N个根是否存在
        const idx = (node.conditionValue || 1) - 1
        // 对于多字词，这里取第一个字的字根（兼容）
        const roots = charsRoots[0] || []
        conditionMet = idx >= 0 && idx < roots.length
      } else if (node.conditionType === 'root_has_code') {
        // 单字条件：判断第N个根是否有第M码
        const rootIdx = (node.conditionValue || 1) - 1
        const codeIdx = (node.conditionCodeIndex || 1) - 1
        
        const roots = charsRoots[0] || []
        if (rootIdx >= 0 && rootIdx < roots.length) {
          const root = roots[rootIdx]
          const fullCode = getRootFullCode(root)
          conditionMet = codeIdx >= 0 && codeIdx < fullCode.length
        }
      } else if (node.conditionType === 'root_count') {
        // 单字条件：判断字根数量是否 >= N
        const roots = charsRoots[0] || []
        conditionMet = roots.length >= (node.conditionValue || 1)
      }
      
      // 根据条件结果跳转
      if (conditionMet && node.trueBranch) {
        currentNodeId = node.trueBranch
      } else if (!conditionMet && node.falseBranch) {
        currentNodeId = node.falseBranch
      } else {
        // 没有配置分支，跳到下一个节点
        const currentIdx = rules.findIndex(r => r.id === node.id)
        if (currentIdx >= 0 && currentIdx < rules.length - 1) {
          currentNodeId = rules[currentIdx + 1].id
        } else {
          break
        }
      }
    } else if (node.type === 'end') {
      break
    } else {
      break
    }
  }
  
  return code
}

// 计算多字词编码，同时收集取码过程中使用的字根和码位索引
function calculateWordCodeWithRoots(word: string): { code: string; usedRoots: { charIndex: number; root: string; codeIndex: number }[] } {
  configVersion.value
  
  const rules = engine.getWordCodeRules()
  
  if (rules.length < 2) return { code: '', usedRoots: [] }
  
  const hasActualRules = rules.some(r => r.type !== 'start' && r.type !== 'end')
  if (!hasActualRules) return { code: '', usedRoots: [] }
  
  // 获取每个字的字根
  const chars = [...word]
  const charsRoots: string[][] = []
  for (const char of chars) {
    const decomp = engine.decompose(char)
    charsRoots.push(decomp.leaves)
  }
  
  // 执行规则并收集使用的字根和码位索引（使用数组保持顺序，用复合键去重）
  const usedRootsList: { charIndex: number; root: string; codeIndex: number }[] = []
  const usedRootsSet = new Set<string>()
  let code = ''
  let currentNodeId = 'start'
  const visited = new Set<string>()
  const maxIterations = 100
  
  while (currentNodeId !== 'end' && !visited.has(currentNodeId) && visited.size < maxIterations) {
    visited.add(currentNodeId)
    
    const node = rules.find(r => r.id === currentNodeId)
    if (!node) break
    
    if (node.type === 'start') {
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        break
      }
    } else if (node.type === 'pick') {
      const charIdx = node.charIndex || 1
      
      // 计算实际字索引
      let actualCharIdx: number
      if (charIdx === -1) {
        actualCharIdx = charsRoots.length - 1
      } else if (charIdx === -2) {
        actualCharIdx = charsRoots.length - 2
      } else {
        actualCharIdx = charIdx - 1
      }
      
      if (node.pickType === 'pinyin') {
        const part = node.pinyinPart || 'first_letter'
        const targetChar = chars[actualCharIdx]
        if (targetChar) code += extractPinyinPart(targetChar, part)
      } else {
        const rootIdx = node.rootIndex || 1
        const codeIdx = node.codeIndex || 1
        const charRoots = charsRoots[actualCharIdx] || []

        // 计算实际字根索引和码位索引
        // -1 表示末根，如果请求的字根索引超出范围，回退到末根并调整码位索引
        let actualRootIdx: number
        let adjustedCodeIdx: number = codeIdx // 调整后的码位索引（1-indexed）

        if (rootIdx === -1) {
          actualRootIdx = charRoots.length - 1
        } else if (rootIdx > charRoots.length) {
          // 如果请求的字根不存在，回退到末根
          actualRootIdx = charRoots.length - 1
          // 调整码位索引：加上 (请求的字根索引 - 实际字根数) 的差值
          // 例如：请求第2根首码，只有1根，则取第1根的第(1 + 2 - 1) = 第2码
          adjustedCodeIdx = codeIdx + (rootIdx - charRoots.length)
        } else {
          actualRootIdx = rootIdx - 1
        }

        if (actualRootIdx >= 0 && actualRootIdx < charRoots.length) {
          const root = charRoots[actualRootIdx]
          const fullCode = getRootFullCode(root)

          // 计算实际码位索引（使用调整后的码位索引）
          const actualCodeIdx = adjustedCodeIdx === -1 ? (fullCode ? fullCode.length - 1 : 0) : adjustedCodeIdx - 1

          // 记录使用的字根和码位索引（使用复合键去重，但保持顺序）
          const key = `${actualCharIdx}-${actualRootIdx}-${actualCodeIdx}`
          if (!usedRootsSet.has(key)) {
            usedRootsSet.add(key)
            usedRootsList.push({
              charIndex: actualCharIdx,
              root,
              codeIndex: actualCodeIdx // 码位索引（0-indexed）
            })
          }

          if (fullCode) {
            if (actualCodeIdx >= 0 && actualCodeIdx < fullCode.length) {
              code += fullCode[actualCodeIdx]
            }
          }
        }
      }
      
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        break
      }
    } else if (node.type === 'condition') {
      let conditionMet = false
      
      if (node.conditionType === 'char_exists') {
        const idx = (node.conditionValue || 1) - 1
        conditionMet = idx >= 0 && idx < charsRoots.length
      } else if (node.conditionType === 'root_exists') {
        const idx = (node.conditionValue || 1) - 1
        const roots = charsRoots[0] || []
        conditionMet = idx >= 0 && idx < roots.length
      } else if (node.conditionType === 'root_has_code') {
        const rootIdx = (node.conditionValue || 1) - 1
        const codeIdx = (node.conditionCodeIndex || 1) - 1
        const roots = charsRoots[0] || []
        if (rootIdx >= 0 && rootIdx < roots.length) {
          const root = roots[rootIdx]
          const fullCode = getRootFullCode(root)
          conditionMet = codeIdx >= 0 && codeIdx < fullCode.length
        }
      } else if (node.conditionType === 'root_count') {
        const roots = charsRoots[0] || []
        conditionMet = roots.length >= (node.conditionValue || 1)
      }
      
      if (conditionMet && node.trueBranch) {
        currentNodeId = node.trueBranch
      } else if (!conditionMet && node.falseBranch) {
        currentNodeId = node.falseBranch
      } else {
        const currentIdx = rules.findIndex(r => r.id === node.id)
        if (currentIdx >= 0 && currentIdx < rules.length - 1) {
          currentNodeId = rules[currentIdx + 1].id
        } else {
          break
        }
      }
    } else if (node.type === 'end') {
      break
    } else {
      break
    }
  }
  
  return { code, usedRoots: usedRootsList }
}

// 计算多字词编码
function calculateWordCode(word: string): string {
  return calculateWordCodeWithRoots(word).code
}

// ============ 单字数据 ============

// 获取所有汉字并按字频降序排序（根据当前选择的字集）
const sortedChars = computed(() => {
  rootsVersion.value
  charsetVersion.value // 依赖字集版本，当字集切换时重新计算
  const chars = getCurrentCharset()
  
  // 按字频降序排序
  return [...chars].sort((a, b) => {
    const freqA = engine.freq.get(a) || 0
    const freqB = engine.freq.get(b) || 0
    return freqB - freqA
  })
})

// ============ 多字词数据 ============

// 获取所有多字词（2字及以上）并按词频降序排序
const sortedWords = computed(() => {
  rootsVersion.value
  configVersion.value
  
  const words: string[] = []
  
  // 从词频数据中获取多字词
  for (const [word, freq] of engine.freq) {
    if (word.length >= 2) {
      words.push(word)
    }
  }
  
  // 按词频降序排序
  return words.sort((a, b) => {
    const freqA = engine.freq.get(a) || 0
    const freqB = engine.freq.get(b) || 0
    return freqB - freqA
  })
})

// 当前数据列表（根据标签）
const currentItems = computed(() => {
  return activeTab.value === 'char' ? sortedChars.value : sortedWords.value
})

// 检查单字编码状态
function getCharCodeStatus(char: string): '完整' | '缺失' {
  const code = calculateCharCode(char)
  return code ? '完整' : '缺失'
}

// 检查多字词编码状态
function getWordCodeStatus(word: string): '完整' | '缺失' {
  const code = calculateWordCode(word)
  return code ? '完整' : '缺失'
}

// 获取编码状态（通用）
function getCodeStatus(item: string): '完整' | '缺失' {
  return activeTab.value === 'char' ? getCharCodeStatus(item) : getWordCodeStatus(item)
}

// 搜索和状态过滤
const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const status = statusFilter.value
  
  return currentItems.value.filter(item => {
    // 状态筛选
    if (status !== 'all') {
      const itemStatus = getCodeStatus(item)
      if (itemStatus !== status) return false
    }
    
    // 搜索筛选
    if (query) {
      const code = activeTab.value === 'char' ? calculateCharCode(item) : calculateWordCode(item)
      if (!item.includes(searchQuery.value) && !code.toLowerCase().includes(query)) {
        return false
      }
    }
    
    return true
  })
})

// 分页
const totalPages = computed(() => Math.ceil(filteredItems.value.length / pageSize))
const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredItems.value.slice(start, start + pageSize)
})

// 获取单字完整信息
function getCharInfo(char: string) {
  const decomp = engine.decompose(char)
  const code = calculateCharCode(char)
  const pyList = engine.getPinyinList(char)
  const freq = engine.freq.get(char) || 0
  
  const allPinyin = pyList.map(p => p.py).join(' ')
  
  const roots = decomp.leaves
  const rootInfos = roots.map(root => ({
    root,
    hasCode: !!getRootFullCode(root)
  }))
  
  return {
    char,
    unicode: unicodeHex(char),
    pinyin: allPinyin,
    roots: rootInfos,
    code,
    codeLength: code.length,
    freq,
    status: getCharCodeStatus(char),
  }
}

// 获取多字词完整信息
function getWordInfo(word: string) {
  const { code, usedRoots } = calculateWordCodeWithRoots(word)
  const freq = engine.freq.get(word) || 0
  
  // 获取每个字的拆分（所有字根）
  const wordChars = [...word]
  const allCharsRoots: string[][] = []
  for (const char of wordChars) {
    const decomp = engine.decompose(char)
    allCharsRoots.push(decomp.leaves)
  }

  // 构建每个字的信息，显示被使用的字根及其码位索引
  const charInfos = []
  for (let i = 0; i < allCharsRoots.length; i++) {
    const char = wordChars[i]
    const allRoots = allCharsRoots[i]
    
    // 获取该字被使用的字根（按使用顺序）
    const usedRootsForChar = usedRoots.filter(ur => ur.charIndex === i)
    
    // 如果有被使用的字根，只显示这些；否则显示所有字根
    // 使用 usedRoots 中的 codeIndex 来显示码位索引
    const rootInfosToShow = usedRootsForChar.length > 0 
      ? usedRootsForChar.map(ur => ({
          root: ur.root,
          codeIndex: ur.codeIndex, // 码位索引（0-indexed）
          hasCode: !!getRootFullCode(ur.root),
          isUsed: true
        }))
      : allRoots.map((root, idx) => ({
          root,
          codeIndex: 0, // 默认显示第1码
          hasCode: !!getRootFullCode(root),
          isUsed: false
        }))
    
    charInfos.push({
      char,
      rootInfos: rootInfosToShow
    })
  }
  
  return {
    word,
    length: word.length,
    charInfos,
    code,
    codeLength: code.length,
    freq,
    status: getWordCodeStatus(word),
    usedRoots,
  }
}

// 统计
const statsInfo = computed(() => {
  let encoded = 0
  let total = 0
  let encodedWeight = 0
  let totalWeight = 0
  
  for (const item of currentItems.value) {
    total++
    const freq = engine.freq.get(item) || 0
    totalWeight += freq
    
    if (getCodeStatus(item) === '完整') {
      encoded++
      encodedWeight += freq
    }
  }
  
  return {
    total,
    encoded,
    rate: totalWeight > 0 ? (encodedWeight / totalWeight * 100).toFixed(1) : '0'
  }
})

// 重置页码
watch([searchQuery, statusFilter, activeTab], () => {
  currentPage.value = 1
})

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

// 导出单字码表
function exportCharCodeTable() {
  const chars = sortedChars.value
  const lines: string[] = []
  
  for (const char of chars) {
    const code = calculateCharCode(char)
    if (code) {
      const freq = engine.freq.get(char) || 0
      lines.push(`${char}\t${code}\t${freq}`)
    }
  }
  
  if (lines.length === 0) {
    toast('没有可导出的数据')
    return
  }
  
  const content = lines.join('\n')
  downloadFile(content, 'char_code.txt')
  toast(`已导出 ${lines.length} 条单字编码`)
}

// 导出多字词码表
function exportWordCodeTable() {
  const words = sortedWords.value
  const lines: string[] = []
  
  for (const word of words) {
    const code = calculateWordCode(word)
    if (code) {
      const freq = engine.freq.get(word) || 0
      lines.push(`${word}\t${code}\t${freq}`)
    }
  }
  
  if (lines.length === 0) {
    toast('没有可导出的数据')
    return
  }
  
  const content = lines.join('\n')
  downloadFile(content, 'word_code.txt')
  toast(`已导出 ${lines.length} 条多字词编码`)
}

// 计算元素序列（跟踪每个码对应的元素）
function calculateElementSequence(char: string): string[] {
  // 触发 configVersion 依赖，确保规则变更时重新计算
  configVersion.value
  
  const rules = engine.getCodeRules()
  
  // 如果没有规则或只有开始/结束节点（空配置），返回空
  if (rules.length < 2) return []
  
  // 检查是否只有开始和结束节点（空配置）
  const hasActualRules = rules.some(r => r.type !== 'start' && r.type !== 'end')
  if (!hasActualRules) return []
  
  const decomp = engine.decompose(char)
  const roots = decomp.leaves
  
  if (!roots.length) return []
  
  const elements: string[] = []
  let currentNodeId = 'start'
  const visited = new Set<string>()
  const maxIterations = 100
  
  while (currentNodeId !== 'end' && !visited.has(currentNodeId) && visited.size < maxIterations) {
    visited.add(currentNodeId)
    
    const node = rules.find(r => r.id === currentNodeId)
    if (!node) break
    
    if (node.type === 'start') {
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        break
      }
    } else if (node.type === 'pick') {
      if (node.pickType === 'pinyin') {
        const part = node.pinyinPart || 'first_letter'
        const symbol = part === 'last_letter' ? '末字母' : part === 'initial' ? '声母' : part === 'final' ? '韵母' : '首字母'
        elements.push(`字音.${symbol}`)
      } else {
        const rootIdx = node.rootIndex || 1
        const codeIdx = node.codeIndex || 1

        // 计算实际字根索引和码位索引
        // -1 表示末根，如果请求的字根索引超出范围，回退到末根并调整码位索引
        let actualRootIdx: number
        let adjustedCodeIdx: number = codeIdx // 调整后的码位索引（1-indexed）

        if (rootIdx === -1) {
          actualRootIdx = roots.length - 1
        } else if (rootIdx > roots.length) {
          // 如果请求的字根不存在，回退到末根
          actualRootIdx = roots.length - 1
          // 调整码位索引
          adjustedCodeIdx = codeIdx + (rootIdx - roots.length)
        } else {
          actualRootIdx = rootIdx - 1
        }

        if (actualRootIdx >= 0 && actualRootIdx < roots.length) {
          const root = roots[actualRootIdx]
          const fullCode = getRootFullCode(root)

          // 计算实际码位索引（使用调整后的码位索引）
          const actualCodeIdx = adjustedCodeIdx === -1 ? (fullCode ? fullCode.length - 1 : 0) : adjustedCodeIdx - 1

          if (fullCode && actualCodeIdx >= 0 && actualCodeIdx < fullCode.length) {
            // 添加元素：字根 + 码位索引
            elements.push(`${root}.${actualCodeIdx}`)
          }
        }
      }
      
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        break
      }
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
      
      if (conditionMet && node.trueBranch) {
        currentNodeId = node.trueBranch
      } else if (!conditionMet && node.falseBranch) {
        currentNodeId = node.falseBranch
      } else {
        const currentIdx = rules.findIndex(r => r.id === node.id)
        if (currentIdx >= 0 && currentIdx < rules.length - 1) {
          currentNodeId = rules[currentIdx + 1].id
        } else {
          break
        }
      }
    } else if (node.type === 'end') {
      break
    } else {
      break
    }
  }
  
  return elements
}

// 计算多字词元素序列（跟踪每个码对应的元素）
function calculateWordElementSequence(word: string): string[] {
  configVersion.value
  
  const rules = engine.getWordCodeRules()
  
  if (rules.length < 2) return []
  
  const hasActualRules = rules.some(r => r.type !== 'start' && r.type !== 'end')
  if (!hasActualRules) return []
  
  // 获取每个字的字根
  const chars = [...word]
  const charsRoots: string[][] = []
  for (const char of chars) {
    const decomp = engine.decompose(char)
    charsRoots.push(decomp.leaves)
  }
  
  const elements: string[] = []
  let currentNodeId = 'start'
  const visited = new Set<string>()
  const maxIterations = 100
  
  while (currentNodeId !== 'end' && !visited.has(currentNodeId) && visited.size < maxIterations) {
    visited.add(currentNodeId)
    
    const node = rules.find(r => r.id === currentNodeId)
    if (!node) break
    
    if (node.type === 'start') {
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        break
      }
    } else if (node.type === 'pick') {
      const charIdx = node.charIndex || 1
      
      // 计算实际字索引
      let actualCharIdx: number
      if (charIdx === -1) {
        actualCharIdx = charsRoots.length - 1
      } else if (charIdx === -2) {
        actualCharIdx = charsRoots.length - 2
      } else {
        actualCharIdx = charIdx - 1
      }
      
      if (node.pickType === 'pinyin') {
        const part = node.pinyinPart || 'first_letter'
        const symbol = part === 'last_letter' ? '末字母' : part === 'initial' ? '声母' : part === 'final' ? '韵母' : '首字母'
        elements.push(`${chars[actualCharIdx] || '?'}.字音.${symbol}`)
      } else {
        const rootIdx = node.rootIndex || 1
        const codeIdx = node.codeIndex || 1
        const charRoots = charsRoots[actualCharIdx] || []

        // 计算实际字根索引和码位索引
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

          const actualCodeIdx = adjustedCodeIdx === -1 ? (fullCode ? fullCode.length - 1 : 0) : adjustedCodeIdx - 1

          if (fullCode && actualCodeIdx >= 0 && actualCodeIdx < fullCode.length) {
            elements.push(`${root}.${actualCodeIdx}`)
          }
        }
      }
      
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        break
      }
    } else if (node.type === 'condition') {
      let conditionMet = false
      
      if (node.conditionType === 'char_exists') {
        const idx = (node.conditionValue || 1) - 1
        conditionMet = idx >= 0 && idx < charsRoots.length
      } else if (node.conditionType === 'root_exists') {
        const idx = (node.conditionValue || 1) - 1
        const roots = charsRoots[0] || []
        conditionMet = idx >= 0 && idx < roots.length
      } else if (node.conditionType === 'root_has_code') {
        const rootIdx = (node.conditionValue || 1) - 1
        const codeIdx = (node.conditionCodeIndex || 1) - 1
        const roots = charsRoots[0] || []
        if (rootIdx >= 0 && rootIdx < roots.length) {
          const root = roots[rootIdx]
          const fullCode = getRootFullCode(root)
          conditionMet = codeIdx >= 0 && codeIdx < fullCode.length
        }
      } else if (node.conditionType === 'root_count') {
        const roots = charsRoots[0] || []
        conditionMet = roots.length >= (node.conditionValue || 1)
      }
      
      if (conditionMet && node.trueBranch) {
        currentNodeId = node.trueBranch
      } else if (!conditionMet && node.falseBranch) {
        currentNodeId = node.falseBranch
      } else {
        const currentIdx = rules.findIndex(r => r.id === node.id)
        if (currentIdx >= 0 && currentIdx < rules.length - 1) {
          currentNodeId = rules[currentIdx + 1].id
        } else {
          break
        }
      }
    } else if (node.type === 'end') {
      break
    } else {
      break
    }
  }
  
  return elements
}

// 导出元素序列
function exportElementSequence() {
  const lines: string[] = []
  
  if (activeTab.value === 'char') {
    // 单字元素序列
    for (const char of sortedChars.value) {
      const elements = calculateElementSequence(char)
      if (elements.length > 0) {
        const freq = engine.freq.get(char) || 0
        lines.push(`${char}\t${elements.join(' ')}\t${freq}`)
      }
    }
  } else {
    // 多字词元素序列
    for (const word of sortedWords.value) {
      const elements = calculateWordElementSequence(word)
      if (elements.length > 0) {
        const freq = engine.freq.get(word) || 0
        lines.push(`${word}\t${elements.join(' ')}\t${freq}`)
      }
    }
  }
  
  if (lines.length === 0) {
    toast('没有可导出的数据')
    return
  }
  
  const filename = activeTab.value === 'char' ? 'char_input-division.txt' : 'word_input-division.txt'
  const content = lines.join('\n')
  downloadFile(content, filename)
  toast(`已导出 ${lines.length} 条元素序列`)
}

// 导出码表
function exportCodeTable() {
  if (activeTab.value === 'char') {
    exportCharCodeTable()
  } else {
    exportWordCodeTable()
  }
}
</script>

<template>
  <div class="code-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title"><Icon name="code" :size="18" /> 编码</span>
        
        <!-- 标签切换 -->
        <div class="tab-switch">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'char' }"
            @click="activeTab = 'char'"
          >
            单字
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'word' }"
            @click="activeTab = 'word'"
          >
            多字词
          </button>
        </div>
        
        <span class="count">{{ statsInfo.total }} {{ activeTab === 'char' ? '字' : '词' }}</span>
        <span class="encoded-info">已编码: {{ statsInfo.encoded }} ({{ statsInfo.rate }}%)</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm btn-primary" @click="exportElementSequence" title="导出元素序列，可用于码灵优化器（Code Genie）优化布局。">
          <Icon name="file" :size="14" /> 导出元素序列
        </button>
        <button class="btn btn-sm btn-primary" @click="exportCodeTable" title="导出码表，可作为 Rime 等输入法码表使用。">
          <Icon name="chart" :size="14" /> 导出码表
        </button>
      </div>
    </div>

    <!-- 搜索区域 -->
    <div class="search-panel">
      <input 
        v-model="searchQuery" 
        type="search" 
        class="search-input"
        :placeholder="activeTab === 'char' ? '搜索汉字或编码...' : '搜索词或编码...'"
      />
      <div class="filter-group">
        <span class="filter-label">状态筛选:</span>
        <button 
          class="filter-btn" 
          :class="{ active: statusFilter === 'all' }"
          @click="statusFilter = 'all'"
        >
          全部
        </button>
        <button 
          class="filter-btn filter-complete" 
          :class="{ active: statusFilter === '完整' }"
          @click="statusFilter = '完整'"
        >
          完整
        </button>
        <button 
          class="filter-btn filter-missing" 
          :class="{ active: statusFilter === '缺失' }"
          @click="statusFilter = '缺失'"
        >
          缺失
        </button>
      </div>
    </div>

    <!-- 单字编码表格 -->
    <div v-if="activeTab === 'char'" class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 50px">字</th>
            <th style="width: 80px">Unicode</th>
            <th style="width: 80px">拼音</th>
            <th>拆分</th>
            <th style="width: 120px">编码</th>
            <th style="width: 60px">码长</th>
            <th style="width: 80px">字频</th>
            <th style="width: 70px">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="char in pagedItems" :key="char" @click="selectChar(char)" class="clickable-row">
            <td class="char-cell">{{ char }}</td>
            <td class="mono">{{ getCharInfo(char).unicode }}</td>
            <td>{{ getCharInfo(char).pinyin || '-' }}</td>
            <td class="split-cell">
              <span 
                v-for="(rootInfo, idx) in getCharInfo(char).roots" 
                :key="idx"
                class="root-part"
                :class="[
                  rootInfo.hasCode ? 'root-has-code' : 'root-no-code',
                  getRootFontClass(rootInfo.root)
                ]"
              >{{ displayRoot(rootInfo.root) }}</span>
            </td>
            <td class="code-cell">
              <span v-if="getCharInfo(char).code" class="char-code">
                {{ getCharInfo(char).code }}
              </span>
              <span v-else class="no-code">-</span>
            </td>
            <td>{{ getCharInfo(char).codeLength || '-' }}</td>
            <td class="freq-cell">{{ getCharInfo(char).freq.toLocaleString() }}</td>
            <td>
              <span class="status-badge" :class="getCharInfo(char).status === '完整' ? 'status-complete' : 'status-missing'">
                {{ getCharInfo(char).status }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 空状态 -->
      <div v-if="pagedItems.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>未找到匹配的汉字</p>
      </div>
    </div>

    <!-- 多字词编码表格 -->
    <div v-if="activeTab === 'word'" class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 120px">词</th>
            <th style="width: 60px">字数</th>
            <th>拆分</th>
            <th style="width: 120px">编码</th>
            <th style="width: 60px">码长</th>
            <th style="width: 80px">词频</th>
            <th style="width: 70px">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="word in pagedItems" :key="word" class="clickable-row">
            <td class="word-cell">{{ word }}</td>
            <td>{{ getWordInfo(word).length }}</td>
            <td class="split-cell">
              <span 
                v-for="(charInfo, cIdx) in getWordInfo(word).charInfos" 
                :key="cIdx"
                class="char-group"
              >
                <span 
                  v-for="(rootInfo, rIdx) in charInfo.rootInfos" 
                  :key="rIdx"
                  class="root-part"
                  :class="[
                    rootInfo.hasCode ? 'root-has-code' : 'root-no-code',
                    getRootFontClass(rootInfo.root)
                  ]"
                >{{ displayRoot(rootInfo.root) }}.{{ rootInfo.codeIndex }}</span>
                <span v-if="cIdx < getWordInfo(word).charInfos.length - 1" class="char-sep">|</span>
              </span>
            </td>
            <td class="code-cell">
              <span v-if="getWordInfo(word).code" class="char-code">
                {{ getWordInfo(word).code }}
              </span>
              <span v-else class="no-code">-</span>
            </td>
            <td>{{ getWordInfo(word).codeLength || '-' }}</td>
            <td class="freq-cell">{{ getWordInfo(word).freq.toLocaleString() }}</td>
            <td>
              <span class="status-badge" :class="getWordInfo(word).status === '完整' ? 'status-complete' : 'status-missing'">
                {{ getWordInfo(word).status }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 空状态 -->
      <div v-if="pagedItems.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>未找到匹配的词</p>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="btn btn-sm btn-ghost" :disabled="currentPage === 1" @click="goToPage(1)">
        ««
      </button>
      <button class="btn btn-sm btn-ghost" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">
        «
      </button>
      <span class="page-info">
        {{ currentPage }} / {{ totalPages }}
      </span>
      <button class="btn btn-sm btn-ghost" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">
        »
      </button>
      <button class="btn btn-sm btn-ghost" :disabled="currentPage === totalPages" @click="goToPage(totalPages)">
        »»
      </button>
    </div>
  </div>
</template>

<style scoped>
.code-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
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

/* 标签切换 */
.tab-switch {
  display: flex;
  background: var(--bg3);
  border-radius: 6px;
  padding: 2px;
}

.tab-btn {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--text);
}

.tab-btn.active {
  background: var(--primary);
  color: white;
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
  align-items: center;
  gap: 8px;
}

.search-panel {
  padding: 16px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input {
  width: 100%;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 13px;
  color: var(--text2);
  margin-right: 4px;
}

.filter-btn {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  background: var(--bg1);
  border-color: var(--primary);
}

.filter-btn.active {
  background: var(--primary-bg);
  color: var(--primary);
  border-color: var(--primary);
}

.filter-btn.filter-complete.active {
  background: rgba(0, 180, 42, 0.15);
  color: var(--success);
  border-color: var(--success);
}

.filter-btn.filter-missing.active {
  background: rgba(245, 63, 63, 0.15);
  color: var(--danger);
  border-color: var(--danger);
}

.table-container {
  flex: 1;
  overflow: auto;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.data-table {
  font-size: 13px;
}

.data-table th {
  position: sticky;
  top: 0;
  z-index: 1;
}

.char-cell {
  font-size: 20px;
  text-align: center;
  font-weight: 500;
}

.word-cell {
  font-size: 18px;
  font-weight: 500;
}

.mono {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
}

.split-cell {
  letter-spacing: 1px;
}

.char-group {
  display: inline-flex;
  align-items: center;
}

.char-sep {
  color: var(--text3);
  margin: 0 4px;
}

.root-part {
  margin-right: 2px;
  padding: 1px 2px;
  border-radius: 2px;
}

.root-part.root-has-code {
  color: var(--success);
  background: rgba(0, 180, 42, 0.1);
}

.root-part.root-no-code {
  color: var(--danger);
  background: rgba(245, 63, 63, 0.1);
}

.code-cell {
  font-family: monospace;
  font-size: 13px;
}

.char-code {
  color: var(--primary);
  font-weight: 500;
  background: var(--primary-bg);
  padding: 2px 6px;
  border-radius: 4px;
}

.no-code {
  color: var(--text3);
}

.freq-cell {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
  text-align: right;
  color: var(--text2);
}

.status-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.status-badge.status-complete {
  background: rgba(0, 180, 42, 0.15);
  color: var(--success);
}

.status-badge.status-missing {
  background: rgba(245, 63, 63, 0.15);
  color: var(--danger);
}

.clickable-row {
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.clickable-row:hover {
  background: var(--bg3) !important;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.page-info {
  font-size: 13px;
  color: var(--text2);
  min-width: 80px;
  text-align: center;
}

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: var(--text2);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}
</style>
