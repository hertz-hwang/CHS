<script setup lang="ts">
import { ref, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import KeyboardHeatmap from '../shared/KeyboardHeatmap.vue'
import {
  evaluateScheme,
  parseCodeTable,
  loadEquivalenceData,
  zipLines,
  getColumnValue,
  getWeightedValue,
  calcFingerBalance,
  type EvaluationResult,
  type EvaluateLine,
  type EvaluateHanziItem,
} from '../../utils/evaluate'

const {
  engine, rootsVersion, configVersion, charsetVersion, toast,
} = useEngine()

// 测评结果
const evaluationResult = ref<EvaluationResult | null>(null)
const isEvaluating = ref(false)
const activeTab = ref<'single' | 'upload'>('single')

// 上传码表相关
const uploadedCodeMap = ref<Map<string, string> | null>(null)
const uploadedFileName = ref('')
const uploadedResult = ref<EvaluationResult | null>(null)

// 测评配置
const selectKeys = ref('1234')
const maxCodeLength = ref(4)

// 默认字频数据（kc6000.txt）
const defaultFreqMap = ref<Map<string, number> | null>(null)

// 加载默认字频数据
async function loadDefaultFreq() {
  if (defaultFreqMap.value) return defaultFreqMap.value
  
  try {
    const res = await fetch('/data/kc6000.txt')
    if (!res.ok) throw new Error('加载字频数据失败')
    
    const text = await res.text()
    const freqMap = new Map<string, number>()
    const lines = text.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      
      const parts = trimmed.split('\t')
      if (parts.length >= 2) {
        const char = parts[0]
        const freq = parseInt(parts[1], 10)
        if (char.length === 1 && freq > 0) {
          freqMap.set(char, freq)
        }
      }
    }
    
    defaultFreqMap.value = freqMap
    console.log(`已加载默认字频数据：${freqMap.size} 字`)
    return freqMap
  } catch (e) {
    console.error('加载字频数据失败:', e)
    toast('加载字频数据失败')
    return null
  }
}

// 获取字根的完整编码字符串
function getRootFullCode(root: string): string {
  const rootCode = engine.rootCodes.get(root)
  if (rootCode) {
    return (rootCode.main || '') + (rootCode.sub || '') + (rootCode.supplement || '')
  }
  const effectiveCode = engine.getEffectiveRootCode(root)
  if (effectiveCode) {
    return (effectiveCode.main || '') + (effectiveCode.sub || '') + (effectiveCode.supplement || '')
  }
  return ''
}

// 检查字是否有缺失（与编码页面逻辑一致）
function isCharMissing(char: string): boolean {
  const decomp = engine.decompose(char)
  const roots = decomp.leaves
  
  if (!roots.length) return true
  
  for (const root of roots) {
    const fullCode = getRootFullCode(root)
    if (!fullCode) return true
  }
  
  const code = calculateCharCode(char)
  if (!code) return true
  
  return false
}

// 根据用户定义的规则计算编码
function calculateCharCode(char: string): string {
  configVersion.value
  const rules = engine.getCodeRules()
  if (rules.length < 2) return ''
  
  const hasActualRules = rules.some(r => r.type !== 'start' && r.type !== 'end')
  if (!hasActualRules) return ''
  
  const decomp = engine.decompose(char)
  const roots = decomp.leaves
  if (!roots.length) return ''
  
  let code = ''
  let currentNodeId = 'start'
  const visited = new Set<string>()
  const maxIterations = 100
  
  while (currentNodeId !== 'end' && !visited.has(currentNodeId) && visited.size < maxIterations) {
    visited.add(currentNodeId)
    const node = rules.find(r => r.id === currentNodeId)
    if (!node) break
    
    if (node.type === 'start') {
      if (node.nextNode) currentNodeId = node.nextNode
      else break
    } else if (node.type === 'pick') {
      const rootIdx = node.rootIndex || 1
      const codeIdx = node.codeIndex || 1
      const actualRootIdx = rootIdx === -1 ? roots.length - 1 : rootIdx - 1
      
      if (actualRootIdx >= 0 && actualRootIdx < roots.length) {
        const root = roots[actualRootIdx]
        const fullCode = getRootFullCode(root)
        if (fullCode) {
          const actualCodeIdx = codeIdx === -1 ? fullCode.length - 1 : codeIdx - 1
          if (actualCodeIdx >= 0 && actualCodeIdx < fullCode.length) {
            code += fullCode[actualCodeIdx]
          }
        }
      }
      
      if (node.nextNode) currentNodeId = node.nextNode
      else break
    } else if (node.type === 'condition') {
      let conditionMet = false
      
      if (node.conditionType === 'root_exists') {
        const idx = (node.conditionValue || 1) - 1
        conditionMet = idx >= 0 && idx < roots.length
      } else if (node.conditionType === 'root_has_code') {
        const rootIdx = (node.conditionValue || 1) - 1
        const codeIdx = (node.conditionCodeIndex || 1) - 1
        if (rootIdx >= 0 && rootIdx < roots.length) {
          const root = roots[rootIdx]
          const fullCode = getRootFullCode(root)
          conditionMet = codeIdx >= 0 && codeIdx < fullCode.length
        }
      } else if (node.conditionType === 'root_count') {
        conditionMet = roots.length >= (node.conditionValue || 1)
      }
      
      if (conditionMet && node.trueBranch) currentNodeId = node.trueBranch
      else if (!conditionMet && node.falseBranch) currentNodeId = node.falseBranch
      else break
    } else if (node.type === 'end') {
      break
    } else {
      break
    }
  }
  
  return code
}

// 执行当前编码方案的测评
async function runEvaluation() {
  isEvaluating.value = true
  
  try {
    await loadEquivalenceData()
    
    const freqMap = await loadDefaultFreq()
    if (!freqMap) {
      toast('无法加载字频数据')
      return
    }
    
    const codeMap = new Map<string, string>()
    const missingSet = new Set<string>()
    
    for (const [char] of freqMap) {
      if (isCharMissing(char)) {
        missingSet.add(char)
      } else {
        const code = calculateCharCode(char)
        if (code) codeMap.set(char, code)
      }
    }
    
    const result = evaluateScheme(codeMap, freqMap, selectKeys.value, maxCodeLength.value, missingSet)
    evaluationResult.value = result
    
    toast(`测评完成：共 ${freqMap.size} 字`)
  } catch (e) {
    console.error('测评失败:', e)
    toast('测评失败: ' + (e as Error).message)
  } finally {
    isEvaluating.value = false
  }
}

// 处理码表上传
function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  uploadedFileName.value = file.name
  
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string
      const codeMap = parseCodeTable(content, file.name)
      uploadedCodeMap.value = codeMap
      toast(`已加载 ${codeMap.size} 个编码`)
    } catch (err) {
      toast('解析码表失败')
      console.error(err)
    }
  }
  reader.readAsText(file)
}

// 执行上传码表的测评
async function runUploadedEvaluation() {
  if (!uploadedCodeMap.value) {
    toast('请先上传码表')
    return
  }
  
  isEvaluating.value = true
  
  try {
    await loadEquivalenceData()
    
    const freqMap = await loadDefaultFreq()
    if (!freqMap) {
      toast('无法加载字频数据')
      return
    }
    
    const result = evaluateScheme(uploadedCodeMap.value, freqMap, selectKeys.value, maxCodeLength.value)
    uploadedResult.value = result
    
    toast(`测评完成：共 ${freqMap.size} 字`)
  } catch (e) {
    console.error('测评失败:', e)
    toast('测评失败: ' + (e as Error).message)
  } finally {
    isEvaluating.value = false
  }
}

// 清除上传的码表
function clearUploaded() {
  uploadedCodeMap.value = null
  uploadedFileName.value = ''
  uploadedResult.value = null
}

// 格式化数字
function fmt(n: number, decimals: number = 2): string {
  return n.toFixed(decimals)
}

// 计算加权比重
function getWeightPercent(line: EvaluateLine, column: string): string {
  const { weight } = getColumnValue(line, column)
  return line.totalFreq > 0 ? fmt(weight / line.totalFreq * 100, 4) : '0.0000'
}

// 获取手感指标的加权值
function getComboWeightPercent(line: EvaluateLine, column: string): string {
  let totalCombo = 0
  let weightedValue = 0
  
  for (const item of line.items) {
    if (item.isLack || item.overKey > 0) continue
    const keysLen = item.code.length + item.selectKey.length
    const comboCount = keysLen < 2 ? 1 : keysLen - 1
    totalCombo += comboCount * item.freq
    
    switch (column) {
      case 'dh': weightedValue += item.dh * item.freq; break
      case 'ms': weightedValue += item.ms * item.freq; break
      case 'ss': weightedValue += item.ss * item.freq; break
      case 'pd': weightedValue += item.pd * item.freq; break
      case 'lfd': weightedValue += item.lfd * item.freq; break
    }
  }
  
  return totalCombo > 0 ? fmt(weightedValue / totalCombo * 100, 4) : '0.0000'
}

// 获取缺字标记的加权比重
function getLackWeightPercent(line: EvaluateLine): string {
  let lackWeight = 0
  for (const item of line.items) {
    if (item.isLack) lackWeight += item.freq
  }
  return line.totalFreq > 0 ? fmt(lackWeight / line.totalFreq * 100, 4) : '0.0000'
}

// 获取小计行
function getSubtotal(lines: EvaluateLine[]): EvaluateLine {
  return zipLines(lines)
}

// 详情弹窗相关
const showDetailModal = ref(false)
const detailTitle = ref('')
const detailItems = ref<EvaluateHanziItem[]>([])

// 列名映射
const COLUMN_NAMES: Record<string, string> = {
  cd1: '1码', cd2: '2码', cd3: '3码', cd4: '4码', cd5: '5码',
  select: '选重', brief2: '理论二简', lack: '缺字标记',
  dh: '左右互击', ms: '同指大跨排', ss: '同指小跨排',
  pd: '小指干扰', lfd: '错手', trible: '三连击', overKey: '超标键位'
}

// 可点击的列
const CLICKABLE_COLUMNS = ['cd1', 'cd2', 'cd3', 'cd4', 'cd5', 'select', 'brief2', 'lack', 'dh', 'ms', 'ss', 'pd', 'lfd', 'trible', 'overKey']

// 过滤符合条件的汉字
function filterItemsByColumn(line: EvaluateLine, column: string): EvaluateHanziItem[] {
  const items: EvaluateHanziItem[] = []
  
  for (const item of line.items) {
    let match = false
    
    switch (column) {
      case 'cd1': match = item.codeLen === 1 && !item.isLack; break
      case 'cd2': match = item.codeLen === 2 && !item.isLack; break
      case 'cd3': match = item.codeLen === 3 && !item.isLack; break
      case 'cd4': match = item.codeLen === 4 && !item.isLack; break
      case 'cd5': match = item.codeLen >= 5 && !item.isLack; break
      case 'select': match = item.collision > 1 && !item.isLack; break
      case 'brief2': match = item.brief2 && !item.isLack; break
      case 'lack': match = item.isLack; break
      case 'dh': match = item.dh > 0 && !item.isLack && item.overKey === 0; break
      case 'ms': match = item.ms > 0 && !item.isLack && item.overKey === 0; break
      case 'ss': match = item.ss > 0 && !item.isLack && item.overKey === 0; break
      case 'pd': match = item.pd > 0 && !item.isLack && item.overKey === 0; break
      case 'lfd': match = item.lfd > 0 && !item.isLack && item.overKey === 0; break
      case 'trible': match = item.trible > 0 && !item.isLack && item.overKey === 0; break
      case 'overKey': match = item.overKey > 0 && !item.isLack; break
    }
    
    if (match) items.push(item)
  }
  
  return items.sort((a, b) => b.freq - a.freq)
}

// 点击单元格查看详情
function handleCellClick(line: EvaluateLine, column: string, rangeLabel: string) {
  if (!CLICKABLE_COLUMNS.includes(column)) return
  
  const { count } = getColumnValue(line, column)
  if (count === 0) return
  
  const items = filterItemsByColumn(line, column)
  if (items.length === 0) return
  
  detailTitle.value = `${rangeLabel} - ${COLUMN_NAMES[column] || column}（共 ${items.length} 字）`
  detailItems.value = items
  showDetailModal.value = true
}

// 关闭详情弹窗
function closeDetailModal() {
  showDetailModal.value = false
  detailItems.value = []
}

// 监听配置变化
watch([rootsVersion, configVersion, charsetVersion], () => {
  evaluationResult.value = null
})
</script>

<template>
  <div class="evaluate-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">📊 编码测评</span>
      </div>
      <div class="toolbar-right">
        <div class="config-group">
          <label>选重键:</label>
          <input v-model="selectKeys" type="text" class="config-input" placeholder="1234" />
        </div>
        <div class="config-group">
          <label>最大码长:</label>
          <input v-model.number="maxCodeLength" type="number" class="config-input" min="1" max="6" />
        </div>
      </div>
    </div>

    <!-- 标签页切换 -->
    <div class="tabs">
      <button class="tab-btn" :class="{ active: activeTab === 'single' }" @click="activeTab = 'single'">
        当前方案测评
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'upload' }" @click="activeTab = 'upload'">
        上传码表测评
      </button>
    </div>

    <!-- 当前方案测评 -->
    <div v-if="activeTab === 'single'" class="tab-content">
      <div class="action-bar">
        <button class="btn btn-primary" :disabled="isEvaluating" @click="runEvaluation">
          {{ isEvaluating ? '测评中...' : '开始测评' }}
        </button>
        <span class="hint">测评当前编码方案的性能指标</span>
      </div>

      <!-- 测评结果表格 -->
      <div v-if="evaluationResult" class="result-panel">
        <div class="table-container">
          <table class="eval-table">
            <thead>
              <tr>
                <th class="sticky-col">统计范围</th>
                <th>1码</th>
                <th>2码</th>
                <th>3码</th>
                <th>4码</th>
                <th>5码</th>
                <th class="col-select">选重</th>
                <th>理论二简</th>
                <th>加权键长</th>
                <th>字均当量</th>
                <th>键均当量</th>
                <th>用指平衡</th>
                <th>左右互击</th>
                <th>同指大跨</th>
                <th>同指小跨</th>
                <th>小指干扰</th>
                <th>错手</th>
                <th>三连击</th>
                <th>超标键位</th>
                <th>缺字标记</th>
              </tr>
            </thead>
            <tbody>
              <!-- 数据行 -->
              <template v-for="(line, idx) in evaluationResult.lines" :key="idx">
                <tr :class="{ 'row-highlight': idx < 3 }">
                  <td class="sticky-col">{{ line.start + 1 }}~{{ line.end }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd1', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd1').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd2', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd2').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd3', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd3').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd4', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd4').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd5', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd5').count }}</td>
                  <td class="col-select clickable" @click="handleCellClick(line, 'select', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'select').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'brief2', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'brief2').count }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'cl')) }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'ziEq')) }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'keyEq')) }}</td>
                  <td>{{ fmt(calcFingerBalance(line.usage), 4) }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'dh', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'dh').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'ms', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'ms').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'ss', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'ss').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'pd', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'pd').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'lfd', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'lfd').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'trible', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'trible').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'overKey', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'overKey').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'lack', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'lack').count }}</td>
                </tr>
                
                <!-- 小计行（在第3行后） -->
                <tr v-if="idx === 2" class="row-subtotal">
                  <td class="sticky-col">小计</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd1', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd1').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd2', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd2').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd3', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd3').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd4', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd4').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd5', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd5').count }}</td>
                  <td class="col-select clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'select', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'select').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'brief2', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'brief2').count }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cl')) }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ziEq')) }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'keyEq')) }}</td>
                  <td>{{ fmt(calcFingerBalance(getSubtotal(evaluationResult.lines.slice(0, 3)).usage), 4) }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'dh', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'dh').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ms', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ms').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ss', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ss').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'pd', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'pd').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lfd', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lfd').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'trible', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'trible').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'overKey', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'overKey').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lack', '小计')">{{ getColumnValue(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lack').count }}</td>
                </tr>
                
                <!-- 加权比重行（在小计行后） -->
                <tr v-if="idx === 2" class="row-weight">
                  <td class="sticky-col">加权比重</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd1') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd2') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd3') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd4') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'cd5') }}%</td>
                  <td class="col-select">{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'select') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'brief2') }}%</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'dh') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ms') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'ss') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'pd') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'lfd') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3)), 'trible') }}%</td>
                  <td>-</td>
                  <td>{{ getLackWeightPercent(getSubtotal(evaluationResult.lines.slice(0, 3))) }}%</td>
                </tr>
              </template>
              
              <!-- 总计行 -->
              <tr class="row-total">
                <td class="sticky-col">总计</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd1', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd1').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd2', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd2').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd3', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd3').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd4', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd4').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'cd5', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'cd5').count }}</td>
                <td class="col-select clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'select', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'select').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'brief2', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'brief2').count }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines), 'cl')) }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines), 'ziEq')) }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(evaluationResult.lines), 'keyEq')) }}</td>
                <td>{{ fmt(calcFingerBalance(getSubtotal(evaluationResult.lines).usage), 4) }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'dh', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'dh').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'ms', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'ms').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'ss', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'ss').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'pd', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'pd').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'lfd', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'lfd').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'trible', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'trible').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'overKey', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'overKey').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(evaluationResult.lines), 'lack', '总计')">{{ getColumnValue(getSubtotal(evaluationResult.lines), 'lack').count }}</td>
              </tr>
              
              <!-- 总加权比重行 -->
              <tr class="row-weight">
                <td class="sticky-col">加权比重</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd1') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd2') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd3') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd4') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'cd5') }}%</td>
                <td class="col-select">{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'select') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'brief2') }}%</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'dh') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'ms') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'ss') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'pd') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(evaluationResult.lines), 'lfd') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(evaluationResult.lines), 'trible') }}%</td>
                <td>-</td>
                <td>{{ getLackWeightPercent(getSubtotal(evaluationResult.lines)) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 键位热力图 -->
        <div class="heatmap-container">
          <h3 class="section-title">键位热力图（单位：%）</h3>
          <KeyboardHeatmap :usage="evaluationResult.usage" />
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">📊</div>
        <p>点击"开始测评"按钮，测评当前编码方案</p>
      </div>
    </div>

    <!-- 上传码表测评 -->
    <div v-if="activeTab === 'upload'" class="tab-content">
      <div class="upload-section">
        <div class="upload-area" @click="($refs.fileInput as HTMLInputElement).click()">
          <input ref="fileInput" type="file" accept=".txt,.mb,.code,.yaml,.yml" @change="handleFileUpload" style="display: none" />
          <div class="upload-icon">📁</div>
          <div class="upload-text">
            <template v-if="uploadedFileName">
              <p class="file-name">{{ uploadedFileName }}</p>
              <p class="file-info">已加载 {{ uploadedCodeMap?.size || 0 }} 个编码</p>
            </template>
            <template v-else>
              <p>点击或拖拽码表文件到此处</p>
              <p class="upload-hint">支持 .txt, .mb, .code, .yaml, .yml 格式</p>
            </template>
          </div>
        </div>

        <div class="action-bar">
          <button class="btn btn-primary" :disabled="isEvaluating || !uploadedCodeMap" @click="runUploadedEvaluation">
            {{ isEvaluating ? '测评中...' : '开始测评' }}
          </button>
          <button v-if="uploadedCodeMap" class="btn btn-secondary" @click="clearUploaded">
            清除码表
          </button>
        </div>
      </div>

      <!-- 上传码表测评结果 -->
      <div v-if="uploadedResult" class="result-panel">
        <div class="table-container">
          <table class="eval-table">
            <thead>
              <tr>
                <th class="sticky-col">统计范围</th>
                <th>1码</th>
                <th>2码</th>
                <th>3码</th>
                <th>4码</th>
                <th>5码</th>
                <th class="col-select">选重</th>
                <th>理论二简</th>
                <th>加权键长</th>
                <th>字均当量</th>
                <th>键均当量</th>
                <th>用指平衡</th>
                <th>左右互击</th>
                <th>同指大跨</th>
                <th>同指小跨</th>
                <th>小指干扰</th>
                <th>错手</th>
                <th>三连击</th>
                <th>超标键位</th>
                <th>缺字标记</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(line, idx) in uploadedResult.lines" :key="idx">
                <tr :class="{ 'row-highlight': idx < 3 }">
                  <td class="sticky-col">{{ line.start + 1 }}~{{ line.end }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd1', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd1').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd2', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd2').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd3', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd3').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd4', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd4').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'cd5', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'cd5').count }}</td>
                  <td class="col-select clickable" @click="handleCellClick(line, 'select', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'select').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'brief2', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'brief2').count }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'cl')) }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'ziEq')) }}</td>
                  <td>{{ fmt(getWeightedValue(line, 'keyEq')) }}</td>
                  <td>{{ fmt(calcFingerBalance(line.usage), 4) }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'dh', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'dh').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'ms', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'ms').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'ss', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'ss').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'pd', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'pd').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'lfd', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'lfd').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'trible', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'trible').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'overKey', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'overKey').count }}</td>
                  <td class="clickable" @click="handleCellClick(line, 'lack', `${line.start + 1}~${line.end}`)">{{ getColumnValue(line, 'lack').count }}</td>
                </tr>
                
                <!-- 小计行（在第3行后） -->
                <tr v-if="idx === 2" class="row-subtotal">
                  <td class="sticky-col">小计</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd1', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd1').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd2', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd2').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd3', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd3').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd4', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd4').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd5', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd5').count }}</td>
                  <td class="col-select clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'select', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'select').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'brief2', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'brief2').count }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cl')) }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ziEq')) }}</td>
                  <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'keyEq')) }}</td>
                  <td>{{ fmt(calcFingerBalance(getSubtotal(uploadedResult.lines.slice(0, 3)).usage), 4) }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'dh', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'dh').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ms', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ms').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ss', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ss').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'pd', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'pd').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lfd', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lfd').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'trible', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'trible').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'overKey', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'overKey').count }}</td>
                  <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lack', '小计')">{{ getColumnValue(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lack').count }}</td>
                </tr>
                
                <!-- 加权比重行（在小计行后） -->
                <tr v-if="idx === 2" class="row-weight">
                  <td class="sticky-col">加权比重</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd1') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd2') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd3') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd4') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'cd5') }}%</td>
                  <td class="col-select">{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'select') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'brief2') }}%</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'dh') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ms') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'ss') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'pd') }}%</td>
                  <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'lfd') }}%</td>
                  <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3)), 'trible') }}%</td>
                  <td>-</td>
                  <td>{{ getLackWeightPercent(getSubtotal(uploadedResult.lines.slice(0, 3))) }}%</td>
                </tr>
              </template>
              
              <!-- 总计行 -->
              <tr class="row-total">
                <td class="sticky-col">总计</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd1', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd1').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd2', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd2').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd3', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd3').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd4', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd4').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'cd5', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'cd5').count }}</td>
                <td class="col-select clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'select', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'select').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'brief2', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'brief2').count }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines), 'cl')) }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines), 'ziEq')) }}</td>
                <td>{{ fmt(getWeightedValue(getSubtotal(uploadedResult.lines), 'keyEq')) }}</td>
                <td>{{ fmt(calcFingerBalance(getSubtotal(uploadedResult.lines).usage), 4) }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'dh', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'dh').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'ms', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'ms').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'ss', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'ss').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'pd', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'pd').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'lfd', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'lfd').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'trible', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'trible').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'overKey', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'overKey').count }}</td>
                <td class="clickable" @click="handleCellClick(getSubtotal(uploadedResult.lines), 'lack', '总计')">{{ getColumnValue(getSubtotal(uploadedResult.lines), 'lack').count }}</td>
              </tr>
              
              <!-- 总加权比重行 -->
              <tr class="row-weight">
                <td class="sticky-col">加权比重</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd1') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd2') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd3') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd4') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'cd5') }}%</td>
                <td class="col-select">{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'select') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'brief2') }}%</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'dh') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'ms') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'ss') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'pd') }}%</td>
                <td>{{ getComboWeightPercent(getSubtotal(uploadedResult.lines), 'lfd') }}%</td>
                <td>{{ getWeightPercent(getSubtotal(uploadedResult.lines), 'trible') }}%</td>
                <td>-</td>
                <td>{{ getLackWeightPercent(getSubtotal(uploadedResult.lines)) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="heatmap-container">
          <h3 class="section-title">键位使用分布（单位：%）</h3>
          <KeyboardHeatmap :usage="uploadedResult.usage" />
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetailModal" class="modal-overlay" @click.self="closeDetailModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ detailTitle }}</h3>
          <button class="modal-close" @click="closeDetailModal">&times;</button>
        </div>
        <div class="modal-body">
          <table class="detail-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>汉字</th>
                <th>编码</th>
                <th>选重</th>
                <th>重码位</th>
                <th>字频</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in detailItems" :key="item.char" :class="{ 'is-lack': item.isLack }">
                <td>{{ idx + 1 }}</td>
                <td class="char-col">{{ item.char }}</td>
                <td class="code-col">{{ item.code || '-' }}</td>
                <td>{{ item.selectKey || '-' }}</td>
                <td>{{ item.collision > 1 ? item.collision : '-' }}</td>
                <td>{{ item.freq }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.evaluate-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  padding: 4px;
}

/* 顶部工具栏 - 现代卡片风格 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, var(--bg2) 0%, var(--bg1) 100%);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.title {
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.config-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-group label {
  font-size: 13px;
  color: var(--text2);
  font-weight: 500;
}

.config-input {
  width: 80px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  transition: all 0.2s ease;
}

.config-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

/* 标签页 - 胶囊按钮风格 */
.tabs {
  display: flex;
  gap: 8px;
  padding: 6px;
  background: var(--bg2);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tab-btn {
  flex: 1;
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
}

.tab-btn.active {
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
}

/* 操作栏 */
.action-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg2);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  margin-bottom: 8px;
}

.hint {
  font-size: 13px;
  color: var(--text3);
}

.result-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 表格容器 - 现代卡片风格 */
.table-container {
  overflow-x: auto;
  background: var(--bg2);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.eval-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  text-align: center;
}

.eval-table th,
.eval-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  white-space: nowrap;
  min-width: 44px;
}

.eval-table th {
  background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%);
  font-weight: 600;
  font-size: 12px;
  color: var(--text2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  z-index: 2;
}

.eval-table th:first-child {
  border-radius: 16px 0 0 0;
}

.eval-table th:last-child {
  border-radius: 0 16px 0 0;
}

.eval-table .sticky-col {
  position: sticky;
  left: 0;
  background: var(--bg2);
  z-index: 1;
  text-align: left;
  font-weight: 600;
  min-width: 80px;
}

.eval-table th.sticky-col {
  z-index: 3;
}

.eval-table .col-select {
  color: #f43f5e !important;
  font-weight: 700;
}

/* 选重列可点击时保持红色 */
.eval-table td.col-select.clickable {
  color: #f43f5e !important;
}

.eval-table td.col-select.clickable:hover {
  background: linear-gradient(135deg, #f43f5e 0%, #ec4899 100%);
  color: white !important;
}

.eval-table .row-highlight {
  background: rgba(99, 102, 241, 0.03);
}

.eval-table .row-subtotal {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%);
  font-weight: 600;
}

.eval-table .row-total {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, transparent 100%);
  font-weight: 700;
  font-size: 14px;
}

.eval-table .row-weight {
  background: var(--bg3);
  font-size: 12px;
  color: var(--text);
  font-weight: 500;
}

.eval-table .row-weight td {
  color: var(--text2);
}

/* 可点击单元格 - 现代标签风格 */
.eval-table td.clickable {
  cursor: pointer;
  color: var(--primary);
  font-weight: 600;
  transition: all 0.2s ease;
}

.eval-table td.clickable:hover {
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  color: white;
  border-radius: 6px;
  transform: scale(1.08);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

/* 热力图容器 */
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
}

.heatmap-container {
  background: var(--bg2);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 20px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

/* 上传区域 */
.upload-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  background: linear-gradient(135deg, var(--bg2) 0%, var(--bg1) 100%);
  border: 2px dashed rgba(99, 102, 241, 0.3);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.upload-area:hover {
  border-color: var(--primary);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.15);
}

.upload-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.7;
}

.upload-text {
  text-align: center;
}

.upload-text p {
  margin: 6px 0;
}

.file-name {
  font-weight: 600;
  color: var(--primary);
  font-size: 15px;
}

.file-info {
  font-size: 13px;
  color: var(--text2);
}

.upload-hint {
  font-size: 12px;
  color: var(--text3);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 32px;
  color: var(--text2);
  background: var(--bg2);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.4;
}

/* 按钮样式 */
.btn {
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  background: var(--bg3);
  color: var(--text);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-secondary:hover {
  background: var(--bg1);
  border-color: rgba(255, 255, 255, 0.2);
}

/* 模态框 - 清晰实底风格 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg2);
  border-radius: 12px;
  max-width: 900px;
  width: 90%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg3);
}

.modal-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  color: var(--text2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: #f43f5e;
  color: white;
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  background: var(--bg2);
}

/* 详情表格 - 清晰风格 */
.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.detail-table th,
.detail-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.detail-table th {
  background: var(--bg3);
  font-weight: 600;
  font-size: 12px;
  color: var(--text2);
}

.detail-table tr:hover {
  background: var(--bg3);
}

.detail-table tr.is-lack {
  background: rgba(244, 63, 94, 0.08);
}

.detail-table tr.is-lack:hover {
  background: rgba(244, 63, 94, 0.12);
}

.detail-table .char-col {
  font-size: 18px;
  text-align: center;
  font-weight: 500;
}

.detail-table .code-col {
  font-family: 'SF Mono', 'JetBrains Mono', 'Consolas', monospace;
  color: var(--primary);
  font-weight: 500;
}
</style>
