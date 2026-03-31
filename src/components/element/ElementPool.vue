<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { codeToString } from '../../engine/config'
import { unicodeHex } from '../../engine/unicode'

const props = defineProps<{
  elements: string[]  // 元素列表
  selectedElement?: string  // 当前选中元素
  pageSize?: number  // 每页数量
}>()

const emit = defineEmits<{
  (e: 'select', element: string): void
  (e: 'doubleClick', element: string): void
}>()

const { engine, rootsVersion, bracedRootToPua, isBracedRoot } = useEngine()

const pageSize = props.pageSize || 28
const currentPage = ref(1)
const jumpPageInput = ref('')

// 计算总页数
const totalPages = computed(() => Math.ceil(props.elements.length / pageSize))

// 当前页的元素
const pageElements = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return props.elements.slice(start, start + pageSize)
})

// 当元素列表变化时重置页码
watch(() => props.elements, () => {
  currentPage.value = 1
  jumpPageInput.value = ''
})

// 获取元素信息
function getElementInfo(element: string) {
  const code = engine.rootCodes.get(element)
  const isAdded = engine.roots.has(element)
  const strokes = engine.getStrokes(element)
  const strokeCode = strokes.length > 0 ? strokes[0] : ''

  return {
    code: code ? codeToString(code) : '',
    isAdded,
    strokeCode,
    strokeCount: engine.strokeCount(element)
  }
}

// 显示元素（PUA转换）
function displayElement(element: string): string {
  return bracedRootToPua(element)
}

// 获取字体类
function getFontClass(element: string): string {
  return isBracedRoot(element) ? 'pua-font' : ''
}

// 点击元素
function onClick(element: string) {
  emit('select', element)
}

// 双击元素
function onDoubleClick(element: string) {
  emit('doubleClick', element)
}

// 切换页码
function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    jumpPageInput.value = ''
  }
}

// 跳转到首页
function goToFirst() {
  goToPage(1)
}

// 跳转到尾页
function goToLast() {
  goToPage(totalPages.value)
}

// 跳转到指定页
function jumpToPage() {
  const page = parseInt(jumpPageInput.value, 10)
  if (!isNaN(page) && page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    jumpPageInput.value = ''
  }
}
</script>

<template>
  <div class="element-pool">
    <!-- 元素网格 -->
    <div class="element-grid">
      <div
        v-for="element in pageElements"
        :key="element"
        class="element-item"
        :class="{
          selected: element === selectedElement,
          added: engine.roots.has(element)
        }"
        @click="onClick(element)"
        @dblclick="onDoubleClick(element)"
      >
        <span class="element-char" :class="getFontClass(element)">
          {{ displayElement(element) }}
        </span>
        <span v-if="getElementInfo(element).code" class="element-code">
          {{ getElementInfo(element).code }}
        </span>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pagination">
      <button
        class="page-btn"
        title="首页"
        :disabled="currentPage === 1"
        @click="goToFirst"
      >
        «
      </button>
      <button
        class="page-btn"
        title="上一页"
        :disabled="currentPage === 1"
        @click="goToPage(currentPage - 1)"
      >
        ‹
      </button>
      <span class="page-info">
        <input
          v-model="jumpPageInput"
          type="number"
          class="page-input"
          :min="1"
          :max="totalPages"
          @keydown.enter="jumpToPage"
        />
        / {{ totalPages }}
      </span>
      <button
        class="page-btn"
        title="下一页"
        :disabled="currentPage === totalPages"
        @click="goToPage(currentPage + 1)"
      >
        ›
      </button>
      <button
        class="page-btn"
        title="尾页"
        :disabled="currentPage === totalPages"
        @click="goToLast"
      >
        »
      </button>
    </div>
  </div>
</template>

<style scoped>
.element-pool {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.element-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.element-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  min-height: 48px;
  background: var(--bg2);
  border: 1px solid transparent;
}

.element-item:hover {
  background: var(--bg3);
  border-color: var(--border);
}

.element-item.selected {
  background: var(--primary-bg);
  border-color: var(--primary);
}

.element-item.added {
  background: rgba(0, 180, 42, 0.08);
}

.element-item.added.selected {
  background: var(--primary-bg);
}

.element-char {
  font-size: 20px;
  line-height: 1;
  color: var(--text);
}

.element-code {
  font-size: 10px;
  color: var(--success);
  font-family: monospace;
  margin-top: 2px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
}

.page-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg2);
  color: var(--text);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 13px;
  color: var(--text2);
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-input {
  width: 50px;
  padding: 2px 4px;
  font-size: 12px;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
}

.page-input::-webkit-inner-spin-button,
.page-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.total-count {
  font-size: 12px;
  color: var(--text3);
}
</style>
