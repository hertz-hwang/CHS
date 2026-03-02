<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import IdsTransformer from '../shared/IdsTransformer.vue'
import { unicodeHex, unicodeBlock } from '../../engine/unicode'
import Icon from '../Icon.vue'

const { 
  engine, stats, selectChar, charsetVersion, getCurrentCharset,
  bracedRootToPua, isBracedRoot 
} = useEngine()

// 显示字根（花括号字根转为 PUA 字符）
function displayRoot(root: string): string {
  return bracedRootToPua(root)
}

// 获取字根的字体样式类
function getRootFontClass(root: string): string {
  return isBracedRoot(root) ? 'pua-font' : ''
}

// 搜索相关
const searchQuery = ref('')
const searchType = ref<'char' | 'unicode' | 'pinyin' | 'stroke'>('char')
const currentPage = ref(1)
const pageSize = 50

// 显示模式
const showTransformer = ref(false)

// 获取所有汉字（根据当前选择的字集）
const allChars = computed(() => {
  charsetVersion.value // 依赖字集版本，当字集切换时重新计算
  return getCurrentCharset()
})

// 根据搜索条件过滤并排序
const filteredChars = computed(() => {
  const query = searchQuery.value.trim()
  if (!query) return allChars.value

  const filtered = allChars.value.filter(char => {
    switch (searchType.value) {
      case 'char':
        return char.includes(query) || 
               engine.decomp.get(char)?.includes(query)
      case 'unicode':
        const hex = unicodeHex(char).toLowerCase()
        return hex.includes(query.toLowerCase()) || 
               char.codePointAt(0)?.toString(16).toLowerCase().includes(query.toLowerCase())
      case 'pinyin':
        const py = engine.pinyin.get(char)?.toLowerCase() || ''
        return py.includes(query.toLowerCase())
      case 'stroke':
        const strokes = engine.getStrokes(char)
        return strokes.some(s => s.includes(query)) ||
               engine.strokeCount(char).toString() === query
      default:
        return true
    }
  })
  
  // 排序：完全匹配优先，然后按字频降序
  return filtered.sort((a, b) => {
    // 汉字搜索时，完全匹配排最前
    if (searchType.value === 'char') {
      const aExact = a === query
      const bExact = b === query
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1
    }
    // 按字频降序
    const freqA = engine.freq.get(a) || 0
    const freqB = engine.freq.get(b) || 0
    return freqB - freqA
  })
})

// 分页
const totalPages = computed(() => Math.ceil(filteredChars.value.length / pageSize))
const pagedChars = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredChars.value.slice(start, start + pageSize)
})

// 获取字的详细信息
function getCharInfo(char: string) {
  const decomp = engine.decompose(char)
  const pyList = engine.getPinyinList(char)
  const strokes = engine.getStrokes(char)
  const freq = engine.freq.get(char)
  
  return {
    char,
    unicode: unicodeHex(char),
    block: unicodeBlock(char),
    pinyin: pyList.map(p => p.py).join(', '),
    mainPinyin: pyList[0]?.py || '',
    ids: decomp.ids,
    split: decomp.leaves,  // 返回数组，便于单独处理每个字根
    strokeCount: engine.strokeCount(char),
    strokeCodes: strokes.join(' / '),
    freq: freq || 0,
  }
}

// 重置页码
watch(searchQuery, () => {
  currentPage.value = 1
})

// 跳转页码
function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}
</script>

<template>
  <div class="data-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title"><Icon name="database" :size="18" /> 汉字数据</span>
        <span class="count">共 {{ allChars.length }} 字</span>
        <span v-if="searchQuery" class="filter-info">
          筛选: {{ filteredChars.length }} 字
        </span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm" :class="{ 'btn-outline': !showTransformer }" @click="showTransformer = !showTransformer">
          {{ showTransformer ? '隐藏转换器' : 'IDS转换器' }}
        </button>
      </div>
    </div>

    <!-- IDS转换器 -->
    <IdsTransformer v-if="showTransformer" />

    <!-- 搜索区域 -->
    <div class="search-panel">
      <div class="search-row">
        <select v-model="searchType" class="search-type">
          <option value="char">汉字</option>
          <option value="unicode">Unicode</option>
          <option value="pinyin">拼音</option>
          <option value="stroke">笔画</option>
        </select>
        <input 
          v-model="searchQuery" 
          type="search" 
          class="search-input"
          :placeholder="{
            char: '输入汉字或部件...',
            unicode: '输入Unicode码位 (如: 4E00)...',
            pinyin: '输入拼音 (如: zhong)...',
            stroke: '输入笔画编码或笔画数...',
          }[searchType]"
        />
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 50px">字</th>
            <th style="width: 80px">Unicode</th>
            <th style="width: 100px">拼音</th>
            <th style="width: 80px">笔画</th>
            <th>结构式</th>
            <th>拆分</th>
            <th style="width: 80px">字频</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="char in pagedChars" :key="char" @click="selectChar(char)" class="clickable-row">
            <td class="char-cell">{{ char }}</td>
            <td class="mono">{{ getCharInfo(char).unicode }}</td>
            <td>{{ getCharInfo(char).pinyin || '-' }}</td>
            <td>{{ getCharInfo(char).strokeCount || '-' }}</td>
            <td class="mono ids-cell">{{ getCharInfo(char).ids }}</td>
            <td class="split-cell">
              <span 
                v-for="(root, idx) in getCharInfo(char).split" 
                :key="idx"
                :class="getRootFontClass(root)"
              >{{ displayRoot(root) }}</span>
            </td>
            <td>{{ getCharInfo(char).freq ? getCharInfo(char).freq.toLocaleString() : '-' }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 空状态 -->
      <div v-if="pagedChars.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>未找到匹配的汉字</p>
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
.data-page {
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

.count {
  font-size: 13px;
  color: var(--text2);
  background: var(--bg3);
  padding: 4px 10px;
  border-radius: 4px;
}

.filter-info {
  font-size: 13px;
  color: var(--primary);
  background: var(--primary-bg);
  padding: 4px 10px;
  border-radius: 4px;
}

.search-panel {
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 16px;
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-type {
  width: 100px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
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

.mono {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
}

.ids-cell {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
  color: var(--text2);
}

.split-cell {
  font-size: 13px;
  letter-spacing: 1px;
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