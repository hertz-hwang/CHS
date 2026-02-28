<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { unicodeHex } from '../../engine/unicode'

const { engine, toast, rootsVersion, configVersion, selectChar } = useEngine()

// 搜索和分页
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = 50

// 获取字根的完整编码字符串
function getRootFullCode(root: string): string {
  const rootCode = engine.rootCodes.get(root)
  if (!rootCode) return ''
  return (rootCode.main || '') + (rootCode.sub || '') + (rootCode.supplement || '')
}

// 根据用户定义的规则计算编码
function calculateCharCode(char: string): string {
  // 触发 configVersion 依赖，确保规则变更时重新计算
  configVersion.value
  
  const rules = engine.getCodeRules()
  
  // 如果没有规则或只有开始/结束节点（空配置），返回空
  if (rules.length < 2) return ''
  
  // 检查是否只有开始和结束节点（空配置）
  const hasActualRules = rules.some(r => r.type !== 'start' && r.type !== 'end')
  if (!hasActualRules) return ''
  
  const decomp = engine.decompose(char)
  const roots = decomp.leaves
  
  if (!roots.length) return ''
  
  let code = ''
  let currentNodeId = 'start'
  const visited = new Set<string>()
  const maxIterations = 100 // 防止无限循环
  
  while (currentNodeId !== 'end' && !visited.has(currentNodeId) && visited.size < maxIterations) {
    visited.add(currentNodeId)
    
    const node = rules.find(r => r.id === currentNodeId)
    if (!node) break
    
    if (node.type === 'start') {
      // 开始节点：跳转到下一个非开始节点
      const startIdx = rules.findIndex(r => r.id === 'start')
      if (startIdx >= 0 && startIdx < rules.length - 1) {
        currentNodeId = rules[startIdx + 1].id
      } else {
        break
      }
    } else if (node.type === 'pick') {
      // 取码节点
      const rootIdx = node.rootIndex || 1
      const codeIdx = node.codeIndex || 1
      
      // 计算实际字根索引（-1 表示末根）
      const actualRootIdx = rootIdx === -1 ? roots.length - 1 : rootIdx - 1
      
      if (actualRootIdx >= 0 && actualRootIdx < roots.length) {
        const root = roots[actualRootIdx]
        const fullCode = getRootFullCode(root)
        
        if (fullCode) {
          // 计算实际码位索引（-1 表示末码）
          const actualCodeIdx = codeIdx === -1 ? fullCode.length - 1 : codeIdx - 1
          
          if (actualCodeIdx >= 0 && actualCodeIdx < fullCode.length) {
            code += fullCode[actualCodeIdx]
          }
        }
      }
      
      // 跳转到下一节点
      if (node.nextNode) {
        currentNodeId = node.nextNode
      } else {
        // 找当前节点的下一个节点
        const currentIdx = rules.findIndex(r => r.id === node.id)
        if (currentIdx >= 0 && currentIdx < rules.length - 1) {
          currentNodeId = rules[currentIdx + 1].id
        } else {
          break
        }
      }
    } else if (node.type === 'condition') {
      // 条件判断节点
      let conditionMet = false
      
      if (node.conditionType === 'root_exists') {
        // 判断第N个根是否存在
        const idx = (node.conditionValue || 1) - 1
        conditionMet = idx >= 0 && idx < roots.length
      } else if (node.conditionType === 'root_has_code') {
        // 判断第N个根是否有第M码
        const rootIdx = (node.conditionValue || 1) - 1
        const codeIdx = (node.conditionCodeIndex || 1) - 1
        
        if (rootIdx >= 0 && rootIdx < roots.length) {
          const root = roots[rootIdx]
          const fullCode = getRootFullCode(root)
          conditionMet = codeIdx >= 0 && codeIdx < fullCode.length
        }
      } else if (node.conditionType === 'root_count') {
        // 判断字根数量是否 >= N
        conditionMet = roots.length >= (node.conditionValue || 1)
      }
      
      // 根据条件结果跳转
      if (conditionMet && node.trueBranch) {
        currentNodeId = node.trueBranch
      } else if (!conditionMet && node.falseBranch) {
        currentNodeId = node.falseBranch
      } else {
        // 没有配置分支，跳到下一个节点
        const currentIdx = rules.findIndex(r => r.id === node.id)
        if (currentIdx >= 0 && currentIdx < rules.length - 1) {
          currentNodeId = rules[currentIdx + 1].id
        } else {
          break
        }
      }
    } else if (node.type === 'end') {
      break
    } else {
      break
    }
  }
  
  return code
}

// 获取所有汉字并按字频降序排序
const sortedChars = computed(() => {
  rootsVersion.value
  const chars = engine.getCharset()
  
  // 按字频降序排序
  return [...chars].sort((a, b) => {
    const freqA = engine.freq.get(a) || 0
    const freqB = engine.freq.get(b) || 0
    return freqB - freqA
  })
})

// 搜索过滤
const filteredChars = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return sortedChars.value

  return sortedChars.value.filter(char => {
    const code = calculateCharCode(char)
    return char.includes(searchQuery.value) || code.toLowerCase().includes(query)
  })
})

// 分页
const totalPages = computed(() => Math.ceil(filteredChars.value.length / pageSize))
const pagedChars = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredChars.value.slice(start, start + pageSize)
})

// 获取字的完整信息
function getCharInfo(char: string) {
  const decomp = engine.decompose(char)
  const code = calculateCharCode(char)
  const pyList = engine.getPinyinList(char)
  const freq = engine.freq.get(char) || 0
  
  // 按降频显示所有拼音
  const allPinyin = pyList.map(p => p.py).join(' ')
  
  return {
    char,
    unicode: unicodeHex(char),
    pinyin: allPinyin,
    split: decomp.leaves.join(' '),
    code,
    codeLength: code.length,
    freq,
    freqRank: freq > 0 ? getFreqRank(freq) : '-',
  }
}

// 获取字频排名
function getFreqRank(freq: number): string {
  if (freq >= 10000) return '高频'
  if (freq >= 1000) return '常用'
  if (freq >= 100) return '次常用'
  if (freq >= 10) return '低频'
  return '生僻'
}

// 统计
const statsInfo = computed(() => {
  let encoded = 0
  let total = 0
  
  for (const char of sortedChars.value) {
    total++
    if (calculateCharCode(char)) encoded++
  }
  
  return {
    total,
    encoded,
    rate: total > 0 ? (encoded / total * 100).toFixed(1) : '0'
  }
})

// 重置页码
watch(searchQuery, () => {
  currentPage.value = 1
})

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}
</script>

<template>
  <div class="code-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">🔢 汉字编码</span>
        <span class="count">{{ statsInfo.total }} 字</span>
        <span class="encoded-info">已编码: {{ statsInfo.encoded }} ({{ statsInfo.rate }}%)</span>
      </div>
      <div class="toolbar-right">
        <span class="hint">按字频降序排列</span>
      </div>
    </div>

    <!-- 搜索区域 -->
    <div class="search-panel">
      <input 
        v-model="searchQuery" 
        type="search" 
        class="search-input"
        placeholder="搜索汉字或编码..."
      />
    </div>

    <!-- 编码结果表格 -->
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 50px">字</th>
            <th style="width: 80px">Unicode</th>
            <th style="width: 80px">拼音</th>
            <th>拆分</th>
            <th style="width: 120px">编码</th>
            <th style="width: 60px">码长</th>
            <th style="width: 80px">字频</th>
            <th style="width: 70px">等级</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="char in pagedChars" :key="char" @click="selectChar(char)" class="clickable-row">
            <td class="char-cell">{{ char }}</td>
            <td class="mono">{{ getCharInfo(char).unicode }}</td>
            <td>{{ getCharInfo(char).pinyin || '-' }}</td>
            <td class="split-cell">{{ getCharInfo(char).split }}</td>
            <td class="code-cell">
              <span v-if="getCharInfo(char).code" class="char-code">
                {{ getCharInfo(char).code }}
              </span>
              <span v-else class="no-code">-</span>
            </td>
            <td>{{ getCharInfo(char).codeLength || '-' }}</td>
            <td class="freq-cell">{{ getCharInfo(char).freq.toLocaleString() }}</td>
            <td>
              <span class="freq-rank" :class="'rank-' + getCharInfo(char).freqRank">
                {{ getCharInfo(char).freqRank }}
              </span>
            </td>
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
.code-page {
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

.encoded-info {
  font-size: 13px;
  color: var(--success);
  background: rgba(0, 180, 42, 0.15);
  padding: 4px 10px;
  border-radius: 4px;
}

.hint {
  font-size: 12px;
  color: var(--text3);
}

.search-panel {
  padding: 16px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.search-input {
  width: 100%;
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

.split-cell {
  letter-spacing: 1px;
}

.code-cell {
  font-family: monospace;
  font-size: 13px;
}

.char-code {
  color: var(--primary);
  font-weight: 500;
  background: var(--primary-bg);
  padding: 2px 6px;
  border-radius: 4px;
}

.no-code {
  color: var(--text3);
}

.freq-cell {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 12px;
  text-align: right;
  color: var(--text2);
}

.freq-rank {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.freq-rank.rank-高频 {
  background: rgba(245, 63, 63, 0.15);
  color: var(--danger);
}

.freq-rank.rank-常用 {
  background: rgba(255, 125, 0, 0.15);
  color: var(--warning);
}

.freq-rank.rank-次常用 {
  background: rgba(0, 180, 42, 0.15);
  color: var(--success);
}

.freq-rank.rank-低频 {
  background: var(--primary-bg);
  color: var(--primary);
}

.freq-rank.rank-生僻 {
  background: var(--bg3);
  color: var(--text3);
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