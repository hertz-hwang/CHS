<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  usage: Record<string, number>
  title?: string
}>()

// 键盘布局定义
const KEYBOARD_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
]

// 计算相对使用率（百分比）
const relativeUsage = computed(() => {
  const total = Object.values(props.usage).reduce((a, b) => a + b, 0)
  const result: Record<string, number> = {}
  
  for (const [key, value] of Object.entries(props.usage)) {
    result[key.toLowerCase()] = total > 0 ? (value / total) * 100 : 0
  }
  
  return result
})

// 获取最大使用率
const maxUsage = computed(() => {
  return Math.max(...Object.values(relativeUsage.value), 1)
})

// 获取键的颜色
function getKeyColor(key: string): string {
  const usage = relativeUsage.value[key.toLowerCase()] || 0
  const intensity = usage / maxUsage.value
  
  // 使用蓝色渐变
  if (intensity === 0) return 'var(--bg3)'
  if (intensity < 0.2) return 'rgba(59, 130, 246, 0.2)'
  if (intensity < 0.4) return 'rgba(59, 130, 246, 0.4)'
  if (intensity < 0.6) return 'rgba(59, 130, 246, 0.6)'
  if (intensity < 0.8) return 'rgba(59, 130, 246, 0.8)'
  return 'rgba(59, 130, 246, 1)'
}

// 获取文字颜色
function getTextColor(key: string): string {
  const usage = relativeUsage.value[key.toLowerCase()] || 0
  const intensity = usage / maxUsage.value
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
      <!-- 空格键单独一行 -->
      <div class="keyboard-row space-row">
        <div
          class="key key-space"
          :style="{
            backgroundColor: getKeyColor(' '),
            color: getTextColor(' ')
          }"
          title="空格"
        >
          <span class="key-label">空格</span>
          <span class="key-usage">{{ formatPercent(' ') }}</span>
        </div>
      </div>
    </div>
    
    <!-- 图例 -->
    <div class="legend">
      <span class="legend-label">使用频率:</span>
      <div class="legend-bar">
        <div class="legend-gradient"></div>
      </div>
      <span class="legend-min">0%</span>
      <span class="legend-max">{{ maxUsage.toFixed(1) }}%</span>
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
  min-width: 160px;
  aspect-ratio: auto;
  height: 44px;
}

.space-row {
  justify-content: center;
  margin-top: 4px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  font-size: 12px;
  color: var(--text2);
}

.legend-label {
  margin-right: 4px;
}

.legend-bar {
  flex: 1;
  max-width: 200px;
  height: 12px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.legend-gradient {
  height: 100%;
  background: linear-gradient(to right, 
    var(--bg3) 0%,
    rgba(59, 130, 246, 0.2) 20%,
    rgba(59, 130, 246, 0.4) 40%,
    rgba(59, 130, 246, 0.6) 60%,
    rgba(59, 130, 246, 0.8) 80%,
    rgba(59, 130, 246, 1) 100%
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