<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import { useEngine } from '../../composables/useEngine'
import Icon from '../Icon.vue'

const { engine, rootsVersion, bracedRootToPua, isBracedRoot } = useEngine()

// 练习卡片类型
interface PracticeCard {
  root: string       // 字根
  code: string       // 完整编码
  relatedChars: string[]  // 相关汉字
  freqScore: number  // 字频加权分数
}

// 练习记录类型 [练习次数, 原始索引]
type Record = [count: number, index: number]

const LS_KEY = 'chars_hijack_practice_records'

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
    const saved = localStorage.getItem(LS_KEY)
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
    localStorage.setItem(LS_KEY, JSON.stringify(records.value))
  } catch {}
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

// 处理键盘事件
function handleKeydown(e: KeyboardEvent) {
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

// 监听用户输入
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

// 重新开始
function restart() {
  if (!confirm('重置进度需要清空数据，无法撤回，您确定继续吗？')) return

  const cards = allCards.value
  records.value = cards.map((_, i) => [-1, i] as Record)
  progress.value = 0
  showHint.value = true
  showComplete.value = false
  saveRecords()
  updateCurrentCard()
  focusInput()
}

// 聚焦输入框
function focusInput() {
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

// 初始化
onMounted(() => {
  initRecords()
  progress.value = scanProgress()
  focusInput()
  // 添加全局键盘事件监听
  document.addEventListener('keydown', handleKeydown)
})

// 清理
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// 监听字根变化
watch(allCards, () => {
  initRecords()
  progress.value = scanProgress()
}, { deep: true })
</script>

<template>
  <div class="practice-page">
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
        <button class="reset-btn" @click="restart" title="重置进度">
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
      <button class="continue-btn" @click="showComplete = false; focusInput()">继续</button>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-icon">-</div>
      <p>暂无可练习的字根</p>
    </div>
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
</style>