<script setup lang="ts">
import { computed } from 'vue'
import { useEngine } from '../../composables/useEngine'

const { engine, rootsVersion } = useEngine()

// 31键布局
const KEYBOARD_LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
]

// 获取某键位上的所有字根
const rootsOnKey = computed(() => {
  rootsVersion.value
  const result = new Map<string, string[]>()

  // 初始化所有键位
  for (const row of KEYBOARD_LAYOUT) {
    for (const key of row) {
      result.set(key, [])
    }
  }
  result.set('_', [])

  // 遍历所有字根，按主键位分组
  for (const root of engine.roots) {
    const code = engine.rootCodes.get(root)
    const mainKey = code ? code.main.toLowerCase() : 'd'
    if (result.has(mainKey)) {
      result.get(mainKey)!.push(root)
    }
  }

  // 对每个键位内的字根排序
  for (const [key, roots] of result) {
    roots.sort((a, b) => a.localeCompare(b))
  }

  return result
})

// 格式化字根显示（最多显示一定数量）
function formatRoots(roots: string[]): { display: string; more: number } {
  const maxDisplay = 20
  if (roots.length <= maxDisplay) {
    return { display: roots.join(' '), more: 0 }
  }
  return {
    display: roots.slice(0, maxDisplay).join(' '),
    more: roots.length - maxDisplay
  }
}
</script>

<template>
  <div class="keyboard-page">
    <div class="keyboard-wrapper">
      <!-- 主键盘区 -->
      <div class="keyboard">
        <div v-for="(row, ri) in KEYBOARD_LAYOUT" :key="ri" class="keyboard-row">
          <div
            v-for="key in row"
            :key="key"
            class="key"
            :class="{ 'key-populated': rootsOnKey.get(key)?.length }"
          >
            <span class="key-label">{{ key.toUpperCase() }}</span>
            <div class="key-roots">
              <template v-if="rootsOnKey.get(key)?.length">
                <span class="roots-text">{{ formatRoots(rootsOnKey.get(key)!).display }}</span>
                <span v-if="formatRoots(rootsOnKey.get(key)!).more > 0" class="roots-more">
                  +{{ formatRoots(rootsOnKey.get(key)!).more }}
                </span>
              </template>
            </div>
            <span v-if="rootsOnKey.get(key)?.length" class="key-count">
              {{ rootsOnKey.get(key)?.length }}
            </span>
          </div>
        </div>

        <!-- 空格键行 -->
        <div class="keyboard-row space-row">
          <div
            class="key key-space"
            :class="{ 'key-populated': rootsOnKey.get('_')?.length }"
          >
            <span class="key-label">空格</span>
            <div class="key-roots">
              <template v-if="rootsOnKey.get('_')?.length">
                <span class="roots-text">{{ formatRoots(rootsOnKey.get('_')!).display }}</span>
                <span v-if="formatRoots(rootsOnKey.get('_')!).more > 0" class="roots-more">
                  +{{ formatRoots(rootsOnKey.get('_')!).more }}
                </span>
              </template>
            </div>
            <span v-if="rootsOnKey.get('_')?.length" class="key-count">
              {{ rootsOnKey.get('_')?.length }}
            </span>
          </div>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="stats">
        <span class="stat-item">
          <strong>{{ engine.roots.size }}</strong> 个字根
        </span>
        <span class="stat-item">
          <strong>{{ KEYBOARD_LAYOUT.flat().filter(k => rootsOnKey.get(k)?.length).length }}</strong> 个键位已使用
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 40px);
  align-items: center;
  justify-content: center;
}

.keyboard-wrapper {
  width: 100%;
  max-width: 1200px;
  padding: 0 24px;
}

.keyboard {
  background: var(--bg2);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
}

.keyboard-row {
  display: flex;
  gap: 8px;
}

.key {
  flex: 1;
  min-height: 80px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 4px;
  gap: 2px;
  position: relative;
  overflow: hidden;
}

.key-populated {
  background: var(--bg);
  border-color: var(--accent);
  border-width: 2px;
}

.key-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  opacity: 0.5;
}

.key-populated .key-label {
  opacity: 1;
  color: var(--accent);
}

.key-roots {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
  line-height: 1.2;
}

.roots-text {
  font-size: 12px;
  color: var(--text);
  letter-spacing: 0;
  word-break: break-all;
}

.roots-more {
  font-size: 10px;
  color: var(--text2);
  margin-left: 2px;
}

.key-count {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 10px;
  background: var(--accent);
  color: white;
  padding: 1px 5px;
  border-radius: 8px;
  font-weight: 500;
}

/* 空格键 */
.space-row {
  margin-top: 6px;
}

.key-space {
  min-height: 40px;
  width: 100%;
  flex: none;
}

/* 统计信息 */
.stats {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-top: 20px;
  font-size: 14px;
  color: var(--text2);
}

.stat-item strong {
  color: var(--accent);
  font-weight: 600;
}

/* 响应式 */
@media (max-width: 900px) {
  .key {
    min-height: 60px;
    padding: 3px;
  }

  .key-label {
    font-size: 12px;
  }

  .roots-text {
    font-size: 10px;
  }
}
</style>