<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { unicodeHex } from '../../engine/unicode'

const { engine, toast, rootsVersion, configVersion, selectChar } = useEngine()

// 导出功能
function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 搜索、筛选和分页
const searchQuery = ref('')
const statusFilter = ref<'all' | '完整' | '缺失'>('all')
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

// 搜索和状态过滤
const filteredChars = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const status = statusFilter.value
  
  return sortedChars.value.filter(char => {
    // 状态筛选
    if (status !== 'all') {
      const charStatus = getCodeStatus(char)
      if (charStatus !== status) return false
    }
    
    // 搜索筛选
    if (query) {
      const code = calculateCharCode(char)
      if (!char.includes(searchQuery.value) && !code.toLowerCase().includes(query)) {
        return false
      }
    }
    
    return true
  })
})

// 分页
const totalPages = computed(() => Math.ceil(filteredChars.value.length / pageSize))
const pagedChars = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredChars.value.slice(start, start + pageSize)
})

// 检查编码状态：是否有字根缺失编码
function getCodeStatus(char: string): '完整' | '缺失' {
  const decomp = engine.decompose(char)
  const roots = decomp.leaves
  
  // 如果没有字根，无法判断，返回缺失
  if (!roots.length) return '缺失'
  
  // 检查每个字根是否有编码
  for (const root of roots) {
    const fullCode = getRootFullCode(root)
    if (!fullCode) {
      return '缺失'
    }
  }
  
  // 所有字根都有编码，检查最终编码是否生成
  const code = calculateCharCode(char)
  if (!code) return '缺失'
  
  return '完整'
}

// 获取字的完整信息
function getCharInfo(char: string) {
  const decomp = engine.decompose(char)
  const code = calculateCharCode(char)
  const pyList = engine.getPinyinList(char)
  const freq = engine.freq.get(char) || 0
  
  // 按降频显示所有拼音
  const allPinyin = pyList.map(p => p.py).join(' ')
  
  // 获取每个部件及其编码状态
  const roots = decomp.leaves
  const rootInfos = roots.map(root => ({
    root,
    hasCode: !!getRootFullCode(root)
  }))
  
  return {
    char,
    unicode: unicodeHex(char),
    pinyin: allPinyin,
    roots: rootInfos,
    code,
    codeLength: code.length,
    freq,
    status: getCodeStatus(char),
  }
}

// 统计
const statsInfo = computed(() => {
  let encoded = 0
  let total = 0
  let encodedWeight = 0  // 已编码字的字频总和
  let totalWeight = 0    // 所有字的字频总和
  
  for (const char of sortedChars.value) {
    total++
    const freq = engine.freq.get(char) || 0
    totalWeight += freq
    
    if (getCodeStatus(char) === '完整') {
      encoded++
      encodedWeight += freq
    }
  }
  
  return {
    total,
    encoded,
    rate: totalWeight > 0 ? (encodedWeight / totalWeight * 100).toFixed(1) : '0'
  }
})

// 重置页码
watch([searchQuery, statusFilter], () => {
  currentPage.value = 1
})

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

// 计算元素序列（跟踪每个码对应的元素）
function calculateElementSequence(char: string): string[] {
  // 触发 configVersion 依赖，确保规则变更时重新计算
  configVersion.value
  
  const rules = engine.getCodeRules()
  
  // 如果没有规则或只有开始/结束节点（空配置），返回空
  if (rules.length < 2) return []
  
  // 检查是否只有开始和结束节点（空配置）
  const hasActualRules = rules.some(r => r.type !== 'start' && r.type !== 'end')
  if (!hasActualRules) return []
  
  const decomp = engine.decompose(char)
  const roots = decomp.leaves
  
  if (!roots.length) return []
  
  const elements: string[] = []
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
            // 记录元素：第1码直接记录字根名，其他码记录为"字根名.索引"
            if (actualCodeIdx === 0) {
              elements.push(root)
            } else {
              elements.push(`${root}.${actualCodeIdx}`)
            }
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
  
  return elements
}

// 导出元素序列
function exportElementSequence() {
  const chars = sortedChars.value
  const lines: string[] = []
  
  for (const char of chars) {
    const elements = calculateElementSequence(char)
    if (elements.length > 0) {
      lines.push(`${char}\t${elements.join(' ')}`)
    }
  }
  
  if (lines.length === 0) {
    toast.show('没有可导出的数据', 'warning')
    return
  }
  
  const content = lines.join('\n')
  downloadFile(content, 'input-division.txt')
  toast.show(`已导出 ${lines.length} 条元素序列`, 'success')
}

// 导出码表
function exportCodeTable() {
  const chars = sortedChars.value
  const lines: string[] = []
  
  for (const char of chars) {
    const code = calculateCharCode(char)
    if (code) {
      const freq = engine.freq.get(char) || 0
      lines.push(`${char}\t${code}\t${freq}`)
    }
  }
  
  if (lines.length === 0) {
    toast.show('没有可导出的数据', 'warning')
    return
  }
  
  const content = lines.join('\n')
  downloadFile(content, 'code.txt')
  toast.show(`已导出 ${lines.length} 条编码`, 'success')
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
        <button class="btn btn-sm btn-primary" @click="exportElementSequence" title="导出元素序列，可用于码灵优化器（Code Genie）优化布局。">
          📄 导出元素序列
        </button>
        <button class="btn btn-sm btn-primary" @click="exportCodeTable" title="导出码表，可作为 Rime 等输入法码表使用。">
          📊 导出码表
        </button>
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
      <div class="filter-group">
        <span class="filter-label">状态筛选:</span>
        <button 
          class="filter-btn" 
          :class="{ active: statusFilter === 'all' }"
          @click="statusFilter = 'all'"
        >
          全部
        </button>
        <button 
          class="filter-btn filter-complete" 
          :class="{ active: statusFilter === '完整' }"
          @click="statusFilter = '完整'"
        >
          完整
        </button>
        <button 
          class="filter-btn filter-missing" 
          :class="{ active: statusFilter === '缺失' }"
          @click="statusFilter = '缺失'"
        >
          缺失
        </button>
      </div>
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
            <th style="width: 70px">状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="char in pagedChars" :key="char" @click="selectChar(char)" class="clickable-row">
            <td class="char-cell">{{ char }}</td>
            <td class="mono">{{ getCharInfo(char).unicode }}</td>
            <td>{{ getCharInfo(char).pinyin || '-' }}</td>
            <td class="split-cell">
              <span 
                v-for="(rootInfo, idx) in getCharInfo(char).roots" 
                :key="idx"
                class="root-part"
                :class="rootInfo.hasCode ? 'root-has-code' : 'root-no-code'"
              >{{ rootInfo.root }}</span>
            </td>
            <td class="code-cell">
              <span v-if="getCharInfo(char).code" class="char-code">
                {{ getCharInfo(char).code }}
              </span>
              <span v-else class="no-code">-</span>
            </td>
            <td>{{ getCharInfo(char).codeLength || '-' }}</td>
            <td class="freq-cell">{{ getCharInfo(char).freq.toLocaleString() }}</td>
            <td>
              <span class="status-badge" :class="getCharInfo(char).status === '完整' ? 'status-complete' : 'status-missing'">
                {{ getCharInfo(char).status }}
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-panel {
  padding: 16px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-input {
  width: 100%;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 13px;
  color: var(--text2);
  margin-right: 4px;
}

.filter-btn {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  background: var(--bg1);
  border-color: var(--primary);
}

.filter-btn.active {
  background: var(--primary-bg);
  color: var(--primary);
  border-color: var(--primary);
}

.filter-btn.filter-complete.active {
  background: rgba(0, 180, 42, 0.15);
  color: var(--success);
  border-color: var(--success);
}

.filter-btn.filter-missing.active {
  background: rgba(245, 63, 63, 0.15);
  color: var(--danger);
  border-color: var(--danger);
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

.root-part {
  margin-right: 2px;
  padding: 1px 2px;
  border-radius: 2px;
}

.root-part.root-has-code {
  color: var(--success);
  background: rgba(0, 180, 42, 0.1);
}

.root-part.root-no-code {
  color: var(--danger);
  background: rgba(245, 63, 63, 0.1);
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

.status-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.status-badge.status-complete {
  background: rgba(0, 180, 42, 0.15);
  color: var(--success);
}

.status-badge.status-missing {
  background: rgba(245, 63, 63, 0.15);
  color: var(--danger);
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