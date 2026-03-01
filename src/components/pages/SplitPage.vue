<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { unicodeHex } from '../../engine/unicode'

const { engine, rootsVersion, toast, charsetVersion, getCurrentCharset } = useEngine()

// 搜索相关
const searchQuery = ref('')
const searchType = ref<'char' | 'unicode' | 'pinyin'>('char')
const currentPage = ref(1)
const pageSize = 30

// 展开状态
const expandedChars = ref<Set<string>>(new Set())

// 获取所有汉字，按字频降序排序（根据当前选择的字集）
const allChars = computed(() => {
  rootsVersion.value
  charsetVersion.value // 依赖字集版本，当字集切换时重新计算
  const chars = getCurrentCharset()
  return [...chars].sort((a, b) => {
    const freqA = engine.freq.get(a) || 0
    const freqB = engine.freq.get(b) || 0
    return freqB - freqA
  })
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
        return hex.includes(query.toLowerCase())
      case 'pinyin':
        const py = engine.pinyin.get(char)?.toLowerCase() || ''
        return py.includes(query.toLowerCase())
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

// 获取字的拆分信息
function getSplitInfo(char: string) {
  const decomp = engine.decompose(char)
  const pyList = engine.getPinyinList(char)
  const freq = engine.freq.get(char)
  
  // 判断是否完全拆分
  const allRoots = decomp.leaves.every(leaf => engine.roots.has(leaf))
  
  return {
    char,
    unicode: unicodeHex(char),
    pinyin: pyList[0]?.py || '',
    ids: decomp.ids,
    split: decomp.leaves,
    strokeCount: engine.strokeCount(char),
    freq: freq || 0,
    complete: allRoots,
    rootsCount: decomp.leaves.length,
  }
}

// 获取字根编码（考虑等效字根）
function getRootCodes(split: string[]) {
  return split.map(root => {
    // 先尝试直接获取编码
    let code = engine.rootCodes.get(root)
    let hasCode = !!code
    let isEquiv = false
    let mainRoot: string | undefined
    
    // 如果没有直接编码，检查是否是等效字根
    if (!code) {
      const effectiveCode = engine.getEffectiveRootCode(root)
      if (effectiveCode) {
        code = effectiveCode
        hasCode = true
        isEquiv = true
        mainRoot = engine.getMainRoot(root)
      }
    }
    
    return {
      root,
      code: code ? (code.main || '') + (code.sub || '') + (code.supplement || '') : '',
      hasCode,
      isEquiv,
      mainRoot
    }
  })
}

// 获取字的全息编码（首位大写）
function getCharCode(split: string[]) {
  const codes = getRootCodes(split)
  if (codes.every(c => c.hasCode)) {
    return codes.map(c => {
      if (c.code.length > 0) {
        return c.code[0].toUpperCase() + c.code.slice(1)
      }
      return c.code
    }).join('')
  }
  return ''
}

// 展开/折叠
function toggleExpand(char: string) {
  if (expandedChars.value.has(char)) {
    expandedChars.value.delete(char)
  } else {
    expandedChars.value.add(char)
  }
}

// 重置页码
watch(searchQuery, () => {
  currentPage.value = 1
  expandedChars.value.clear()
})

// 跳转页码
function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

// 统计信息
const stats = computed(() => {
  rootsVersion.value
  let complete = 0
  let incomplete = 0
  
  for (const char of allChars.value) {
    const info = getSplitInfo(char)
    if (info.complete) complete++
    else incomplete++
  }
  
  return {
    total: allChars.value.length,
    complete,
    incomplete,
    rate: allChars.value.length > 0 ? (complete / allChars.value.length * 100).toFixed(1) : '0'
  }
})

// 导出拆分表
function exportSplitTable() {
  rootsVersion.value // 确保数据最新
  
  const lines: string[] = []
  
  for (const char of allChars.value) {
    const info = getSplitInfo(char)
    const rootsStr = info.split.join(' ')
    lines.push(`${char}\t${rootsStr}`)
  }
  
  const content = lines.join('\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = 'chs_div.txt'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  
  toast(`已导出 ${lines.length} 条拆分记录`)
}
</script>

<template>
  <div class="split-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">🔧 汉字拆分</span>
        <span class="count">共 {{ allChars.length }} 字</span>
        <span class="complete-info">
          完整: {{ stats.complete }} ({{ stats.rate }}%)
        </span>
        <span class="incomplete-info">
          未完整: {{ stats.incomplete }}
        </span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm btn-primary" @click="exportSplitTable">
          📥 导出拆分表
        </button>
      </div>
    </div>

    <!-- 搜索区域 -->
    <div class="search-panel">
      <div class="search-row">
        <select v-model="searchType" class="search-type">
          <option value="char">汉字</option>
          <option value="unicode">Unicode</option>
          <option value="pinyin">拼音</option>
        </select>
        <input 
          v-model="searchQuery" 
          type="search" 
          class="search-input"
          :placeholder="{
            char: '输入汉字或部件...',
            unicode: '输入Unicode码位...',
            pinyin: '输入拼音...',
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
            <th>拆分</th>
            <th style="width: 120px">全息编码</th>
            <th style="width: 70px">状态</th>
            <th style="width: 40px"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="char in pagedChars" :key="char">
            <tr @click="toggleExpand(char)" class="main-row">
              <td class="char-cell">{{ char }}</td>
              <td class="split-cell">
                <span 
                  v-for="(root, i) in getSplitInfo(char).split" 
                  :key="i"
                  class="root-tag"
                  :class="{ 
                    'root-missing': !engine.roots.has(root) && !engine.isEquivalentRoot(root),
                    'root-equiv': engine.isEquivalentRoot(root)
                  }"
                  :title="engine.isEquivalentRoot(root) ? `等效字根，主字根: ${engine.getMainRoot(root)}` : ''"
                >
                  {{ root }}
                </span>
              </td>
              <td class="code-cell">
                <span v-if="getCharCode(getSplitInfo(char).split)" class="char-code">
                  {{ getCharCode(getSplitInfo(char).split) }}
                </span>
                <span v-else class="no-code">-</span>
              </td>
              <td>
                <span class="status-tag" :class="getSplitInfo(char).complete ? 'status-complete' : 'status-incomplete'">
                  {{ getSplitInfo(char).complete ? '完整' : '缺失' }}
                </span>
              </td>
              <td class="expand-cell">
                <span class="expand-icon" :class="{ 'expanded': expandedChars.has(char) }">
                  ›
                </span>
              </td>
            </tr>
            <!-- 展开详情 -->
            <tr v-if="expandedChars.has(char)" class="detail-row">
              <td colspan="5">
                <div class="detail-content">
                  <div class="detail-section">
                    <h4>字根编码</h4>
                    <div class="root-codes">
                      <div 
                        v-for="(item, i) in getRootCodes(getSplitInfo(char).split)" 
                        :key="i"
                        class="root-code-item"
                        :class="{ 'missing': !item.hasCode, 'equiv': item.isEquiv }"
                        :title="item.isEquiv ? `等效字根，主字根: ${item.mainRoot}` : ''"
                      >
                        <span class="root">{{ item.root }}</span>
                        <span class="arrow">→</span>
                        <span class="code">{{ item.code || '?' }}</span>
                        <span v-if="item.isEquiv" class="equiv-badge">≡</span>
                      </div>
                    </div>
                  </div>
                  <div class="detail-section">
                    <h4>结构树</h4>
                    <div class="tree-view">
                      <pre>{{ getSplitInfo(char).ids }}</pre>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
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
.split-page {
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

.complete-info {
  font-size: 13px;
  color: var(--success);
  background: rgba(0, 180, 42, 0.15);
  padding: 4px 10px;
  border-radius: 4px;
}

.incomplete-info {
  font-size: 13px;
  color: var(--warning);
  background: rgba(255, 125, 0, 0.15);
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

.main-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.main-row:hover {
  background: var(--bg3);
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
  color: var(--text2);
}

.split-cell {
  vertical-align: middle;
}

.split-cell .root-tag {
  display: inline-block;
  vertical-align: middle;
  margin: 2px;
}

.root-tag {
  display: inline-block;
  padding: 1px 4px;
  background: var(--primary-bg);
  color: var(--primary);
  border-radius: 3px;
  font-size: 12px;
}

.root-missing {
  background: rgba(255, 125, 0, 0.15);
  color: var(--warning);
}

.root-equiv {
  background: rgba(19, 194, 194, 0.15);
  color: #13c2c2;
}

.code-cell {
  font-family: monospace;
  font-size: 12px;
}

.char-code {
  color: var(--primary);
  font-weight: 500;
}

.no-code {
  color: var(--text3);
}

.status-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.status-complete {
  background: rgba(0, 180, 42, 0.15);
  color: var(--success);
}

.status-incomplete {
  background: rgba(255, 125, 0, 0.15);
  color: var(--warning);
}

.expand-cell {
  text-align: center;
}

.expand-icon {
  display: inline-block;
  transition: transform 0.2s ease;
  font-size: 14px;
  color: var(--text3);
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.detail-row {
  background: var(--bg3);
}

.detail-row td {
  padding: 0;
}

.detail-content {
  padding: 16px 20px;
  display: flex;
  gap: 24px;
}

.detail-section {
  flex: 1;
}

.detail-section h4 {
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 8px;
  font-weight: 500;
}

.root-codes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.root-code-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--bg2);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.root-code-item.missing {
  border-color: var(--warning);
  background: rgba(255, 125, 0, 0.1);
}

.root-code-item.equiv {
  border-color: #13c2c2;
  background: rgba(19, 194, 194, 0.1);
}

.equiv-badge {
  font-size: 10px;
  color: #13c2c2;
  margin-left: 2px;
}

.root-code-item .root {
  font-size: 16px;
}

.root-code-item .arrow {
  color: var(--text3);
}

.root-code-item .code {
  font-family: monospace;
  color: var(--primary);
  font-weight: 500;
}

.tree-view pre {
  margin: 0;
  padding: 12px;
  background: var(--bg2);
  border-radius: 6px;
  font-size: 12px;
  overflow-x: auto;
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