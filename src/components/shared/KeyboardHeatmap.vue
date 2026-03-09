<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  usage: Record<string, number>
  title?: string
  includeSpace?: boolean
}>()

// 默认包含空格
const includeSpace = computed(() => props.includeSpace ?? true)

// 键盘布局定义
const KEYBOARD_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
]

// 左手键集合（用于计算左右手占比）
const LEFT_HAND_KEYS = new Set([...`12345qwertasdfgzxcvb`])

// 手指键位分配（标准指法）
// 左小指(L5): ` 1 Q A Z
// 左无名指(L4): 2 W S X
// 左中指(L3): 3 E D C
// 左食指(L2): 4 5 R T F G V B
// 右食指(R2): 6 7 Y U H J N M
// 右中指(R3): 8 I K ,
// 右无名指(R4): 9 O L .
// 右小指(R5): 0 - = P [ ] \ ; '
const FINGER_KEYS: Record<string, string[]> = {
  'L5': ['`', '1', 'q', 'a', 'z'],           // 左小指
  'L4': ['2', 'w', 's', 'x'],                // 左无名指
  'L3': ['3', 'e', 'd', 'c'],                // 左中指
  'L2': ['4', '5', 'r', 't', 'f', 'g', 'v', 'b'], // 左食指
  'T': [],                                    // 拇指（空格键）
  'R2': ['6', '7', 'y', 'u', 'h', 'j', 'n', 'm'], // 右食指
  'R3': ['8', 'i', 'k', ','],                // 右中指
  'R4': ['9', 'o', 'l', '.'],                // 右无名指
  'R5': ['0', '-', '=', 'p', '[', ']', '\\', ';', "'"], // 右小指
}

// 手指名称映射
const FINGER_NAMES: Record<string, string> = {
  'L5': '左小',
  'L4': '左无',
  'L3': '左中',
  'L2': '左食',
  'T': '拇指',
  'R2': '右食',
  'R3': '右中',
  'R4': '右无',
  'R5': '右小',
}

// 手指顺序（从左到右）
const FINGER_ORDER = ['L5', 'L4', 'L3', 'L2', 'T', 'R2', 'R3', 'R4', 'R5']
const LEFT_FINGERS = ['L2', 'L3', 'L4', 'L5']
const RIGHT_FINGERS = ['R2', 'R3', 'R4', 'R5']

// 计算相对使用率（百分比）
const relativeUsage = computed(() => {
  let total = 0
  
  if (includeSpace.value) {
    // 包含空格：使用所有键的总量
    total = Object.values(props.usage).reduce((a, b) => a + b, 0)
  } else {
    // 不包含空格：只计算非空格键的总量
    for (const [key, value] of Object.entries(props.usage)) {
      if (key !== ' ') {
        total += value
      }
    }
  }
  
  const result: Record<string, number> = {}
  
  for (const [key, value] of Object.entries(props.usage)) {
    const normalizedKey = key.toLowerCase()
    // 不统计空格时，空格键的使用率设为 0
    if (normalizedKey === ' ' && !includeSpace.value) {
      result[normalizedKey] = 0
    } else {
      result[normalizedKey] = total > 0 ? (value / total) * 100 : 0
    }
  }
  
  return result
})

// 获取普通键的最大使用率（排除空格键）
const maxUsage = computed(() => {
  const values = Object.entries(relativeUsage.value)
    .filter(([key]) => key !== ' ')
    .map(([, value]) => value)
  return Math.max(...values, 1)
})

// 获取空格键使用率
const spaceUsage = computed(() => {
  return relativeUsage.value[' '] || 0
})

// 计算左手使用率
const leftHandUsage = computed(() => {
  let total = 0
  for (const [key, value] of Object.entries(relativeUsage.value)) {
    if (LEFT_HAND_KEYS.has(key)) {
      total += value
    }
  }
  // 只有勾选"统计空格"时，才将空格键使用率对半均分给左右手
  if (includeSpace.value) {
    const spaceUsage = relativeUsage.value[' '] || 0
    return total + spaceUsage / 2
  }
  return total
})

// 计算右手使用率
const rightHandUsage = computed(() => {
  let total = 0
  for (const [key, value] of Object.entries(relativeUsage.value)) {
    if (!LEFT_HAND_KEYS.has(key) && key !== ' ') {
      total += value
    }
  }
  // 只有勾选"统计空格"时，才将空格键使用率对半均分给左右手
  if (includeSpace.value) {
    const spaceUsage = relativeUsage.value[' '] || 0
    return total + spaceUsage / 2
  }
  return total
})

// 计算各手指使用占比
const fingerUsage = computed(() => {
  const result: Record<string, number> = {}
  
  for (const finger of FINGER_ORDER) {
    const keys = FINGER_KEYS[finger]
    let total = 0
    
    for (const key of keys) {
      const normalizedKey = key.toLowerCase()
      total += relativeUsage.value[normalizedKey] || 0
    }
    
    result[finger] = total
  }
  
  // 空格键由拇指按下
  if (includeSpace.value) {
    const spaceUsage = relativeUsage.value[' '] || 0
    result['T'] = spaceUsage  // 拇指
  }
  
  return result
})

// 获取手指使用占比的最大值（用于颜色渐变）
const maxFingerUsage = computed(() => {
  return Math.max(...Object.values(fingerUsage.value), 1)
})

function getFingerBaseHue(finger: string): number {
  if (finger.startsWith('L')) return 208
  if (finger === 'T') return 162
  return 266
}

function buildUsageStyle(hue: number, usage: number, max: number): Record<string, string> {
  const ratio = max > 0 ? usage / max : 0
  const intensity = Math.pow(Math.min(ratio, 1), 0.7)
  const saturation = 68 + intensity * 18
  const accentLightness = 46 - intensity * 10

  return {
    '--usage-accent': `hsl(${hue}, ${saturation}%, ${accentLightness}%)`,
    '--usage-bg-start': `hsla(${hue}, ${saturation}%, ${95 - intensity * 6}%, 0.95)`,
    '--usage-bg-end': `hsla(${hue}, ${saturation}%, ${91 - intensity * 8}%, 0.9)`,
    '--usage-border': `hsla(${hue}, ${saturation}%, ${70 - intensity * 14}%, ${0.28 + intensity * 0.2})`,
    '--usage-chip-bg': `hsla(${hue}, ${saturation}%, ${90 - intensity * 12}%, ${0.42 + intensity * 0.18})`,
    '--usage-shadow': `hsla(${hue}, ${saturation}%, 52%, ${0.12 + intensity * 0.12})`,
  }
}

function getFingerStyle(finger: string): Record<string, string> {
  return buildUsageStyle(getFingerBaseHue(finger), fingerUsage.value[finger] || 0, maxFingerUsage.value)
}

function getHandStyle(hand: 'left' | 'right'): Record<string, string> {
  const usage = hand === 'left' ? leftHandUsage.value : rightHandUsage.value
  const max = Math.max(leftHandUsage.value, rightHandUsage.value, 1)
  const hue = hand === 'left' ? 208 : 266
  return buildUsageStyle(hue, usage, max)
}

// 获取键的颜色
function getKeyColor(key: string): string {
  const normalizedKey = key.toLowerCase()
  const usage = relativeUsage.value[normalizedKey] || 0
  
  // 空格键使用青色/绿色系
  if (normalizedKey === ' ') {
    if (usage === 0) return 'var(--bg3)'
    // 使用四次方增强对比度，让低值变化更明显
    const intensity = Math.min(Math.pow(usage / 15, 0.4), 1)
    const hue = 160 + intensity * 20
    const saturation = 40 + intensity * 60
    const lightness = 55 - intensity * 20
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  }
  
  // 普通键使用浅蓝色系
  if (usage === 0) return 'var(--bg3)'
  
  // 使用四次方根增强低值对比度，让 1.5% 和 4.9% 差异更明显
  const ratio = usage / maxUsage.value
  const intensity = Math.pow(ratio, 0.55) // 0.35次方，大幅拉伸低值区域
  
  // 分段颜色：让低值也有明显变化
  const hue = 195 + intensity * 25 // 195浅蓝 -> 220深蓝
  const saturation = 45 + intensity * 55 // 45% -> 100%
  const lightness = 75 - intensity * 40 // 75%(很浅) -> 35%(深)
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

// 获取文字颜色
function getTextColor(key: string): string {
  const normalizedKey = key.toLowerCase()
  const usage = relativeUsage.value[normalizedKey] || 0
  
  // 空格键
  if (normalizedKey === ' ') {
    const intensity = Math.min(Math.pow(usage / 15, 0.4), 1)
    return intensity > 0.35 ? 'white' : 'var(--text)'
  }
  
  // 普通键 - 使用与颜色相同的非线性算法
  if (usage === 0) return 'var(--text)'
  const ratio = usage / maxUsage.value
  const intensity = Math.pow(ratio, 0.35)
  return intensity > 0.5 ? 'white' : 'var(--text)'
}

// 格式化百分比（保留2位小数）
function formatPercent(key: string): string {
  const usage = relativeUsage.value[key.toLowerCase()] || 0
  return usage.toFixed(2) + '%'
}
</script>

<template>
  <div class="keyboard-heatmap">
    <div v-if="title" class="heatmap-title">{{ title }}</div>
    <div class="keyboard-container">
      <div v-for="(row, rowIdx) in KEYBOARD_ROWS" :key="rowIdx" class="keyboard-row">
        <div
          v-for="key in row"
          :key="key"
          class="key"
          :style="{
            backgroundColor: getKeyColor(key),
            color: getTextColor(key)
          }"
          :title="`${key}: ${formatPercent(key)}`"
        >
          <span class="key-label">{{ key }}</span>
          <span class="key-usage">{{ formatPercent(key) }}</span>
        </div>
      </div>
      <!-- 空格键行：在空格键内部左侧显示左手占比，右侧显示右手占比 -->
      <div class="keyboard-row space-row">
        <div
          class="key key-space"
          :style="{
            backgroundColor: getKeyColor(' '),
            color: getTextColor(' ')
          }"
          title="空格"
        >
          <div class="space-content">
            <div class="usage-card hand-stats left-stats" :style="getHandStyle('left')">
              <span class="usage-name">左手</span>
              <span class="usage-percent">{{ leftHandUsage.toFixed(2) }}%</span>
            </div>
            <div class="space-center">
              <span class="key-label">空格</span>
              <span class="key-usage">{{ formatPercent(' ') }}</span>
            </div>
            <div class="usage-card hand-stats right-stats" :style="getHandStyle('right')">
              <span class="usage-name">右手</span>
              <span class="usage-percent">{{ rightHandUsage.toFixed(2) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 图例 -->
    <div class="legend-container">
      <div class="legend">
        <span class="legend-label">普通键:</span>
        <span class="legend-min">0%</span>
        <div class="legend-bar">
          <div class="legend-gradient legend-gradient-keys"></div>
        </div>
        <span class="legend-max">{{ maxUsage.toFixed(1) }}%</span>
      </div>
      <div class="legend legend-space">
        <span class="legend-label">空格键:</span>
        <span class="legend-min">0%</span>
        <div class="legend-bar">
          <div class="legend-gradient legend-gradient-space"></div>
        </div>
        <span class="legend-max">{{ spaceUsage.toFixed(1) }}%</span>
      </div>
    </div>
    
    <!-- 手指使用分布 -->
    <div class="finger-distribution">
      <div class="finger-title">手指使用分布</div>
      <div class="finger-layout">
        <div
          class="usage-card finger-item finger-thumb"
          :style="getFingerStyle('T')"
        >
          <span class="usage-name">{{ FINGER_NAMES.T }}</span>
          <span class="usage-percent">{{ fingerUsage.T.toFixed(2) }}%</span>
        </div>
        <div class="finger-hand-row">
          <div
            v-for="finger in LEFT_FINGERS"
            :key="finger"
            class="usage-card finger-item"
            :style="getFingerStyle(finger)"
          >
            <span class="usage-name">{{ FINGER_NAMES[finger] }}</span>
            <span class="usage-percent">{{ fingerUsage[finger].toFixed(2) }}%</span>
          </div>
        </div>
        <div class="finger-hand-row">
          <div
            v-for="finger in RIGHT_FINGERS"
            :key="finger"
            class="usage-card finger-item"
            :style="getFingerStyle(finger)"
          >
            <span class="usage-name">{{ FINGER_NAMES[finger] }}</span>
            <span class="usage-percent">{{ fingerUsage[finger].toFixed(2) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard-heatmap {
  padding: 16px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.heatmap-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
}

.keyboard-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
  width: 100%;
}

.keyboard-row {
  display: flex;
  gap: 6px;
  justify-content: center;
}

/* 模拟真实键盘的行偏移 - 使用 transform 在居中基础上偏移 */
.keyboard-row:nth-child(1) {
  /* 数字行 - 无偏移 */
}

.keyboard-row:nth-child(2) {
  /* QWERTY 行 - 向右偏移约 0.25 个键宽 */
  transform: translateX(calc(1.6 * (52px + 6px)));
}

.keyboard-row:nth-child(3) {
  /* ASDF 行 - 向右偏移约 0.5 个键宽 */
  transform: translateX(calc(0.85 * (52px + 6px)));
}

.keyboard-row:nth-child(4) {
  /* ZXCV 行 - 向右偏移约 0.75 个键宽 */
  transform: translateX(calc(0.9 * (52px + 6px)));
}

.key {
  flex: 1;
  max-width: 52px;
  min-width: 32px;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-family: 'SF Mono', 'Consolas', monospace;
  transition: transform 0.15s ease;
  cursor: default;
}

.key:hover {
  transform: scale(1.1);
  z-index: 1;
  position: relative;
}

.key-label {
  font-size: clamp(10px, 2vw, 14px);
  font-weight: 600;
}

.key-usage {
  font-size: clamp(8px, 1.5vw, 10px);
  opacity: 0.8;
}

.key-space {
  flex: 0 0 auto;
  width: 50%;
  max-width: 400px;
  min-width: 200px;
  aspect-ratio: auto;
  height: 44px;
  padding: 0 16px;
}

.space-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  height: 100%;
}

.hand-stats {
  min-width: 92px;
  flex: 0 0 auto;
}

.space-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
}

.space-center .key-label {
  font-size: 14px;
  font-weight: 600;
}

.space-center .key-usage {
  font-size: 10px;
  opacity: 0.8;
}

.space-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 4px;
}

.usage-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px 6px 12px;
  min-width: 0;
  border-radius: 999px;
  border: 1px solid var(--usage-border);
  background:
    linear-gradient(135deg, var(--usage-bg-start), var(--usage-bg-end)),
    var(--bg2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    0 10px 24px -18px var(--usage-shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.usage-card:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    0 14px 26px -18px var(--usage-shadow);
}

.usage-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
}

.usage-percent {
  font-size: 13px;
  font-weight: 700;
  color: var(--usage-accent);
  font-family: 'SF Mono', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--usage-chip-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.legend-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text2);
}

.legend-label {
  min-width: 50px;
}

.legend-bar {
  flex: 1;
  max-width: 200px;
  height: 12px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.legend-gradient-keys {
  height: 100%;
  background: linear-gradient(to right, 
    var(--bg3) 0%,
    hsl(200, 50%, 70%) 20%,
    hsl(205, 60%, 60%) 40%,
    hsl(210, 75%, 55%) 60%,
    hsl(215, 90%, 48%) 80%,
    hsl(220, 100%, 40%) 100%
  );
}

.legend-gradient-space {
  height: 100%;
  background: linear-gradient(to right, 
    var(--bg3) 0%,
    hsl(165, 60%, 50%) 20%,
    hsl(170, 75%, 45%) 40%,
    hsl(175, 90%, 42%) 60%,
    hsl(180, 95%, 38%) 80%,
    hsl(180, 100%, 35%) 100%
  );
}

.legend-min, .legend-max {
  font-size: 11px;
  min-width: 40px;
}

.legend-max {
  text-align: right;
}

/* 手指使用分布 */
.finger-distribution {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.finger-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
}

.finger-layout {
  display: grid;
  grid-template-columns: minmax(100px, 120px) minmax(0, 1fr);
  grid-template-rows: repeat(2, auto);
  gap: 10px 14px;
  align-items: stretch;
}

.finger-item {
  width: 100%;
  white-space: nowrap;
}

.finger-thumb {
  grid-row: 1 / span 2;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 12px 14px;
  border-radius: 18px;
}

.finger-thumb .usage-name {
  font-size: 14px;
}

.finger-thumb .usage-percent {
  font-size: 15px;
  padding-inline: 10px;
}

.finger-hand-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 12px;
}

@media (max-width: 720px) {
  .key-space {
    width: 100%;
    max-width: none;
    min-width: 0;
    height: auto;
    padding: 10px 12px;
  }

  .space-content {
    flex-wrap: wrap;
    justify-content: center;
  }

  .space-center {
    order: -1;
    width: 100%;
  }

  .hand-stats {
    min-width: 0;
    flex: 1 1 140px;
  }

  .finger-layout {
    grid-template-columns: 1fr;
  }

  .finger-thumb {
    grid-row: auto;
    flex-direction: row;
    align-items: center;
    border-radius: 999px;
    padding: 6px 8px 6px 12px;
  }

  .finger-thumb .usage-name,
  .finger-thumb .usage-percent {
    font-size: 13px;
  }

  .finger-hand-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
