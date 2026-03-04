<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import ElementPool from './ElementPool.vue'
import ElementAdder from './ElementAdder.vue'

const props = defineProps<{
  selectedKey?: string  // 当前选中的键位（用于双击快速添加）
  externalElement?: string  // 外部选择的元素（用于从字根详情面板点击）
}>()

const emit = defineEmits<{
  (e: 'added'): void
  (e: 'update:externalElement', value: string | undefined): void
  (e: 'select', element: string): void  // 新增：选择元素时触发
}>()

// 监听外部元素变化
watch(() => props.externalElement, (val) => {
  if (val) {
    selectedElement.value = val
  }
})

const { engine, rootsVersion } = useEngine()

// 搜索关键词
const searchQuery = ref('')
const searchDebounced = ref('')

// 当前选中元素
const selectedElement = ref<string | undefined>(undefined)

// 搜索防抖
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchDebounced.value = val
  }, 300)
})

// 判断是否为笔画编码搜索
function isStrokeCodeQuery(query: string): boolean {
  return /^[1-5]+$/.test(query)
}

// 所有元素列表（合并原子字根、IDS汉字、命名字根）
const allElements = computed(() => {
  rootsVersion.value  // 触发响应式更新

  const elementSet = new Set<string>()

  // 添加原子字根
  for (const c of engine.atomicComponents()) {
    elementSet.add(c)
  }

  // 添加 IDS 汉字
  for (const c of engine.getCharset()) {
    elementSet.add(c)
  }

  // 添加命名字根
  for (const c of engine.namedRoots.keys()) {
    elementSet.add(c)
  }

  return Array.from(elementSet)
})

// 过滤后的元素列表
const filteredElements = computed(() => {
  const query = searchDebounced.value.trim()
  if (!query) return allElements.value

  const strokeSearch = isStrokeCodeQuery(query)

  const matched = allElements.value.filter(element => {
    if (strokeSearch) {
      // 笔画编码搜索
      const strokes = engine.getStrokes(element)
      const strokeCode = strokes.length > 0 ? strokes[0] : ''
      return strokeCode.includes(query)
    } else {
      // 汉字搜索（支持命名字根的括号内容）
      const searchTarget = element.startsWith('{') && element.endsWith('}')
        ? element.slice(1, -1) + ' ' + element
        : element
      return searchTarget.includes(query)
    }
  })

  // 笔画搜索时，完全匹配的排在前面
  if (strokeSearch) {
    return matched.sort((a, b) => {
      const strokesA = engine.getStrokes(a)
      const strokesB = engine.getStrokes(b)
      const codeA = strokesA.length > 0 ? strokesA[0] : ''
      const codeB = strokesB.length > 0 ? strokesB[0] : ''
      
      const exactMatchA = codeA === query ? 0 : 1
      const exactMatchB = codeB === query ? 0 : 1
      
      return exactMatchA - exactMatchB
    })
  }

  return matched
})

// 元素总数
const totalCount = computed(() => allElements.value.length)
const filteredCount = computed(() => filteredElements.value.length)

// 选择元素
function selectElement(element: string) {
  selectedElement.value = selectedElement.value === element ? undefined : element
  // 向上传递 select 事件（用于定位键位）
  emit('select', element)
}

// 双击元素（选中元素）
function doubleClickElement(element: string) {
  selectedElement.value = element
}

// 添加完成回调
function onAdded() {
  emit('added')
}

// 关闭添加面板（清除选中元素）
function onClose() {
  selectedElement.value = undefined
}
</script>

<template>
  <div class="element-picker">
    <div class="picker-header">
      <h3 class="picker-title">元素选择器</h3>
      <span class="element-count">{{ totalCount }}</span>
    </div>

    <!-- 搜索框 -->
    <div class="search-box">
      <input
        v-model="searchQuery"
        type="search"
        class="search-input"
        placeholder="搜索元素（支持笔画编码12345）"
      />
      <span v-if="searchQuery" class="filter-count">
        {{ filteredCount }} / {{ totalCount }}
      </span>
    </div>

    <!-- 元素池 -->
    <div class="pool-section">
      <ElementPool
        :elements="filteredElements"
        :selected-element="selectedElement"
        :page-size="28"
        @select="selectElement"
        @double-click="doubleClickElement"
      />
    </div>

    <!-- 操作栏 -->
    <div class="adder-section">
      <ElementAdder
        :selected-element="selectedElement"
        :selected-key="selectedKey"
        @added="onAdded"
        @close="onClose"
      />
    </div>
  </div>
</template>

<style scoped>
.element-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 400px;
  min-width: 400px;
  max-width: 400px;
  height: 100%;
  padding: 16px;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.picker-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.element-count {
  font-size: 12px;
  color: var(--text2);
  background: var(--bg3);
  padding: 2px 8px;
  border-radius: 4px;
}

.search-box {
  position: relative;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 13px;
}

.filter-count {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--text3);
  pointer-events: none;
}

.pool-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.adder-section {
  flex-shrink: 0;
}
</style>