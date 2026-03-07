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
            <div class="hand-stats left-stats">
              <span class="hand-label">左手</span>
              <span class="hand-percent">{{ leftHandUsage.toFixed(2) }}%</span>
            </div>
            <div class="space-center">
              <span class="key-label">空格</span>
              <span class="key-usage">{{ formatPercent(' ') }}</span>
            </div>
            <div class="hand-stats right-stats">
              <span class="hand-label">右手</span>
              <span class="hand-percent">{{ rightHandUsage.toFixed(2) }}%</span>
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
  width: 100%;
  height: 100%;
}

.hand-stats {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 50px;
}

.hand-stats .hand-label {
  font-size: 9px;
  opacity: 0.8;
  color: inherit;
}

.hand-stats .hand-percent {
  font-size: 10px;
  opacity: 0.8;
  font-weight: 600;
  color: inherit;
}

.space-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
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

.hand-usage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  background: var(--bg3);
  border-radius: 6px;
  min-width: 60px;
}

.hand-label {
  font-size: 11px;
  color: var(--text2);
  font-weight: 500;
}

.hand-percent {
  font-size: 13px;
  color: var(--text);
  font-weight: 600;
  font-family: 'SF Mono', 'Consolas', monospace;
}

.left-hand {
  border-left: 3px solid hsl(200, 70%, 55%);
}

.right-hand {
  border-right: 3px solid hsl(200, 70%, 55%);
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
</style>
