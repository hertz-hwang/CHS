<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, shallowRef, ref } from 'vue'
import { useEngine } from '../../composables/useEngine'
import Icon from '../Icon.vue'

const { engine, rootsVersion, configVersion, charsetVersion, getCurrentCharset, bracedRootToPua, isBracedRoot } = useEngine()

// ==================== 标签页状态 ====================
type TabType = 'root' | 'char'
const activeTab = shallowRef<TabType>('root')

// ==================== 字根练习部分 ====================
// 练习卡片类型
interface PracticeCard {
  root: string       // 字根
  code: string       // 完整编码
  relatedChars: string[]  // 相关汉字
  freqScore: number  // 字频加权分数
}

// 练习记录类型 [练习次数, 原始索引]
type Record = [count: number, index: number]

const LS_KEY_ROOT = 'chars_hijack_practice_records'
const LS_KEY_IMPORTED = 'chars_hijack_imported_roots'
const LS_KEY_FONT = 'chars_hijack_root_font'

// ==================== 导入字根数据 ====================
interface ImportedCard { root: string; code: string; freq: number }
const importedCards = shallowRef<ImportedCard[] | null>(null)

// ==================== 字体设置 ====================
const DEFAULT_FONT = `PingFang SC, Plangothic P1, TH-Tshyn-P0, TH-Tshyn-P1, TH-Tshyn-P2, TH-Tshyn-P16, ChaiPUA-0.2.7, CHS_PUA`
const rootFont = ref(DEFAULT_FONT)
const appliedFont = ref(DEFAULT_FONT)
const showFontInput = ref(false)

// 计算字根的字频加权分数（取相关汉字字频之和的对数）
function calcFreqScore(chars: string[]): number {
  let sum = 0
  for (const ch of chars) {
    const f = engine.freq.get(ch)
    if (f) sum += f
  }
  // 使用对数平滑，避免极端差异
  return sum > 0 ? Math.log10(sum) : 0
}

// 获取所有有编码的字根，按字频加权降序排序
const allCards = computed<PracticeCard[]>(() => {
  rootsVersion.value // 依赖字根版本

  // 优先使用导入数据
  if (importedCards.value) {
    return importedCards.value.map(({ root, code, freq }) => {
      const allRelatedChars = engine.findCharsDeep(root)
      const sortedByFreq = [...allRelatedChars].sort((a, b) => {
        const freqA = engine.freq.get(a) || 0
        const freqB = engine.freq.get(b) || 0
        return freqB - freqA
      })
      return {
        root,
        code,
        relatedChars: sortedByFreq.slice(0, 10),
        freqScore: freq
      }
    })
  }

  const cards: PracticeCard[] = []

  for (const [root, rootCode] of engine.rootCodes) {
    const code = (rootCode.main || '') + (rootCode.sub || '') + (rootCode.supplement || '')
    if (!code) continue

    // 查找包含该字根的汉字（按字频降序排序，取前10个用于显示）
    const allRelatedChars = engine.findCharsDeep(root)
    // 按字频降序排序
    const sortedByFreq = [...allRelatedChars].sort((a, b) => {
      const freqA = engine.freq.get(a) || 0
      const freqB = engine.freq.get(b) || 0
      return freqB - freqA
    })
    const relatedChars = sortedByFreq.slice(0, 10)

    // 计算字频加权分数（使用所有相关汉字）
    const freqScore = calcFreqScore(allRelatedChars)

    cards.push({
      root,
      code,
      relatedChars,
      freqScore
    })
  }

  // 按字频加权分数降序排序（高频字根优先）
  cards.sort((a, b) => b.freqScore - a.freqScore)

  return cards
})

// 练习记录
const records = shallowRef<Record[]>([])
const progress = shallowRef(0)
const currentCard = shallowRef<PracticeCard | null>(null)
const showHint = shallowRef(true)  // 是否显示答案提示
const userKeys = shallowRef('')
const isCorrect = shallowRef(true)
const showComplete = shallowRef(false)
const spaceForHint = shallowRef(true)  // 空格键提示编码（默认勾选）
const usedHint = shallowRef(false)     // 当前卡片是否使用了提示
const isHintRequested = shallowRef(false)  // 用户主动请求提示

// 初始化记录
function initRecords() {
  const cards = allCards.value
  if (cards.length === 0) return

  // 从 localStorage 加载记录
  let savedRecords: Record[] | null = null
  try {
    const saved = localStorage.getItem(LS_KEY_ROOT)
    if (saved) {
      savedRecords = JSON.parse(saved)
    }
  } catch {}

  if (savedRecords && savedRecords.length === cards.length) {
    records.value = savedRecords
  } else {
    // 创建新记录
    records.value = cards.map((_, i) => [-1, i] as Record)
  }

  // 排序：已完成的卡片放后面
  records.value.sort((a, b) => {
    if (a[0] === 8 && b[0] < 8) return 1
    if (b[0] === 8 && a[0] < 8) return -1
    return 0
  })

  updateCurrentCard()
}

// 更新当前卡片
function updateCurrentCard() {
  const cards = allCards.value
  if (cards.length === 0 || records.value.length === 0) {
    currentCard.value = null
    return
  }

  const idx = records.value[0][1]
  currentCard.value = cards[idx]

  // 如果上一张卡片用户使用了提示，新卡片不自动显示提示
  // 把新卡片标记为已见过
  if (usedHint.value && records.value[0][0] === -1) {
    records.value[0][0] = 0
  }

  // 新卡片（count === -1）时显示提示，否则不显示
  showHint.value = records.value[0][0] === -1
  // 重置状态
  usedHint.value = false
  isHintRequested.value = false
  isCorrect.value = true
}

// 保存记录
function saveRecords() {
  try {
    localStorage.setItem(LS_KEY_ROOT, JSON.stringify(records.value))
  } catch {}
}

// ==================== 导入 TSV ====================
function parseTsv(text: string): ImportedCard[] {
  const result: ImportedCard[] = []
  for (const line of text.split('\n')) {
    const parts = line.trim().split('\t')
    if (parts.length < 2) continue
    const [root, code, freqStr] = parts
    if (!root || !code) continue
    const freq = freqStr ? (parseInt(freqStr) || 0) : 0
    result.push({ root: root.trim(), code: code.trim(), freq })
  }
  return result
}

function saveImportedCards() {
  try { localStorage.setItem(LS_KEY_IMPORTED, JSON.stringify(importedCards.value)) } catch {}
}

function loadImportedCards() {
  try {
    const s = localStorage.getItem(LS_KEY_IMPORTED)
    if (s) importedCards.value = JSON.parse(s)
  } catch {}
}

function clearImportedCards() {
  importedCards.value = null
  localStorage.removeItem(LS_KEY_IMPORTED)
  initRecords()
  progress.value = scanProgress()
}

function handleImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const text = ev.target?.result as string
    const cards = parseTsv(text)
    if (cards.length === 0) return
    importedCards.value = cards
    saveImportedCards()
    initRecords()
    progress.value = scanProgress()
  }
  reader.readAsText(file)
  // 重置 input，允许重复导入同一文件
  input.value = ''
}

// ==================== 字体设置 ====================
const rootCharStyle = computed(() => {
  // 支持多字体：按逗号分割，每个字体名单独加引号，最后追加 sans-serif 兜底
  const families = appliedFont.value
    .split(',')
    .map(f => f.trim())
    .filter(Boolean)
    .map(f => `'${f}'`)
    .join(', ')
  return families ? { fontFamily: `${families}, sans-serif` } : {}
})

function loadFont() {
  try {
    const s = localStorage.getItem(LS_KEY_FONT)
    if (s) { appliedFont.value = s; rootFont.value = s }
  } catch {}
}

function applyFont() {
  appliedFont.value = rootFont.value.trim()
  try {
    if (appliedFont.value) {
      localStorage.setItem(LS_KEY_FONT, appliedFont.value)
    } else {
      localStorage.removeItem(LS_KEY_FONT)
    }
  } catch {}
  showFontInput.value = false
}

function clearFont() {
  rootFont.value = DEFAULT_FONT
  appliedFont.value = DEFAULT_FONT
  localStorage.removeItem(LS_KEY_FONT)
}

// 扫描进度
function scanProgress(): number {
  return records.value.reduce((p, c) => p + Number(c[0] > 1), 0)
}

// 回答处理
const moveSteps = [3, 9, 21, 36, 60, 100]

function answer(correct: boolean) {
  if (!correct) {
    const currentCount = records.value[0][0]
    // 如果卡片已完成（count >= 2 表示已计入进度），需要减少进度
    if (currentCount >= 2 && currentCount < 8) {
      progress.value -= 1
    } else if (currentCount === 8) {
      // 已标记为完成的卡片答错，减少进度并重置计数
      progress.value -= 1
      records.value[0][0] = 0
    }
    // 答错后显示编码提示，标记使用了提示
    showHint.value = true
    usedHint.value = true
    saveRecords()
    return
  }

  const firstRecord = records.value[0]

  // 如果使用了提示，这次练习不计入 count，只移动卡片
  if (!usedHint.value) {
    const firstCount = ++firstRecord[0]

    if (firstCount === 2) {
      progress.value += 1
    }

    const maxIndex = allCards.value.length - 1
    const maxMoveStepsIndex = moveSteps.length - 1

    // 计算移动步数
    let step = 0
    if (firstCount > maxMoveStepsIndex) {
      firstRecord[0] = 8
      step = maxIndex
    } else {
      step = moveSteps[firstCount]
      if (step > maxIndex) step = maxIndex
    }

    // 移动卡片
    records.value.copyWithin(0, 1, step + 1)
    records.value[step] = firstRecord
  } else {
    // 使用了提示，只移动到后面几个位置
    const step = Math.min(3, allCards.value.length - 1)
    records.value.copyWithin(0, 1, step + 1)
    records.value[step] = firstRecord
  }

  saveRecords()
  updateCurrentCard()

  // 检查是否完成
  if (progress.value === allCards.value.length) {
    showComplete.value = true
  }
}

// 处理键盘事件（字根练习）
function handleRootKeydown(e: KeyboardEvent) {
  if (e.key === ' ' && spaceForHint.value) {
    // 空格键提示编码模式：表示用户忘记编码，显示提示
    e.preventDefault()

    if (!currentCard.value) return

    // 标记使用了提示，这次练习不计入 count
    usedHint.value = true
    // 标记用户主动请求提示，显示黄色状态
    isHintRequested.value = true

    const currentCount = records.value[0][0]
    // 如果是新卡片（count === -1），标记为已见过
    if (currentCount === -1) {
      records.value[0][0] = 0
    }
    // 如果是已完成的卡片（count >= 2），减少进度并重置
    if (currentCount >= 2 && currentCount < 8) {
      progress.value -= 1
    } else if (currentCount === 8) {
      progress.value -= 1
      records.value[0][0] = 0
    }

    // 显示编码提示
    showHint.value = true
    saveRecords()
  }
  // 如果未勾选空格提示，空格键作为编码输入，显示为 "_"
}

// 监听用户输入（字根练习）
watch(userKeys, (newKeys) => {
  if (!currentCard.value) return

  // 编码长度不足时不判断
  if (newKeys.length < currentCard.value.code.length) return

  // 检查答案（将 "_" 视为空格）
  const normalizedInput = newKeys.replace(/_/g, ' ')
  const normalizedCode = currentCard.value.code

  if (normalizedInput === normalizedCode) {
    answer(true)
    isCorrect.value = true
  } else {
    answer(false)
    isCorrect.value = false
  }

  userKeys.value = ''
})

// 重新开始（字根练习）
function restartRoot() {
  if (!confirm('重置进度需要清空数据，无法撤回，您确定继续吗？')) return

  const cards = allCards.value
  records.value = cards.map((_, i) => [-1, i] as Record)
  progress.value = 0
  showHint.value = true
  showComplete.value = false
  saveRecords()
  updateCurrentCard()
  focusRootInput()
}

// 聚焦输入框（字根练习）
function focusRootInput() {
  const el = document.getElementById('practice-input')
  el?.focus()
}

// 显示字根（花括号字根转为 PUA 字符）
function displayRoot(root: string): string {
  return bracedRootToPua(root)
}

// 获取字根的字体样式类
function getRootFontClass(root: string): string {
  return isBracedRoot(root) ? 'pua-font' : ''
}

// ==================== 单字练习部分 ====================
// 词条类型
interface PhraseItem {
  text: string           // 文本内容
  code: string           // 编码（用于提示）
  freq: number           // 字频
}

// 统计数据
interface Stats {
  totalChars: number     // 总字数
  typedChars: number     // 已打字数
  totalKeys: number      // 总击键数
  correctKeys: number    // 正确击键数
  startTime: number      // 开始时间
  lastKeyTime: number    // 上次按键时间
}

const LS_KEY_CHAR = 'chars_hijack_type_settings'

// 设置选项
interface TypeSettings {
  randomOrder: boolean            // 乱序
}

// 默认设置
const defaultSettings: TypeSettings = {
  randomOrder: false
}

// 状态
const settings = ref<TypeSettings>({ ...defaultSettings })
const showSettings = ref(false)
const phrases = shallowRef<PhraseItem[]>([])
const currentIndex = ref(0)
const userInput = ref('')
const charStats = ref<Stats>({
  totalChars: 0,
  typedChars: 0,
  totalKeys: 0,
  correctKeys: 0,
  startTime: 0,
  lastKeyTime: 0
})
const isRunning = ref(false)
const isFinished = ref(false)
const isError = ref(false)
const charShowHint = ref(false)
const lastPhraseStats = ref({ speed: 0, hitRate: 0 })
const lastPhraseKeys = ref(0)
const lastPhraseTime = ref(0)

// 计算属性：当前词条
const currentPhrase = computed(() => {
  if (phrases.value.length === 0 || currentIndex.value >= phrases.value.length) {
    return null
  }
  return phrases.value[currentIndex.value]
})

// 计算属性：当前字的拆分（字根数组）
const currentSplit = computed(() => {
  if (!currentPhrase.value) return []
  const decomp = engine.decompose(currentPhrase.value.text)
  return decomp.leaves || []
})

// 计算属性：已打过的词条（显示前面2个，渐变消失）
const prevPhrases = computed(() => {
  const result: PhraseItem[] = []
  for (let i = 2; i >= 1; i--) {
    const idx = currentIndex.value - i
    if (idx >= 0) {
      result.push(phrases.value[idx])
    }
  }
  return result
})

// 计算属性：下一个词条预览（显示后面2个，渐变）
const nextPhrases = computed(() => {
  const result: PhraseItem[] = []
  for (let i = 1; i <= 2; i++) {
    const idx = currentIndex.value + i
    if (idx < phrases.value.length) {
      result.push(phrases.value[idx])
    }
  }
  return result
})

// 计算属性：进度百分比
const progressPercent = computed(() => {
  if (phrases.value.length === 0) return 0
  return Math.round((currentIndex.value / phrases.value.length) * 100)
})

// 计算属性：总速度（字/分钟）
const totalSpeed = computed(() => {
  if (charStats.value.typedChars === 0 || charStats.value.startTime === 0) return '0.00'
  const elapsed = (Date.now() - charStats.value.startTime) / 1000 / 60 // 分钟
  return (charStats.value.typedChars / elapsed).toFixed(2)
})

// 计算属性：总击键速度（键/秒）
const totalHitRate = computed(() => {
  if (charStats.value.totalKeys === 0 || charStats.value.startTime === 0) return '0.00'
  const elapsed = (Date.now() - charStats.value.startTime) / 1000 // 秒
  return (charStats.value.totalKeys / elapsed).toFixed(2)
})

// 计算属性：键准率
const accuracy = computed(() => {
  if (charStats.value.totalKeys === 0) return '100.00'
  return ((charStats.value.correctKeys / charStats.value.totalKeys) * 100).toFixed(2)
})

// 从当前字集获取所有有编码的词条
function buildPhrases(): PhraseItem[] {
  configVersion.value
  rootsVersion.value
  charsetVersion.value
  
  const result: PhraseItem[] = []
  const seen = new Set<string>()
  
  // 直接从当前字集获取汉字
  const chars = getCurrentCharset()
  
  for (const char of chars) {
    if (seen.has(char)) continue
    
    // 计算编码（直接使用 engine 的公共方法）
    const code = engine.calculateCharCode(char)
    if (!code) continue
    
    seen.add(char)
    const freq = engine.freq.get(char) || 0
    result.push({ text: char, code, freq })
  }
  
  // 按字频排序
  result.sort((a, b) => b.freq - a.freq)
  
  return result
}

// 初始化练习（单字练习）
function initCharPractice() {
  const allPhrases = buildPhrases()
  
  if (allPhrases.length === 0) {
    phrases.value = []
    return
  }
  
  if (settings.value.randomOrder) {
    shuffleArray(allPhrases)
  }
  
  phrases.value = allPhrases
  resetCharStats()
}

// 洗牌算法
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
}

// 重置统计（单字练习）
function resetCharStats() {
  currentIndex.value = 0
  userInput.value = ''
  charStats.value = {
    totalChars: phrases.value.reduce((sum, p) => sum + p.text.length, 0),
    typedChars: 0,
    totalKeys: 0,
    correctKeys: 0,
    startTime: 0,
    lastKeyTime: 0
  }
  isRunning.value = false
  isFinished.value = false
  isError.value = false
  charShowHint.value = false
  lastPhraseStats.value = { speed: 0, hitRate: 0 }
  lastPhraseKeys.value = 0
  lastPhraseTime.value = 0
}

// 开始计时（单字练习）
function startTimer() {
  if (!isRunning.value) {
    isRunning.value = true
    charStats.value.startTime = Date.now()
    charStats.value.lastKeyTime = charStats.value.startTime
    lastPhraseTime.value = charStats.value.startTime
    lastPhraseKeys.value = 0
  }
}

// 处理输入（单字练习）
function handleCharInput() {
  if (!currentPhrase.value) return
  
  startTimer()
  
  const input = userInput.value.toLowerCase()
  const targetCode = currentPhrase.value.code.toLowerCase()
  
  if (targetCode.startsWith(input)) {
    isError.value = false
    
    if (input === targetCode) {
      const now = Date.now()
      const phraseTime = (now - lastPhraseTime.value) / 1000
      const phraseChars = 1  // 每个词条算1个字
      const phraseKeys = charStats.value.totalKeys - lastPhraseKeys.value
      
      if (phraseTime > 0) {
        lastPhraseStats.value = {
          speed: (phraseChars / phraseTime) * 60,
          hitRate: phraseKeys / phraseTime
        }
      }
      
      charStats.value.typedChars += phraseChars
      charStats.value.lastKeyTime = now
      lastPhraseTime.value = now
      lastPhraseKeys.value = charStats.value.totalKeys
      
      currentIndex.value++
      userInput.value = ''
      charShowHint.value = false  // 切换到下一个字时重置编码提示状态
      
      if (currentIndex.value >= phrases.value.length) {
        isFinished.value = true
        isRunning.value = false
      }
    }
  } else {
    isError.value = true
  }
}

// 处理键盘事件（单字练习）
function handleCharKeydown(e: KeyboardEvent) {
  if (!currentPhrase.value || isFinished.value) return
  
  if (e.ctrlKey || e.altKey || e.metaKey) return
  
  if (e.key === 'Tab') {
    e.preventDefault()
    charShowHint.value = !charShowHint.value
    return
  }
  
  startTimer()
  
  if (e.key.length === 1) {
    charStats.value.totalKeys++
    
    const targetCode = currentPhrase.value.code.toLowerCase()
    const currentPos = userInput.value.length
    if (currentPos < targetCode.length && e.key.toLowerCase() === targetCode[currentPos]) {
      charStats.value.correctKeys++
    }
  }
}

// 重新开始（单字练习）- 恢复有序并重置进度
function restartChar() {
  const allPhrases = buildPhrases()
  phrases.value = allPhrases  // 重新获取有序列表
  resetCharStats()
  focusCharInput()
}

// 重新乱序（单字练习）
function reshuffle() {
  const shuffled = [...phrases.value]  // 创建新数组
  shuffleArray(shuffled)
  phrases.value = shuffled  // 赋值新数组触发响应式更新
  resetCharStats()
  focusCharInput()
}

// 聚焦输入框（单字练习）
function focusCharInput() {
  const el = document.getElementById('type-input')
  el?.focus()
}

// 加载设置（单字练习）
function loadCharSettings() {
  try {
    const saved = localStorage.getItem(LS_KEY_CHAR)
    if (saved) {
      Object.assign(settings.value, JSON.parse(saved))
    }
  } catch {}
}

// 保存设置（单字练习）
function saveCharSettings() {
  try {
    localStorage.setItem(LS_KEY_CHAR, JSON.stringify(settings.value))
  } catch {}
}

// 应用设置（单字练习）
function applySettings() {
  saveCharSettings()
  initCharPractice()
  showSettings.value = false
  focusCharInput()
}

// 显示文本（花括号字根转为 PUA 字符）
function displayText(text: string): string {
  return bracedRootToPua(text)
}

// ==================== 全局事件处理 ====================
// 全局键盘事件处理（根据当前标签分发）
function handleGlobalKeydown(e: KeyboardEvent) {
  if (activeTab.value === 'root') {
    handleRootKeydown(e)
  }
}

// 切换标签时聚焦对应的输入框
watch(activeTab, (newTab) => {
  if (newTab === 'root') {
    setTimeout(focusRootInput, 0)
  } else {
    setTimeout(focusCharInput, 0)
  }
})

// 监听输入（单字练习）
watch(userInput, handleCharInput)

// 初始化
onMounted(() => {
  // 加载导入数据和字体设置
  loadImportedCards()
  loadFont()

  // 字根练习初始化
  initRecords()
  progress.value = scanProgress()
  
  // 单字练习初始化
  loadCharSettings()
  initCharPractice()
  
  // 聚焦当前标签的输入框
  if (activeTab.value === 'root') {
    focusRootInput()
  } else {
    focusCharInput()
  }
  
  // 添加全局键盘事件监听
  document.addEventListener('keydown', handleGlobalKeydown)
})

// 清理
onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})

// 监听字根变化
watch(allCards, () => {
  initRecords()
  progress.value = scanProgress()
}, { deep: true })

// 监听字根变化（单字练习）
watch(rootsVersion, () => {
  initCharPractice()
})

// 监听配置变化（单字练习）
watch(configVersion, () => {
  initCharPractice()
})
</script>

<template>
  <div class="practice-page">
    <!-- 标签切换 -->
    <div class="tabs-header">
      <button 
        class="tab-btn" 
        :class="{ 'active': activeTab === 'root' }"
        @click="activeTab = 'root'"
      >
        字根练习
      </button>
      <button 
        class="tab-btn" 
        :class="{ 'active': activeTab === 'char' }"
        @click="activeTab = 'char'"
      >
        单字练习
      </button>
    </div>

    <!-- ==================== 字根练习 ==================== -->
    <template v-if="activeTab === 'root'">
      <!-- 进度条 -->
      <div class="progress-header">
        <div class="progress-info">
          <span class="progress-text">{{ progress }} / {{ allCards.length }}</span>
        </div>
        <div class="header-actions">
          <label class="hint-toggle">
            <input type="checkbox" v-model="spaceForHint" />
            <span>空格提示</span>
          </label>
          <!-- 导入 TSV -->
          <label class="action-btn" :class="{ 'active': importedCards }" title="导入 TSV 字根练习">
            <Icon name="import" :size="14" />
            <input type="file" accept=".tsv,.txt" @change="handleImportFile" style="display:none" />
          </label>
          <!-- 已导入时显示清除按钮 -->
          <button v-if="importedCards" class="action-btn danger" @click="clearImportedCards" title="清除导入数据（恢复引擎字根）">
            <Icon name="close" :size="14" />
          </button>
          <!-- 字体设置 -->
          <div class="font-setting">
            <button class="action-btn" :class="{ 'active': appliedFont !== DEFAULT_FONT }" @click="showFontInput = !showFontInput" title="设置字根显示字体">
              字
            </button>
            <div v-if="showFontInput" class="font-input-popup">
              <input
                v-model="rootFont"
                type="text"
                placeholder="字体名称，多个用逗号分隔"
                class="font-input"
                @keydown.enter="applyFont"
                autofocus
              />
              <button class="font-apply-btn" @click="applyFont">应用</button>
              <button v-if="appliedFont !== DEFAULT_FONT" class="font-clear-btn" @click="clearFont">重置</button>
            </div>
          </div>
          <button class="reset-btn" @click="restartRoot" title="重置进度">
            <Icon name="refresh" :size="14" />
          </button>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${(progress / allCards.length) * 100}%` }"></div>
      </div>

      <!-- 主练习区域 -->
      <div v-if="currentCard && !showComplete" class="practice-area" :class="{ 'wrong': !isCorrect, 'hint-mode': isHintRequested }">
        <!-- 字根展示 -->
        <div class="card-display">
          <div
            class="root-char"
            :class="[getRootFontClass(currentCard.root), { 'shake': !isCorrect }]"
            :style="rootCharStyle"
          >
            {{ displayRoot(currentCard.root) }}
          </div>

          <!-- 相关汉字 -->
          <div v-if="currentCard.relatedChars.length > 0" class="related-chars">
            {{ currentCard.relatedChars.join(' ') }}
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-area">
          <input
            id="practice-input"
            v-model="userKeys"
            type="text"
            class="code-input"
            :class="{ 'error': !isCorrect }"
            placeholder="输入编码"
            autocomplete="off"
            autofocus
          />
        </div>

        <!-- 提示区域 -->
        <div class="hint-area" :class="{ 'visible': showHint }">
          <span class="hint-label">提示</span>
          <span class="hint-code">{{ currentCard.code }}</span>
        </div>
      </div>

      <!-- 完成提示 -->
      <div v-else-if="showComplete" class="complete-area">
        <div class="complete-icon">✓</div>
        <div class="complete-text">练习完成</div>
        <button class="continue-btn" @click="showComplete = false; focusRootInput()">继续</button>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">-</div>
        <p>暂无可练习的字根</p>
      </div>
    </template>

    <!-- ==================== 单字练习 ==================== -->
    <template v-else-if="activeTab === 'char'">
      <!-- 顶部统计栏 -->
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">{{ progressPercent }}%</span>
          <span class="stat-label">进度</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ totalSpeed }}</span>
          <span class="stat-label">速度</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ totalHitRate }}</span>
          <span class="stat-label">击键</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ accuracy }}%</span>
          <span class="stat-label">键准</span>
        </div>
        <div class="stat-item instant">
          <span class="stat-value">{{ lastPhraseStats.speed.toFixed(1) }}</span>
          <span class="stat-label">瞬速</span>
        </div>
        <div class="stat-item instant">
          <span class="stat-value">{{ lastPhraseStats.hitRate.toFixed(1) }}</span>
          <span class="stat-label">瞬击</span>
        </div>
        <div class="toolbar">
          <button class="tool-btn" @click="restartChar" title="重置">
            <Icon name="refresh" :size="16" />
          </button>
          <button class="tool-btn" @click="reshuffle" title="乱序">
            <Icon name="shuffle" :size="16" />
          </button>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>

      <!-- 主练习区域 -->
      <div v-if="currentPhrase && !isFinished" class="practice-area char-practice">
        <!-- 词条展示 -->
        <div class="phrases-display">
          <!-- 已打字2（最左） -->
          <div class="phrase prev-2">
            <span v-if="currentIndex >= 2" class="phrase-text">{{ displayText(phrases[currentIndex - 2].text) }}</span>
          </div>
          <!-- 已打字1 -->
          <div class="phrase prev-1">
            <span v-if="currentIndex >= 1" class="phrase-text">{{ displayText(phrases[currentIndex - 1].text) }}</span>
          </div>
          <!-- 当前字（居中） -->
          <div class="phrase current">
            <span class="phrase-text">{{ displayText(currentPhrase.text) }}</span>
          </div>
          <!-- 预打字1 -->
          <div class="phrase next-1">
            <span v-if="currentIndex + 1 < phrases.length" class="phrase-text">{{ displayText(phrases[currentIndex + 1].text) }}</span>
          </div>
          <!-- 预打字2（最右） -->
          <div class="phrase next-2">
            <span v-if="currentIndex + 2 < phrases.length" class="phrase-text">{{ displayText(phrases[currentIndex + 2].text) }}</span>
          </div>
        </div>

        <!-- 提示区域（按 Tab 显示，始终占据空间） -->
        <div class="char-hint-area" :class="{ 'visible': charShowHint }">
          <div class="hint-split">
            <span 
              v-for="(root, idx) in currentSplit" 
              :key="idx"
              class="split-root"
              :class="getRootFontClass(root)"
            >{{ displayRoot(root) }}</span>
          </div>
          <div class="hint-code-row">
            <span class="hint-code">{{ currentPhrase.code }}</span>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-area char-input-area">
          <input
            id="type-input"
            v-model="userInput"
            type="text"
            class="type-input"
            :class="{ 'error': isError }"
            placeholder="开始输入..."
            autocomplete="off"
            autofocus
            @keydown="handleCharKeydown"
          />
          <div class="input-hint">按 Tab 显示当前字编码</div>
        </div>

        <!-- 进度信息 -->
        <div class="progress-info">
          <span>{{ currentIndex + 1 }} / {{ phrases.length }}</span>
        </div>
      </div>

      <!-- 完成提示 -->
      <div v-else-if="isFinished" class="finish-area">
        <div class="finish-icon">✓</div>
        <div class="finish-title">练习完成</div>
        <div class="finish-stats">
          <div class="finish-stat">
            <span class="finish-stat-value">{{ charStats.typedChars }}</span>
            <span class="finish-stat-label">总字数</span>
          </div>
          <div class="finish-stat">
            <span class="finish-stat-value">{{ totalSpeed }}</span>
            <span class="finish-stat-label">平均速度</span>
          </div>
          <div class="finish-stat">
            <span class="finish-stat-value">{{ totalHitRate }}</span>
            <span class="finish-stat-label">平均击键</span>
          </div>
          <div class="finish-stat">
            <span class="finish-stat-value">{{ accuracy }}%</span>
            <span class="finish-stat-label">键准率</span>
          </div>
        </div>
        <button class="restart-btn" @click="restartChar">再来一轮</button>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-area">
        <div class="empty-icon">!</div>
        <p>暂无可练习的词条</p>
        <p class="empty-hint">请确保已加载字根编码数据</p>
      </div>

      <!-- 设置面板 -->
      <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
        <div class="settings-panel">
          <div class="settings-header">
            <h3>跟打设置</h3>
            <button class="close-btn" @click="showSettings = false">×</button>
          </div>
          <div class="settings-body">
            <div class="setting-item">
              <label class="checkbox-label">
                <input type="checkbox" v-model="settings.randomOrder" />
                <span>随机顺序</span>
              </label>
            </div>
          </div>
          <div class="settings-footer">
            <button class="apply-btn" @click="applySettings">应用</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.practice-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding: 16px;
}

/* 标签切换 */
.tabs-header {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg2);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.tab-btn {
  flex: 1;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text2);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--text);
  background: var(--bg3);
}

.tab-btn.active {
  color: white;
  background: var(--primary);
}

.tab-btn.active:hover {
  background: var(--primary-light);
}

/* 进度区域 */
.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hint-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text3);
  cursor: pointer;
  user-select: none;
}

.hint-toggle input {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--primary);
}

.hint-toggle:hover {
  color: var(--text2);
}

.progress-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  font-variant-numeric: tabular-nums;
}

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reset-btn:hover {
  background: var(--bg3);
  color: var(--text2);
}

/* 通用操作按钮（导入、字体等） */
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 13px;
  font-weight: 600;
}

.action-btn:hover {
  background: var(--bg3);
  color: var(--text2);
}

.action-btn.active {
  color: var(--primary);
  background: var(--primary-bg);
}

.action-btn.danger:hover {
  background: color-mix(in srgb, var(--danger) 10%, var(--bg3));
  color: var(--danger);
}

/* 字体设置 */
.font-setting {
  position: relative;
}

.font-input-popup {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 10;
  white-space: nowrap;
}

.font-input {
  width: 860px;
  padding: 5px 10px;
  font-size: 13px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  outline: none;
  transition: border-color 0.2s;
}

.font-input:focus {
  border-color: var(--primary);
}

.font-apply-btn {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: white;
  background: var(--primary);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.2s;
}

.font-apply-btn:hover {
  background: color-mix(in srgb, var(--primary) 85%, black);
}

.font-clear-btn {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
  background: var(--bg3);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.2s;
}

.font-clear-btn:hover {
  background: color-mix(in srgb, var(--danger) 10%, var(--bg3));
  color: var(--danger);
}

.progress-bar {
  height: 4px;
  background: var(--bg3);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 70%, white));
  border-radius: 2px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 主练习区域 */
.practice-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 48px 24px;
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid var(--border);
  transition: all 0.3s ease;
}

.practice-area.wrong {
  background: color-mix(in srgb, var(--danger) 4%, var(--bg2));
  border-color: color-mix(in srgb, var(--danger) 20%, var(--border));
}

.practice-area.hint-mode {
  background: color-mix(in srgb, #f59e0b 4%, var(--bg2));
  border-color: color-mix(in srgb, #f59e0b 20%, var(--border));
}

/* 字根展示 */
.card-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.root-char {
  font-size: 96px;
  font-weight: 400;
  line-height: 1;
  color: var(--text);
  transition: all 0.3s ease;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.root-char.shake {
  animation: shake 0.4s ease-in-out;
  color: var(--danger);
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

.related-chars {
  font-size: 15px;
  color: var(--text3);
  letter-spacing: 4px;
}

/* 输入区域 */
.input-area {
  width: 100%;
  max-width: 240px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.code-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 18px;
  text-align: center;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  letter-spacing: 3px;
  font-weight: 500;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  outline: none;
  transition: all 0.2s ease;
}

.code-input::placeholder {
  color: var(--text3);
  font-weight: 400;
  letter-spacing: 1px;
}

.code-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent);
}

.code-input.error {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 12%, transparent);
}

/* 提示区域 */
.hint-area {
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0;
  transform: translateY(4px);
  transition: all 0.3s ease;
  pointer-events: none;
}

.hint-area.visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.hint-label {
  font-size: 12px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.hint-code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 15px;
  font-weight: 600;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, var(--bg3));
  padding: 4px 12px;
  border-radius: 6px;
  letter-spacing: 2px;
}

/* 完成区域 */
.complete-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px 24px;
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.complete-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.complete-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.continue-btn {
  margin-top: 8px;
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  background: var(--primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.continue-btn:hover {
  background: color-mix(in srgb, var(--primary) 85%, black);
  transform: translateY(-1px);
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 24px;
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid var(--border);
  color: var(--text3);
}

.empty-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  color: var(--text3);
  background: var(--bg3);
  border-radius: 50%;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

/* ==================== 单字练习样式 ==================== */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 16px;
  background: var(--bg2);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 12px;
  color: var(--text3);
}

.stat-item.instant .stat-value {
  color: var(--primary);
  font-size: 16px;
}

.toolbar {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: var(--bg3);
  color: var(--text2);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: var(--primary-bg);
  color: var(--primary);
}

.char-practice {
  gap: 40px;
}

.phrases-display {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: center;
  justify-items: center;
  gap: 16px;
  width: 100%;
  max-width: 700px;
}

/* 确保每个格子都有固定尺寸 */
.phrase {
  min-width: 80px;
  min-height: 80px;
}

.phrase {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.phrase.current .phrase-text {
  font-size: 64px;
  font-weight: 500;
  color: var(--text);
}

/* 已打过的字（左侧，渐变消失） */
.phrase.prev-1 { opacity: 0.4; }
.phrase.prev-1 .phrase-text { font-size: 42px; color: var(--text3); }

.phrase.prev-2 { opacity: 0.25; }
.phrase.prev-2 .phrase-text { font-size: 36px; color: var(--text3); }

/* 预打的字（右侧，渐变） */
.phrase.next-1 { opacity: 0.6; }
.phrase.next-1 .phrase-text { font-size: 48px; color: var(--text2); }

.phrase.next-2 { opacity: 0.4; }
.phrase.next-2 .phrase-text { font-size: 42px; color: var(--text3); }

.phrase-code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 18px;
  color: var(--primary);
  background: var(--primary-bg);
  padding: 4px 12px;
  border-radius: 6px;
  letter-spacing: 2px;
}

/* 单字练习提示区域 - 始终占据固定空间 */
.char-hint-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  min-height: 80px;
  background: var(--bg);
  border-radius: 10px;
  border: 1px solid var(--border);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0.2s ease;
}

.char-hint-area.visible {
  opacity: 1;
  visibility: visible;
}

.hint-split {
  display: flex;
  align-items: center;
  gap: 4px;
}

.split-root {
  font-size: 24px;
  color: var(--text);
  padding: 2px 6px;
  background: var(--bg3);
  border-radius: 4px;
}

.hint-code-row {
  display: flex;
  align-items: center;
}

.hint-code-row .hint-code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 20px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-bg);
  padding: 6px 16px;
  border-radius: 6px;
  letter-spacing: 3px;
}

.char-input-area {
  max-width: none;
}

.type-input {
  width: 400px;
  padding: 16px 24px;
  font-size: 32px;
  text-align: center;
  font-family: inherit;
  letter-spacing: 4px;
  font-weight: 500;
  background: var(--bg);
  border: 2px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  outline: none;
  transition: all 0.2s ease;
}

.type-input::placeholder {
  color: var(--text3);
  font-weight: 400;
  letter-spacing: 1px;
}

.type-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 12%, transparent);
}

.type-input.error {
  border-color: var(--danger);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger) 12%, transparent);
}

.input-hint {
  font-size: 12px;
  color: var(--text3);
}

.progress-info {
  font-size: 14px;
  color: var(--text3);
}

.finish-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 48px 24px;
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.finish-icon {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #10b981, #059669);
  border-radius: 50%;
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.3);
}

.finish-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
}

.finish-stats {
  display: flex;
  gap: 32px;
}

.finish-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.finish-stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary);
  font-variant-numeric: tabular-nums;
}

.finish-stat-label {
  font-size: 13px;
  color: var(--text3);
}

.restart-btn {
  margin-top: 16px;
  padding: 12px 32px;
  font-size: 15px;
  font-weight: 500;
  color: white;
  background: var(--primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.restart-btn:hover {
  background: color-mix(in srgb, var(--primary) 85%, black);
  transform: translateY(-1px);
}

.empty-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  background: var(--bg2);
  border-radius: 12px;
  border: 1px solid var(--border);
}

.empty-area .empty-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  color: var(--text3);
  background: var(--bg3);
  border-radius: 50%;
}

.empty-area p {
  margin: 0;
  font-size: 14px;
  color: var(--text2);
}

.empty-hint {
  font-size: 12px !important;
  color: var(--text3) !important;
}

.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.settings-panel {
  width: 400px;
  background: var(--bg);
  border-radius: 12px;
  border: 1px solid var(--border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.settings-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--text3);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.close-btn:hover {
  background: var(--bg3);
  color: var(--text);
}

.settings-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.setting-item label {
  font-size: 14px;
  color: var(--text2);
}

.range-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-input input {
  width: 60px;
  padding: 6px 10px;
  font-size: 14px;
  text-align: center;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
}

.range-input span {
  color: var(--text3);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.settings-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.apply-btn {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  background: var(--primary);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.apply-btn:hover {
  background: color-mix(in srgb, var(--primary) 85%, black);
}
</style>