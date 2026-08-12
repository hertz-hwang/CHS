<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useElementPractice, DEFAULT_SETTINGS, type HighlightRule } from '@/composables/useElementPractice'
import { parseBBCode } from '@/utils/bbcode'
import Icon from '../Icon.vue'

const {
  cards, records, currentCard, currentFileName, isFirst, settings, importedFonts,
  progressCount, progressText, progressPercent, progressAsPercent, allComplete,
  init, answer, restartProgress, importFile, reimportFile, importZip, clearCards,
  importFont, removeFont, refreshFonts, exportProgress, importProgress,
  exportWithHeader, matchHighlight, validRegex, genHlColor,
  getPureCharCount, parseCardSegments, saveSettings, resetAll,
  rebuildFromEngine, togglePercentDisplay
} = useElementPractice()

// ===== 状态 =====
const userInput = ref('')
const inputError = ref(false)
const showSettings = ref(false)
const showComplete = ref(false)
const showWelcome = ref(false)

// ===== 极速复习模式状态 =====
const speedReviewQueue = ref<number[]>([])      // 待复习的卡片索引队列
const speedReviewIdx = ref(0)                    // 当前指针
const speedReviewWrongShown = ref(false)         // 当前卡片是否因答错而展示提示
const speedReviewFinished = ref(false)           // 本轮复习是否已完成
const speedReviewProgress = ref({ done: 0, total: 0 }) // 进度统计
let speedReviewTimer: ReturnType<typeof setTimeout> | null = null

const importMode = ref<'file' | 'reimport' | 'zip' | 'font'>('file')
const importCenterInputRef = ref<HTMLInputElement | null>(null)
const importCenterZipInputRef = ref<HTMLInputElement | null>(null)
const importReimportInputRef = ref<HTMLInputElement | null>(null)
const importFontInputRef = ref<HTMLInputElement | null>(null)
const progressImportExportText = ref('')
const toast = ref('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

// 监听输入
watch(userInput, (val) => {
  // 极速复习模式：单独走分支
  if (speedReviewQueue.value.length > 0 && !speedReviewFinished.value) {
    handleSpeedReviewInput(val)
    return
  }
  if (!cards.value.length || !currentCard.value) return
  if (val.includes(' ')) {
    answer(false)
    showAnswer(false)
    userInput.value = ''
    return
  }
  const targetKey = currentCard.value.key
  if (settings.value.firstCode) {
    if (val.length >= 1) {
      if (val[0] === targetKey[0]) {
        answer(true)
        showAnswer(true)
        userInput.value = ''
      } else if (val.length >= targetKey.length) {
        answer(false)
        showAnswer(false)
        userInput.value = ''
      }
    }
  } else {
    if (val.length < targetKey.length) return
    if (val === targetKey) {
      answer(true)
      showAnswer(true)
      userInput.value = ''
    } else {
      answer(false)
      showAnswer(false)
      userInput.value = ''
    }
  }
})

function showAnswer(correct: boolean) {
  inputError.value = !correct
}

// ===== 极速复习模式 =====
const SPEED_REVIEW_DELAY_MS = 1400

function clearSpeedReviewTimer() {
  if (speedReviewTimer) {
    clearTimeout(speedReviewTimer)
    speedReviewTimer = null
  }
}

function startSpeedReview() {
  if (!cards.value.length) return
  clearSpeedReviewTimer()
  showComplete.value = false
  speedReviewQueue.value = cards.value.map((_, i) => i)
  speedReviewIdx.value = 0
  speedReviewWrongShown.value = false
  speedReviewFinished.value = false
  speedReviewProgress.value = { done: 0, total: speedReviewQueue.value.length }
  userInput.value = ''
  inputError.value = false
  focusInput()
}

function exitSpeedReview() {
  clearSpeedReviewTimer()
  speedReviewQueue.value = []
  speedReviewIdx.value = 0
  speedReviewWrongShown.value = false
  speedReviewFinished.value = false
  userInput.value = ''
  inputError.value = false
  showComplete.value = false
  focusInput()
}

function finishSpeedReview() {
  speedReviewFinished.value = true
  speedReviewWrongShown.value = false
  clearSpeedReviewTimer()
  userInput.value = ''
  inputError.value = false
  showComplete.value = true
  showToast('✓ 极速复习完成')
}

function advanceSpeedReview() {
  speedReviewWrongShown.value = false
  inputError.value = false
  speedReviewProgress.value = {
    done: Math.min(speedReviewIdx.value + 1, speedReviewQueue.value.length),
    total: speedReviewQueue.value.length
  }
  if (speedReviewIdx.value >= speedReviewQueue.value.length) {
    finishSpeedReview()
    return
  }
  userInput.value = ''
  focusInput()
}

function handleSpeedReviewInput(val: string) {
  if (!speedReviewQueue.value.length || speedReviewFinished.value) return
  if (speedReviewWrongShown.value) return // 等待提示展示期间忽略输入
  const cardIdx = speedReviewQueue.value[speedReviewIdx.value]
  const card = cards.value[cardIdx]
  if (!card) return
  const targetKey = card.key
  if (!targetKey) return

  const isCorrect = settings.value.firstCode
    ? val[0] === targetKey[0]
    : val === targetKey
  const complete = settings.value.firstCode
    ? val.length >= Math.max(1, targetKey.length)
    : val.length >= targetKey.length

  if (!complete) return

  userInput.value = ''
  if (isCorrect) {
    inputError.value = false
    speedReviewIdx.value++
    speedReviewTimer = setTimeout(() => advanceSpeedReview(), 350)
  } else {
    // 答错也按通过：先展示答案提示，延迟后进入下一张
    inputError.value = true
    speedReviewWrongShown.value = true
    speedReviewIdx.value++
    speedReviewTimer = setTimeout(() => advanceSpeedReview(), SPEED_REVIEW_DELAY_MS)
  }
}

const speedReviewActive = computed(() => speedReviewQueue.value.length > 0 && !speedReviewFinished.value)
const speedReviewCurrentCard = computed(() => {
  if (!speedReviewActive.value) return null
  const idx = speedReviewQueue.value[speedReviewIdx.value]
  return cards.value[idx] || null
})

watch(allComplete, (v) => {
  if (v) showComplete.value = true
})

function showToast(msg: string) {
  toast.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 2500)
}

// 切换顺序模式
function toggleOrderMode() {
  settings.value.orderMode = !settings.value.orderMode
  settings.value = { ...settings.value }
}

// ===== 计算属性 =====
const cardSegments = computed(() => {
  if (!currentCard.value) return []
  return parseCardSegments(currentCard.value.originalName)
})

const speedReviewCardSegments = computed(() => {
  if (!speedReviewCurrentCard.value) return []
  return parseCardSegments(speedReviewCurrentCard.value.originalName)
})

const isSingleRoot = computed(() => {
  const segs = cardSegments.value.filter(s => s.t === 'root')
  if (!currentCard.value) return false
  return segs.length === 1 && getPureCharCount(currentCard.value.name) === 1
})

const displayStyle = computed(() => {
  const card = speedReviewActive.value ? speedReviewCurrentCard.value : currentCard.value
  if (!card) return {}
  const charCount = getPureCharCount(card.name)
  let fontSize = settings.value.zigenSize
  if (settings.value.fontSizeByCount && charCount > settings.value.fontSizeCountThreshold) {
    fontSize = settings.value.fontSizeWhenLarge
  }
  const wrap = settings.value.wrapByCount && charCount > settings.value.wrapCountThreshold
  const hlColor = matchHighlight(card.name)
  const style: Record<string, string> = {
    fontSize: fontSize + 'rem',
    fontFamily: settings.value.fontFamily,
    color: hlColor || '',
    whiteSpace: wrap ? 'normal' : 'nowrap',
    overflow: isSingleRoot.value ? 'visible' : 'hidden'
  }
  if (wrap) style.wordBreak = 'break-all'
  return style
})

const renderedDescription = computed(() => {
  const text = settings.value.description || ''
  if (!text.trim()) return ''
  return parseBBCode(text)
})

// ===== 高亮规则编辑 =====
function addHighlightRule() {
  const used = new Set<number>()
  settings.value.highlightRules.forEach(r => {
    const m = r.lightColor.match(/hsl\((\d+)/)
    if (m) used.add(parseInt(m[1]))
  })
  const c = genHlColor(used)
  settings.value.highlightRules.push({ lightColor: c.light, darkColor: c.dark, pattern: '' })
  settings.value = { ...settings.value, highlightRules: [...settings.value.highlightRules] }
}

function updateHighlightRule(idx: number, field: keyof HighlightRule, value: string) {
  const rules = [...settings.value.highlightRules]
  rules[idx] = { ...rules[idx], [field]: value }
  settings.value = { ...settings.value, highlightRules: rules }
}

function removeHighlightRule(idx: number) {
  const rules = [...settings.value.highlightRules]
  rules.splice(idx, 1)
  settings.value = { ...settings.value, highlightRules: rules }
}

// ===== 文件导入处理 =====
async function handleFileImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await importFile(file)
    showToast('✓ 已导入 ' + cards.value.length + ' 条数据')
  } catch (err: any) {
    showToast('❌ ' + (err.message || '导入失败'))
  }
  if (importCenterInputRef.value) importCenterInputRef.value.value = ''
  if (importReimportInputRef.value) importReimportInputRef.value.value = ''
}

async function handleZipImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await importZip(file)
    showToast('✓ ZIP 导入成功')
  } catch (err: any) {
    showToast('❌ ' + (err.message || 'ZIP 导入失败'))
  }
  if (importCenterZipInputRef.value) importCenterZipInputRef.value.value = ''
}

async function handleReimport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await reimportFile(file)
    showToast('✓ 重新导入完成')
  } catch (err: any) {
    showToast('❌ ' + (err.message || '重新导入失败'))
  }
  if (importReimportInputRef.value) importReimportInputRef.value.value = ''
}

async function handleFontImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const name = await importFont(file)
    showToast(`✓ 字体 "${name}" 已导入，请在字体候补中输入 "${name}" 即可使用`)
  } catch (err: any) {
    showToast('� ' + (err.message || '字体导入失败'))
  }
  if (importFontInputRef.value) importFontInputRef.value.value = ''
}

function handleExportProgress() {
  if (!cards.value.length) {
    showToast('无元素数据')
    return
  }
  progressImportExportText.value = exportProgress()
}

async function handleImportProgress() {
  const str = progressImportExportText.value.trim()
  if (!str) return
  try {
    await importProgress(str)
    showToast('✓ 进度导入成功')
  } catch (err: any) {
    showToast('❌ ' + (err.message || '进度无效'))
  }
}

function handleExportWithHeader() {
  const text = exportWithHeader()
  if (!text) {
    showToast('无数据可导出')
    return
  }
  const blob = new Blob(['﻿', text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (currentFileName.value || '导出') + '.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}

function handleResetDescription() {
  settings.value = { ...settings.value, description: DEFAULT_SETTINGS.description }
}

const BBCodeExample = `正常文字
[b]粗体字[/b]
[i]斜体字[/i]
[u]下划线文字[/u]
[s]删除线文字[/s]
马赛克：[mask]马赛克文字[/mask]
[color=#ffa631]彩[/color][color=#a78e44]色[/color][color=#0eb83a]的[/color][color=#3de1ad]哟[/color]。
[size=10]不同[/size][size=14]大小的[/size][size=18]文字[/size]效果也可实现。
链接: [url]https://github.com/Unyaa-Code/root-practice[/url]
带文字说明的网站链接：[url=https://github.com/Unyaa-Code/root-practice]GitHub[/url]`

function handleLoadExample() {
  settings.value = { ...settings.value, description: BBCodeExample }
}

function handleResetSettings() {
  if (!confirm('重置字体/字号/间隙？')) return
  settings.value = {
    ...DEFAULT_SETTINGS,
    orderMode: settings.value.orderMode,
    roundCount: settings.value.roundCount
  }
}

function handleResetAll() {
  if (!confirm('⚠️ 清空所有数据（元素+进度+设置+字体）？')) return
  resetAll()
  showToast('已清空所有数据')
}

// 切换数据源：从引擎重新构建
async function rebuildFromEngineAndReset() {
  if (!confirm('将清空当前进度并从引擎字根重新生成卡片，继续？')) return
  await rebuildFromEngine()
  currentFileName.value = '引擎字根'
  init()
}

async function handleClearCards() {
  if (!confirm('清空元素数据？')) return
  await clearCards()
  await rebuildFromEngine()
  init()
}

// ===== 重置按钮（带确认） =====
async function handleRestart() {
  if (!confirm('重置所有进度与轮次？')) return
  await restartProgress()
  showComplete.value = false
}

// ===== 欢迎弹窗 =====
const WELCOME_SEEN_KEY = 'zigen_welcome_seen'
const WELCOME_NEVER_KEY = 'zigen_welcome_never'
const WELCOME_INTERVAL = 24 * 60 * 60 * 1000

function shouldShowWelcome(): boolean {
  if (localStorage.getItem(WELCOME_NEVER_KEY) === '1') return false
  const lastSeen = localStorage.getItem(WELCOME_SEEN_KEY)
  if (!lastSeen) return true
  return Date.now() - parseInt(lastSeen, 10) >= WELCOME_INTERVAL
}

function closeWelcome(never: boolean) {
  if (never) {
    localStorage.setItem(WELCOME_NEVER_KEY, '1')
  } else {
    localStorage.setItem(WELCOME_SEEN_KEY, Date.now().toString())
  }
  showWelcome.value = false
}

// ===== 字体候补：复制按钮 =====
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('✓ 已复制：' + text)
  } catch {
    showToast('复制失败')
  }
}

async function deleteFontItem(id: string) {
  const target = importedFonts.value.find(f => f.id === id)
  if (!target) return
  if (!confirm('确定删除字体 "' + target.name + '"？')) return
  await removeFont(id)
  showToast('✓ 已删除字体')
}

// ===== 焦点管理 =====
const inputRef = ref<HTMLInputElement | null>(null)
function focusInput() {
  nextTick(() => inputRef.value?.focus())
}

watch(currentCard, () => {
  if (speedReviewActive.value) return
  inputError.value = false
  focusInput()
})

watch(speedReviewCurrentCard, () => {
  inputError.value = false
  focusInput()
})

watch(() => cards.value.length, () => {
  focusInput()
})

onMounted(async () => {
  await init()
  await refreshFonts()
  if (shouldShowWelcome()) showWelcome.value = true
  focusInput()
})
</script>

<template>
  <div class="element-practice">
    <!-- 顶栏 -->
    <div class="ep-top-bar">
      <span class="ep-file-name">📄 {{ currentFileName }}</span>
      <span v-if="settings.orderMode" class="ep-round-counter">第 {{ settings.roundCount }} 轮</span>
      <span v-if="speedReviewActive" class="ep-round-counter ep-speed-badge">⚡ 极速复习 {{ speedReviewProgress.done }}/{{ speedReviewProgress.total }}</span>
      <div v-if="!speedReviewActive" class="ep-progress-indicator" @click="togglePercentDisplay">
        <span>{{ progressText }}</span>
        <div class="progress-bar" style="width: 120px;">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
      </div>
      <label class="ep-toggle-label">
        <input type="checkbox" v-model="settings.firstCode" />
        首码模式
      </label>
      <button
        v-if="speedReviewActive"
        class="btn-ghost ep-speed-btn"
        @click="exitSpeedReview"
        title="退出极速复习"
      >退出</button>
      <template v-else>
        <button
          v-if="cards.length"
          class="btn-ghost ep-order-btn"
          :class="{ 'ep-order-btn-active': settings.orderMode }"
          @click="toggleOrderMode"
          title="切换顺序模式：按顺序练习每个字根，答错回到上一张"
        >顺序模式</button>
        <button
          v-if="cards.length && settings.speedReviewMode"
          class="btn-ghost ep-speed-btn"
          @click="startSpeedReview"
          title="极速复习：所有字根一遍过，答错提示后也算通过"
        >⚡ 极速复习</button>
      </template>
      <button class="icon-btn" @click="showSettings = !showSettings" title="设置">
        <Icon name="settings" :size="16" />
      </button>
    </div>

    <!-- 主体 -->
    <div class="ep-main">
      <!-- 未导入时 -->
      <div v-if="!cards.length" class="ep-import-empty">
        <div class="ep-import-icon">✨</div>
        <div class="ep-import-title">导入元素开始练习</div>
        <div class="ep-import-buttons">
          <button class="btn btn-outline" @click="importCenterInputRef?.click()">
            📄 选择 .txt 文件
          </button>
          <input ref="importCenterInputRef" type="file" accept=".txt,.tsv,.csv,.json" style="display:none"
                 @change="handleFileImport" />
          <button class="btn-ghost" @click="importCenterZipInputRef?.click()">
            选择 ZIP（数据+字体）
          </button>
          <input ref="importCenterZipInputRef" type="file" accept=".zip,application/zip" style="display:none"
                 @change="handleZipImport" />
          <button class="btn-ghost" @click="rebuildFromEngineAndReset">
            使用引擎字根
          </button>
        </div>
        <small class="ep-import-hint">
          格式：每行一条，Tab 分隔（元素\t编码\t提示），第三列可省略。表头以 <code>#</code> 开头。
        </small>
      </div>

      <!-- 完成 -->
      <div v-else-if="showComplete" class="ep-complete">
        <div class="ep-complete-icon">🎉</div>
        <div class="ep-complete-title">{{ speedReviewFinished ? '极速复习完成' : '恭喜完成练习！' }}</div>
        <div class="ep-complete-sub">
          <template v-if="speedReviewFinished">
            本轮复习 {{ speedReviewProgress.total }} 个元素
          </template>
          <template v-else>
            已掌握 {{ progressCount }} / {{ cards.length }}
          </template>
        </div>
        <div v-if="speedReviewFinished" class="ep-row-buttons" style="justify-content: center;">
          <button class="btn" @click="startSpeedReview">再来一轮</button>
          <button class="btn-ghost" @click="exitSpeedReview">退出极速复习</button>
        </div>
        <button v-else class="btn" @click="showComplete = false; handleRestart()">再来一轮</button>
      </div>

      <!-- 练习区 -->
      <div v-else class="ep-practice-area">
        <!-- 元素展示 -->
        <div v-if="speedReviewActive ? speedReviewCurrentCard : currentCard" class="ep-zigen-display" :style="displayStyle">
          <template v-for="seg in (speedReviewActive ? speedReviewCardSegments : cardSegments)" :key="seg.i">
            <span v-if="seg.t === 'comment'" class="ep-comment">{{ seg.v }}</span>
            <span v-else>{{ seg.v }}</span>
          </template>
        </div>
        <div v-if="(speedReviewActive ? speedReviewCurrentCard?.hint : currentCard?.hint)" class="ep-hint-area">💡 {{ speedReviewActive ? speedReviewCurrentCard?.hint : currentCard?.hint }}</div>
        <div v-if="(speedReviewActive ? speedReviewWrongShown : (isFirst && currentCard))" class="ep-answer-preview">
          答案：<b class="ep-code">{{ speedReviewActive ? speedReviewCurrentCard?.key : currentCard?.key }}</b>
        </div>
        <div class="ep-input-wrapper">
          <input
            ref="inputRef"
            v-model="userInput"
            type="text"
            class="ep-input"
            :class="{ 'input-error': inputError }"
            :placeholder="speedReviewActive ? '极速复习中…' : '编码'"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
          />
        </div>
      </div>
    </div>

    <!-- 描述 -->
    <div v-if="renderedDescription" class="ep-description" v-html="renderedDescription"></div>

    <!-- 操作栏 -->
    <div v-if="cards.length" class="ep-actions">
      <button class="btn-ghost" @click="handleRestart" title="重置进度">
        ↻ 重置进度
      </button>
    </div>

    <!-- 设置面板 -->
    <transition name="ep-slide">
      <div v-if="showSettings" class="ep-settings-panel">
        <!-- 数据管理 -->
        <div class="ep-section-title">� 数据管理</div>

        <div class="ep-setting-item ep-full">
          <label>📎 进度导入/导出</label>
          <div class="ep-row-buttons">
            <button class="btn btn-sm" @click="handleExportProgress">导出进度串</button>
            <button class="btn btn-sm" @click="handleImportProgress">导入进度</button>
          </div>
          <textarea v-model="progressImportExportText" rows="2" class="ep-textarea"
                    placeholder="粘贴进度字符串" />
          <button class="btn btn-sm" @click="handleExportWithHeader">导出部分设置</button>
          <small class="ep-hint">导出可在「元素数据」表头中定义的设置项与元素数据</small>
        </div>

        <div class="ep-setting-item ep-full">
          <label>🗑️ 数据源切换</label>
          <div class="ep-row-buttons">
            <button class="btn btn-sm" @click="importReimportInputRef?.click()">重新导入元素数据</button>
            <input ref="importReimportInputRef" type="file" accept=".txt,.tsv,.csv,.json" style="display:none"
                   @change="handleReimport" />
            <button class="btn-ghost" @click="rebuildFromEngineAndReset">使用引擎字根</button>
            <button class="btn btn-danger" @click="handleClearCards">清空元素数据</button>
          </div>
          <small class="ep-hint">重新导入将覆盖元素数据，未变更的元素保留进度</small>
        </div>

        <!-- 显示设置 -->
        <div class="ep-section-title">🎨 显示设置</div>

        <div class="ep-setting-item ep-full">
          <label>🔤 字体候补</label>
          <div class="ep-inp-row">
            <input v-model="settings.fontFamily" type="text" class="ep-text-input" />
          </div>
          <small class="ep-hint">多个字体用逗号分隔，部分名称需用单引号包裹</small>
        </div>

        <div class="ep-setting-item">
          <label>元素字号 (rem)</label>
          <input v-model.number="settings.zigenSize" type="number" min="2" max="10" step="0.2" class="ep-num-input" />
        </div>
        <div class="ep-setting-item">
          <label>答案字号 (rem)</label>
          <input v-model.number="settings.answerSize" type="number" min="0.8" max="3" step="0.1" class="ep-num-input" />
        </div>
        <div class="ep-setting-item">
          <label>输入框字号 (rem)</label>
          <input v-model.number="settings.inputSize" type="number" min="1" max="4" step="0.1" class="ep-num-input" />
        </div>
        <div class="ep-setting-item">
          <label>提示字号 (rem)</label>
          <input v-model.number="settings.hintSize" type="number" min="0.8" max="2.5" step="0.1" class="ep-num-input" />
        </div>
        <div class="ep-setting-item">
          <label>注释字号 (rem)</label>
          <input v-model.number="settings.commentSize" type="number" min="1" max="6" step="0.1" class="ep-num-input" />
          <small class="ep-hint">元素旁注释字号</small>
        </div>
        <div class="ep-setting-item">
          <label>垂直间隙 ({{ settings.gap }}px)</label>
          <input v-model.number="settings.gap" type="range" min="0" max="40" step="2" />
        </div>

        <div class="ep-section-title">📐 元素数量自适应</div>
        <div class="ep-setting-item">
          <label class="ep-checkbox-label">
            <input type="checkbox" v-model="settings.wrapByCount" />
            元素字数大于指定值换行
          </label>
          <input v-model.number="settings.wrapCountThreshold" type="number" min="1" max="100" class="ep-num-input" />
          <small class="ep-hint">元素字数大于此值时自动换行</small>
        </div>
        <div class="ep-setting-item">
          <label class="ep-checkbox-label">
            <input type="checkbox" v-model="settings.fontSizeByCount" />
            元素字数大于指定值调整字号
          </label>
          <div class="ep-two-col">
            <input v-model.number="settings.fontSizeCountThreshold" type="number" min="1" max="100" class="ep-num-input"
                   placeholder="阈值" />
            <input v-model.number="settings.fontSizeWhenLarge" type="number" min="1" max="10" step="0.1" class="ep-num-input"
                   placeholder="字号" />
          </div>
          <small class="ep-hint">元素字数大于阈值时使用指定字号</small>
        </div>

        <div class="ep-section-title">🔤 字体管理</div>
        <div class="ep-setting-item ep-full">
          <label>📥 导入自定义字体（最多 5 个）</label>
          <button class="btn btn-sm" @click="importFontInputRef?.click()">📁 导入字体文件</button>
          <input ref="importFontInputRef" type="file" accept=".ttf,.otf,.woff,.woff2" style="display:none"
                 @change="handleFontImport" />
        </div>
        <div class="ep-setting-item ep-full">
          <label>已导入字体</label>
          <div v-if="!importedFonts.length" class="ep-empty-hint">暂无导入字体</div>
          <div v-for="f in importedFonts" :key="f.id" class="ep-font-item">
            <div>
              <button class="ep-font-copy-btn" :title="'复制 ' + f.name" @click="copyToClipboard(f.name)">📋</button>
              <span class="ep-font-name">{{ f.name }}</span>
              <span class="ep-font-format">.{{ f.format }}</span>
            </div>
            <button class="ep-font-del-btn" @click="deleteFontItem(f.id)">✕</button>
          </div>
        </div>

        <div class="ep-section-title">🎯 练习模式</div>
        <div class="ep-setting-item">
          <label class="ep-checkbox-label">
            <input type="checkbox" v-model="settings.orderMode" />
            顺序确认模式
          </label>
          <small class="ep-hint">该模式下每个元素只会出现一次</small>
          <small class="ep-hint">开启后自动显示当前轮次</small>
        </div>
        <div class="ep-setting-item">
          <label class="ep-checkbox-label">
            <input type="checkbox" v-model="settings.speedReviewMode" />
            启用极速复习按钮
          </label>
          <small class="ep-hint">开启后顶栏显示「⚡ 极速复习」按钮</small>
          <small class="ep-hint">所有字根一遍过，答错提示后也算通过</small>
        </div>

        <div class="ep-section-title">📝 说明</div>
        <div class="ep-setting-item ep-full">
          <label>练习页说明（支持 BBCode）</label>
          <textarea v-model="settings.description" rows="4" class="ep-textarea"
                    placeholder="[b]粗体[/b] [i]斜体[/i] [mask]马赛克[/mask] [color=#ff0000]彩色[/color] [size=18]大小[/size] [url]http://...[/url] [img]http://...[/img]" />
          <div class="ep-row-buttons">
            <button class="btn btn-sm" @click="handleResetDescription">↺ 重置默认</button>
            <button class="btn btn-sm" @click="handleLoadExample">载入 BBCode 语法示例</button>
          </div>
          <small class="ep-hint">也可在元素数据文件表头中使用 #说明: 来配置</small>
        </div>

        <div class="ep-section-title">🎨 元素高亮</div>
        <div class="ep-setting-item ep-full">
          <button class="btn btn-sm" @click="addHighlightRule" :disabled="settings.highlightRules.length >= 10">
            + 添加规则
          </button>
          <div v-if="!settings.highlightRules.length" class="ep-empty-hint">暂无高亮规则</div>
          <div v-for="(r, idx) in settings.highlightRules" :key="idx" class="ep-hl-row">
            <input type="color" :value="r.lightColor" @input="updateHighlightRule(idx, 'lightColor', ($event.target as HTMLInputElement).value)" />
            <input type="color" :value="r.darkColor" @input="updateHighlightRule(idx, 'darkColor', ($event.target as HTMLInputElement).value)" />
            <input type="text" :value="r.pattern" class="ep-hl-pat"
                   @input="updateHighlightRule(idx, 'pattern', ($event.target as HTMLInputElement).value)"
                   placeholder="正则" />
            <span class="ep-hl-err">{{ validRegex(r.pattern) }}</span>
            <button class="ep-hl-del" @click="removeHighlightRule(idx)">×</button>
          </div>
          <small class="ep-hint">正则匹配元素名，首个命中的颜色生效（最多 10 条）</small>
        </div>

        <div class="ep-section-title">🧹 重置</div>
        <div class="ep-setting-item ep-full">
          <div class="ep-row-buttons">
            <button class="btn btn-sm" @click="handleResetSettings">重置字体/字号/间隙</button>
            <button class="btn btn-danger" @click="handleResetAll">清空所有（元素+进度+设置）</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 欢迎弹窗 -->
    <transition name="ep-fade">
      <div v-if="showWelcome" class="ep-welcome-overlay" @click.self="closeWelcome(false)">
        <div class="ep-welcome-box">
          <h2>👋 欢迎使用元素重复练习器</h2>
          <div class="ep-welcome-body">
            <p><strong>关于本工具</strong></p>
            <p>一个轻量、开源的网页端输入方案元素（字根、音节等）重复练习工具，专为输入方案学习者设计。</p>
            <p>本工具由《呜喵码》作者 mono、铁圈、冬山秋木 借助 AI 技术共同构建。</p>
            <p>本工具完全开源免费
              <a href="https://github.com/Unyaa-Code/root-practice" target="_blank" rel="noopener">GitHub</a>
            </p>
          </div>
          <label class="ep-welcome-checkbox">
            <input type="checkbox" id="neverShowAgain" />
            不再提示
          </label>
          <button class="ep-welcome-close" @click="closeWelcome(($event.target as HTMLElement).previousElementSibling?.querySelector('input')?.checked || false)">
            开始使用
          </button>
        </div>
      </div>
    </transition>

    <!-- Toast -->
    <transition name="ep-fade">
      <div v-if="toastVisible" class="ep-toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.element-practice {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  font-family: inherit;
  color: var(--text);
}

/* ===== 顶栏 ===== */
.ep-top-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 14px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.ep-file-name {
  font-weight: 600;
  font-size: 0.95rem;
  opacity: 0.85;
  margin-right: auto;
  word-break: break-word;
}
.ep-round-counter {
  font-size: 0.85rem;
  font-weight: 600;
  opacity: 0.7;
  padding: 2px 10px;
  background: var(--bg3);
  border-radius: 10px;
  white-space: nowrap;
}
.ep-speed-badge {
  background: color-mix(in srgb, var(--primary) 15%, var(--bg3));
  color: var(--primary);
  opacity: 1;
}
.ep-speed-btn {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 8px;
  color: var(--primary);
  border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
}
.ep-speed-btn:hover {
  background: color-mix(in srgb, var(--primary) 10%, var(--bg3));
}
.ep-order-btn {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 8px;
  color: var(--text2);
  border: 1px solid var(--border);
  background: transparent;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}
.ep-order-btn:hover {
  background: color-mix(in srgb, var(--primary) 10%, var(--bg3));
}
.ep-order-btn-active {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
  background: color-mix(in srgb, var(--primary) 12%, var(--bg2));
}
.ep-progress-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg3);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
}
.ep-toggle-label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}
.ep-toggle-label input { accent-color: var(--primary); }

/* ===== 主体 ===== */
.ep-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}

.ep-import-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 20px;
  border: 2px dashed var(--border);
  border-radius: 12px;
  width: 100%;
  text-align: center;
}
.ep-import-icon { font-size: 2.4rem; opacity: 0.6; }
.ep-import-title { font-size: 1.1rem; font-weight: 600; }
.ep-import-buttons { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
.ep-import-hint { font-size: 0.8rem; opacity: 0.6; }
.ep-import-hint code { background: var(--bg3); padding: 1px 4px; border-radius: 3px; }

.ep-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.ep-complete-icon { font-size: 3rem; }
.ep-complete-title { font-size: 1.3rem; font-weight: 700; }
.ep-complete-sub { font-size: 1rem; opacity: 0.7; }

.ep-practice-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: v-bind('settings.gap + "px"');
  width: 100%;
}
.ep-zigen-display {
  font-size: 5.5rem;
  line-height: 1.3;
  word-break: keep-all;
  white-space: nowrap;
  overflow: hidden;
  padding: 5px 0;
  transition: font-size 0.15s ease;
  text-align: center;
}
.ep-zigen-display > span { white-space: pre; }
.ep-comment {
  font-size: 0.4em;
  color: var(--text2);
  opacity: 0.7;
  white-space: nowrap;
  vertical-align: middle;
  margin: 0 0.05em;
}
.ep-hint-area {
  font-size: 1.2rem;
  opacity: 0.75;
  min-height: 2rem;
  text-align: center;
}
.ep-answer-preview {
  font-size: 1.2rem;
  min-height: 2rem;
  text-align: center;
}
.ep-code {
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  background: var(--bg3);
  padding: 2px 10px;
  border-radius: 4px;
  letter-spacing: 1px;
}
.ep-input-wrapper {
  display: flex;
  justify-content: center;
}
.ep-input {
  width: 200px;
  max-width: 80%;
  padding: 12px 18px;
  font-size: 1.3rem;
  text-align: center;
  background: var(--bg2);
  border: 2px solid var(--border);
  border-radius: 4px;
  outline: none;
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  color: var(--text);
  transition: border-color 0.15s;
}
.ep-input:focus { border-color: var(--primary); }
.ep-input.input-error {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, var(--bg2));
  animation: ep-shake 0.4s ease-in-out;
}
@keyframes ep-shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

/* ===== 描述 ===== */
.ep-description {
  margin-top: 12px;
  padding: 14px 18px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.92rem;
  line-height: 1.8;
  word-break: break-word;
}
.ep-description :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
.ep-description :deep(a) { color: var(--primary); text-decoration: underline; }
.ep-description :deep(.bbcode-mask) {
  background: var(--text);
  color: transparent;
  border-radius: 3px;
  padding: 0 3px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  user-select: none;
}
.ep-description :deep(.bbcode-mask:hover),
.ep-description :deep(.bbcode-mask.revealed) {
  background: transparent;
  color: inherit;
}

/* ===== 操作栏 ===== */
.ep-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

/* ===== 设置面板 ===== */
.ep-settings-panel {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px 20px;
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px 20px;
}
.ep-section-title {
  grid-column: 1 / -1;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.6;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.ep-section-title:first-child { border-top: none; padding-top: 0; }
.ep-setting-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.ep-setting-item.ep-full { grid-column: 1 / -1; }
.ep-setting-item label {
  font-size: 0.85rem;
  font-weight: 600;
  opacity: 0.8;
}
.ep-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.ep-checkbox-label input { accent-color: var(--primary); }
.ep-text-input,
.ep-num-input {
  width: 100%;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--text);
  box-sizing: border-box;
}
.ep-text-input:focus,
.ep-num-input:focus { outline: none; border-color: var(--primary); }
.ep-textarea {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--text);
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
}
.ep-textarea:focus { outline: none; border-color: var(--primary); }
.ep-inp-row { display: flex; gap: 6px; align-items: center; }
.ep-row-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ep-two-col {
  display: flex;
  gap: 8px;
}
.ep-two-col > input { flex: 1; min-width: 0; }
.ep-hint { font-size: 0.75rem; opacity: 0.6; }
.ep-empty-hint { font-size: 0.8rem; opacity: 0.5; font-style: italic; }

.ep-hl-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 3px 0;
  flex-wrap: wrap;
}
.ep-hl-row input[type="color"] {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}
.ep-hl-row .ep-hl-pat {
  flex: 1;
  min-width: 100px;
  font-size: 0.85rem;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
}
.ep-hl-err { font-size: 0.7rem; color: var(--danger); min-width: 70px; white-space: nowrap; }
.ep-hl-del {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text2);
  border-radius: 4px;
  width: 26px;
  height: 26px;
  cursor: pointer;
  font-size: 1rem;
}
.ep-hl-del:hover { background: var(--danger); color: white; border-color: var(--danger); }

.ep-font-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-top: 6px;
  font-size: 0.85rem;
}
.ep-font-copy-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0 6px;
  opacity: 0.7;
}
.ep-font-copy-btn:hover { opacity: 1; }
.ep-font-name { font-family: monospace; font-weight: 600; }
.ep-font-format { opacity: 0.5; font-size: 0.75rem; margin-left: 6px; }
.ep-font-del-btn {
  background: transparent;
  border: none;
  color: var(--danger);
  cursor: pointer;
  font-size: 0.95rem;
  padding: 2px 8px;
}

/* ===== 欢迎弹窗 ===== */
.ep-welcome-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.ep-welcome-box {
  background: var(--bg2);
  color: var(--text);
  border-radius: 12px;
  padding: 28px 32px;
  max-width: 480px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}
.ep-welcome-box h2 { font-size: 1.15rem; margin-bottom: 14px; }
.ep-welcome-body { font-size: 0.9rem; line-height: 1.7; opacity: 0.85; }
.ep-welcome-body p { margin-bottom: 6px; }
.ep-welcome-body a { color: var(--primary); }
.ep-welcome-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  opacity: 0.7;
  margin-top: 14px;
  cursor: pointer;
}
.ep-welcome-close {
  display: block;
  margin-top: 18px;
  padding: 10px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: var(--primary);
  color: white;
  font-size: 0.95rem;
  width: 100%;
  font-weight: 600;
}

/* ===== Toast ===== */
.ep-toast {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 9998;
  font-size: 0.95rem;
  max-width: 80vw;
}

/* ===== Transitions ===== */
.ep-slide-enter-active,
.ep-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.ep-slide-enter-from,
.ep-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.ep-fade-enter-active,
.ep-fade-leave-active {
  transition: opacity 0.2s ease;
}
.ep-fade-enter-from,
.ep-fade-leave-to { opacity: 0; }

/* ===== 响应式 ===== */
@media (max-width: 600px) {
  .ep-settings-panel {
    grid-template-columns: 1fr;
    padding: 12px 10px;
  }
  .ep-two-col { flex-direction: column; }
  .ep-zigen-display { font-size: 3.5rem !important; }
  .ep-top-bar { gap: 6px 8px; padding: 6px 10px; }
  .ep-progress-indicator .progress-bar { width: 80px !important; }
}
</style>
