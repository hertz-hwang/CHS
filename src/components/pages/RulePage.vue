<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { VueFlow, useVueFlow, Position, MarkerType, Handle, type NodeMouseEvent, type NodeDragEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { useEngine } from '../../composables/useEngine'
import type { CodeRuleNode } from '../../engine/config'
import Icon from '../Icon.vue'

const { engine, toast, saveCurrentConfig } = useEngine()

// ============ 类型定义 ============

interface SourceData {
  label: string
  ruleType: 'start' | 'end' | 'pick'
  rule: CodeRuleNode
}

interface ConditionData {
  label: string
  ruleType: 'condition'
  rule: CodeRuleNode
}

type FlowNode = {
  id: string
  type: 'source' | 'condition'
  position: { x: number; y: number }
  data: SourceData | ConditionData
}

type FlowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  animated?: boolean
  label?: string
  style?: Record<string, string>
  markerEnd?: { type: MarkerType; color?: string }
}

// ============ 标签切换 ============

const activeTab = ref<'char' | 'word'>('char')

// ============ 节点面板类型 ============

interface NodeTemplate {
  type: 'start' | 'end' | 'pick' | 'condition'
  label: string
  icon: string
  description: string
  color: string
}

const nodeTemplatesChar: NodeTemplate[] = [
  { type: 'start', label: '开始节点', icon: '▶', description: '流程起点（仅一个）', color: 'var(--success)' },
  { type: 'end', label: '结束节点', icon: '⏹', description: '流程终点（仅一个）', color: 'var(--danger)' },
  { type: 'pick', label: '取码节点', icon: '📝', description: '取指定字根的码', color: 'var(--primary)' },
  { type: 'condition', label: '条件节点', icon: '❓', description: '条件判断分支', color: 'var(--purple)' },
]

const nodeTemplatesWord: NodeTemplate[] = [
  { type: 'start', label: '开始节点', icon: '▶', description: '流程起点（仅一个）', color: 'var(--success)' },
  { type: 'end', label: '结束节点', icon: '⏹', description: '流程终点（仅一个）', color: 'var(--danger)' },
  { type: 'pick', label: '取码节点', icon: '📝', description: '取指定字的字根码', color: 'var(--primary)' },
  { type: 'condition', label: '条件节点', icon: '❓', description: '条件判断分支', color: 'var(--purple)' },
]

// ============ 规则数据 ============

const codeRules = ref<CodeRuleNode[]>([])
const wordCodeRules = ref<CodeRuleNode[]>([])
const selectedRule = ref<CodeRuleNode | null>(null)

const { fitView, addNodes, addEdges, onConnect } = useVueFlow()

// ============ 规则加载 ============

function loadRulesFromEngine(): { charRules: CodeRuleNode[]; wordRules: CodeRuleNode[] } {
  const charRules = engine.getCodeRules()
  const wordRules = engine.getWordCodeRules()
  return {
    charRules: charRules.length > 0 ? charRules : createDefaultRules(),
    wordRules: wordRules.length > 0 ? wordRules : createDefaultWordRules(),
  }
}

function createDefaultRules(): CodeRuleNode[] {
  return [
    { id: 'start', type: 'start', label: '开始' },
    { id: 'end', type: 'end', label: '结束' },
  ]
}

function createDefaultWordRules(): CodeRuleNode[] {
  // 返回默认的多字词取码规则
  return [
    { id: 'start', type: 'start', label: '开始', nextNode: 'c0' },
    { id: 'end', type: 'end', label: '结束', position: { x: 384, y: 924 } },
    { id: 'c0', type: 'condition', label: '存在第3字？', conditionType: 'char_exists', conditionValue: 3, trueBranch: 's0', falseBranch: 's9', position: { x: 223, y: 154 } },
    { id: 's0', type: 'pick', label: '取第1字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 1, nextNode: 's5', position: { x: 136, y: 260 } },
    { id: 's1', type: 'pick', label: '取第1字第2根首码', rootIndex: 2, codeIndex: 1, charIndex: 1, nextNode: 's2', position: { x: 395, y: 385 } },
    { id: 's2', type: 'pick', label: '取第2字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 2, nextNode: 's3', position: { x: 399, y: 491 } },
    { id: 's3', type: 'pick', label: '取第2字第2根首码', rootIndex: 2, codeIndex: 1, charIndex: 2, nextNode: 'end', position: { x: 401, y: 589 } },
    { id: 's5', type: 'pick', label: '取第2字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 2, nextNode: 's6', position: { x: 140, y: 379 } },
    { id: 's6', type: 'pick', label: '取第3字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 3, nextNode: 'c1', position: { x: 144, y: 486 } },
    { id: 's4', type: 'pick', label: '取第3字第2根首码', rootIndex: 2, codeIndex: 1, charIndex: 3, nextNode: 'end', position: { x: 247, y: 711 } },
    { id: 's7', type: 'pick', label: '取末字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: -1, nextNode: 'end', position: { x: 11, y: 719 } },
    { id: 's9', type: 'pick', label: '取第1字第1根首码', rootIndex: 1, codeIndex: 1, charIndex: 1, nextNode: 's1', position: { x: 381, y: 269 } },
    { id: 'c1', type: 'condition', label: '存在第4字？', conditionType: 'char_exists', conditionValue: 4, trueBranch: 's7', falseBranch: 's4', position: { x: 125, y: 610 } },
  ]
}

// ============ 当前规则（根据标签） ============

const currentRules = computed({
  get: () => activeTab.value === 'char' ? codeRules.value : wordCodeRules.value,
  set: (val) => {
    if (activeTab.value === 'char') {
      codeRules.value = val
    } else {
      wordCodeRules.value = val
    }
  }
})

const currentNodeTemplates = computed(() => activeTab.value === 'char' ? nodeTemplatesChar : nodeTemplatesWord)

// ============ 检查节点数量 ============

function getNodeCount(type: 'start' | 'end' | 'pick' | 'condition'): number {
  return currentRules.value.filter(r => r.type === type).length
}

function canAddNode(type: 'start' | 'end' | 'pick' | 'condition'): boolean {
  if (type === 'start') return getNodeCount('start') === 0
  if (type === 'end') return getNodeCount('end') === 0
  return true
}

// ============ 获取新节点 ID ============

function getNewId(type: 's' | 'c'): string {
  let newId = 0
  const prefix = type
  const existingIds = currentRules.value
    .filter(r => r.id.startsWith(prefix))
    .map(r => parseInt(r.id.slice(1), 10))
    .filter(n => !isNaN(n))
  
  while (existingIds.includes(newId)) {
    newId++
  }
  return `${prefix}${newId}`
}

// ============ 添加节点 ============

function addNodeFromTemplate(template: NodeTemplate) {
  if (!canAddNode(template.type)) {
    if (template.type === 'start') {
      toast('已存在开始节点，不可重复添加')
    } else if (template.type === 'end') {
      toast('已存在结束节点，不可重复添加')
    }
    return
  }

  const id = template.type === 'condition' ? getNewId('c') : getNewId('s')
  let newRule: CodeRuleNode

  if (template.type === 'start') {
    newRule = { id: 'start', type: 'start', label: '开始' }
  } else if (template.type === 'end') {
    newRule = { id: 'end', type: 'end', label: '结束' }
  } else if (template.type === 'pick') {
    if (activeTab.value === 'word') {
      newRule = {
        id,
        type: 'pick',
        label: '取第1字第1根首码',
        pickType: 'root',
        charIndex: 1,
        rootIndex: 1,
        codeIndex: 1,
      }
    } else {
      newRule = {
        id,
        type: 'pick',
        label: '取第1根首码',
        pickType: 'root',
        rootIndex: 1,
        codeIndex: 1,
      }
    }
  } else {
    if (activeTab.value === 'word') {
      newRule = {
        id,
        type: 'condition',
        label: '存在第1字？',
        conditionType: 'char_exists',
        conditionValue: 1,
      }
    } else {
      newRule = {
        id,
        type: 'condition',
        label: '存在第1根？',
        conditionType: 'root_exists',
        conditionValue: 1,
      }
    }
  }

  currentRules.value = [...currentRules.value, newRule]
  saveRules()
  toast(`已添加${template.label}`)
}

// ============ 拖拽支持 ============

let draggedType: 'start' | 'end' | 'pick' | 'condition' | null = null

function onDragStart(event: DragEvent, template: NodeTemplate) {
  draggedType = template.type
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', template.type)
  }
}

function onDragEnd() {
  draggedType = null
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  if (!draggedType) return
  
  const type = draggedType
  draggedType = null

  if (!canAddNode(type)) {
    if (type === 'start') {
      toast('已存在开始节点，不可重复添加')
    } else if (type === 'end') {
      toast('已存在结束节点，不可重复添加')
    }
    return
  }

  addNodeFromTemplate(currentNodeTemplates.value.find(t => t.type === type)!)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

// ============ 布局计算 ============

// 检查是否所有节点都有保存的位置
function allNodesHavePositions(): boolean {
  return currentRules.value.every(rule => rule.position !== undefined)
}

function layoutNodes(): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  
  // 如果所有节点都已有位置，直接使用保存的位置
  if (allNodesHavePositions()) {
    for (const rule of currentRules.value) {
      if (rule.position) {
        positions.set(rule.id, rule.position)
      }
    }
    return positions
  }
  
  // 否则进行自动布局
  const visited = new Set<string>()
  
  // 构建邻接表
  const adj = new Map<string, string[]>()
  const reverseAdj = new Map<string, string[]>()
  
  for (const rule of currentRules.value) {
    adj.set(rule.id, [])
    reverseAdj.set(rule.id, [])
  }
  
  for (const rule of currentRules.value) {
    if (rule.nextNode) {
      adj.get(rule.id)?.push(rule.nextNode)
      reverseAdj.get(rule.nextNode)?.push(rule.id)
    }
    if (rule.trueBranch) {
      adj.get(rule.id)?.push(rule.trueBranch)
      reverseAdj.get(rule.trueBranch)?.push(rule.id)
    }
    if (rule.falseBranch) {
      adj.get(rule.id)?.push(rule.falseBranch)
      reverseAdj.get(rule.falseBranch)?.push(rule.id)
    }
  }
  
  // 找到开始节点
  const startRule = currentRules.value.find(r => r.type === 'start')
  if (!startRule) {
    // 没有开始节点，按 ID 顺序排列
    let y = 50
    for (const rule of currentRules.value) {
      // 优先使用保存的位置
      if (rule.position) {
        positions.set(rule.id, rule.position)
      } else {
        positions.set(rule.id, { x: 300, y })
      }
      y += 100
    }
    return positions
  }
  
  // BFS 布局
  const queue: { id: string; level: number }[] = [{ id: startRule.id, level: 0 }]
  visited.add(startRule.id)
  const levels = new Map<number, string[]>()
  
  while (queue.length > 0) {
    const { id, level } = queue.shift()!
    if (!levels.has(level)) levels.set(level, [])
    levels.get(level)?.push(id)
    
    const children = adj.get(id) || []
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId)
        queue.push({ id: childId, level: level + 1 })
      }
    }
  }
  
  // 设置位置
  const nodeWidth = 120
  const nodeHeight = 100
  let y = 50
  
  for (const [level, nodes] of levels) {
    const totalWidth = nodes.length * nodeWidth + (nodes.length - 1) * 50
    let x = 300 - totalWidth / 2
    
    for (const nodeId of nodes) {
      const rule = currentRules.value.find(r => r.id === nodeId)
      // 优先使用保存的位置
      if (rule?.position) {
        positions.set(nodeId, rule.position)
      } else {
        positions.set(nodeId, { x, y })
      }
      x += nodeWidth + 50
    }
    y += nodeHeight
  }
  
  // 处理未访问的节点（孤立节点）
  let orphanY = y + 50
  for (const rule of currentRules.value) {
    if (!visited.has(rule.id)) {
      // 优先使用保存的位置
      if (rule.position) {
        positions.set(rule.id, rule.position)
      } else {
        positions.set(rule.id, { x: 300, y: orphanY })
      }
      orphanY += 100
    }
  }
  
  return positions
}

// ============ 转换为 Vue Flow 数据 ============

const flowNodes = computed<FlowNode[]>(() => {
  const positions = layoutNodes()
  
  return currentRules.value.map((rule) => {
    const pos = positions.get(rule.id) || rule.position || { x: 0, y: 0 }
    const nodeType = rule.type === 'condition' ? 'condition' : 'source'
    
    return {
      id: rule.id,
      type: nodeType,
      position: pos,
      data: {
        label: rule.label,
        ruleType: rule.type,
        rule: rule,
      },
    }
  })
})

const flowEdges = computed<FlowEdge[]>(() => {
  const edges: FlowEdge[] = []
  
  for (const rule of currentRules.value) {
    if (rule.type === 'condition') {
      if (rule.trueBranch) {
        edges.push({
          id: `e-${rule.id}-${rule.trueBranch}-positive`,
          source: rule.id,
          target: rule.trueBranch,
          sourceHandle: 'positive',
          animated: true,
          label: '是',
          style: { stroke: 'var(--success)' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--success)' },
        })
      }
      if (rule.falseBranch) {
        edges.push({
          id: `e-${rule.id}-${rule.falseBranch}-negative`,
          source: rule.id,
          target: rule.falseBranch,
          sourceHandle: 'negative',
          animated: true,
          label: '否',
          style: { stroke: 'var(--danger)' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--danger)' },
        })
      }
    } else if (rule.nextNode) {
      edges.push({
        id: `e-${rule.id}-${rule.nextNode}`,
        source: rule.id,
        target: rule.nextNode,
        animated: true,
      })
    }
  }
  
  return edges
})

// ============ 节点交互 ============

function onNodeClick(event: NodeMouseEvent) {
  const nodeId = event.node.id
  const rule = currentRules.value.find(r => r.id === nodeId)
  if (rule && rule.type !== 'start' && rule.type !== 'end') {
    selectedRule.value = { ...rule }
    if (selectedRule.value.type === 'pick' && !selectedRule.value.pickType) {
      selectedRule.value.pickType = 'root'
    }
  } else {
    selectedRule.value = null
  }
}

function onPaneClick() {
  selectedRule.value = null
}

// ============ 连接处理 ============

onConnect((params) => {
  const { source, target, sourceHandle } = params
  
  const sourceRule = currentRules.value.find(r => r.id === source)
  if (!sourceRule) return
  
  if (sourceRule.type === 'condition') {
    // 条件节点：根据 sourceHandle 决定分支
    if (sourceHandle === 'positive') {
      sourceRule.trueBranch = target
    } else if (sourceHandle === 'negative') {
      sourceRule.falseBranch = target
    }
  } else {
    // 普通节点
    sourceRule.nextNode = target
  }
  
  saveRules()
})

// ============ 右键菜单 ============

const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  nodeId: string
}>({
  visible: false,
  x: 0,
  y: 0,
  nodeId: '',
})

function showContextMenu(event: MouseEvent, nodeId: string) {
  event.preventDefault()
  const rule = currentRules.value.find(r => r.id === nodeId)
  if (!rule) return
  
  // 开始和结束节点不能删除
  if (rule.type === 'start' || rule.type === 'end') return
  
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    nodeId,
  }
}

function hideContextMenu() {
  contextMenu.value.visible = false
}

function deleteNode(nodeId: string) {
  const rule = currentRules.value.find(r => r.id === nodeId)
  if (!rule) return
  
  // 清除指向该节点的引用
  for (const r of currentRules.value) {
    if (r.nextNode === nodeId) r.nextNode = undefined
    if (r.trueBranch === nodeId) r.trueBranch = undefined
    if (r.falseBranch === nodeId) r.falseBranch = undefined
  }
  
  currentRules.value = currentRules.value.filter(r => r.id !== nodeId)
  selectedRule.value = null
  saveRules()
  toast('已删除节点')
}

// ============ 编辑规则 ============

function getCodeLabel(codeIndex: number | undefined): string {
  if (codeIndex === undefined || codeIndex === null) return '首码'
  if (codeIndex === -1) return '末码'
  if (codeIndex === 1) return '首码'
  if (codeIndex === 2) return '次码'
  if (codeIndex === 3) return '三码'
  return `第${codeIndex}码`
}

function getPinyinPartLabel(part: CodeRuleNode['pinyinPart']): string {
  if (part === 'last_letter') return '末字母'
  if (part === 'initial') return '声母'
  if (part === 'final') return '韵母'
  return '首字母'
}

function getRootLabel(rootIndex: number | undefined): string {
  if (rootIndex === undefined || rootIndex === null) return '第1根'
  if (rootIndex === -1) return '末根'
  return `第${rootIndex}根`
}

function getCharLabel(charIndex: number | undefined): string {
  if (charIndex === undefined || charIndex === null) return '第1字'
  if (charIndex === -1) return '末字'
  if (charIndex === -2) return '末2字'
  return `第${charIndex}字`
}

function onRuleChange() {
  if (!selectedRule.value) return
  
  // 更新标签
  if (selectedRule.value.type === 'pick') {
    if (activeTab.value === 'word') {
      const charLabel = getCharLabel(selectedRule.value.charIndex)
      if (selectedRule.value.pickType === 'pinyin') {
        selectedRule.value.label = `取${charLabel}字音${getPinyinPartLabel(selectedRule.value.pinyinPart)}`
      } else {
        const rootLabel = getRootLabel(selectedRule.value.rootIndex)
        const codeLabel = getCodeLabel(selectedRule.value.codeIndex)
        selectedRule.value.label = `取${charLabel}${rootLabel}${codeLabel}`
      }
    } else {
      if (selectedRule.value.pickType === 'pinyin') {
        selectedRule.value.label = `取字音${getPinyinPartLabel(selectedRule.value.pinyinPart)}`
      } else {
        const rootLabel = getRootLabel(selectedRule.value.rootIndex)
        const codeLabel = getCodeLabel(selectedRule.value.codeIndex)
        selectedRule.value.label = `取${rootLabel}${codeLabel}`
      }
    }
  } else if (selectedRule.value.type === 'condition') {
    if (activeTab.value === 'word') {
      if (selectedRule.value.conditionType === 'char_exists') {
        selectedRule.value.label = `存在第${selectedRule.value.conditionValue}字？`
      }
    } else {
      if (selectedRule.value.conditionType === 'root_exists') {
        selectedRule.value.label = `存在第${selectedRule.value.conditionValue}根？`
      } else if (selectedRule.value.conditionType === 'root_has_code') {
        selectedRule.value.label = `第${selectedRule.value.conditionValue}根有第${selectedRule.value.conditionCodeIndex}码？`
      } else if (selectedRule.value.conditionType === 'root_count') {
        selectedRule.value.label = `字根数≥${selectedRule.value.conditionValue}？`
      }
    }
  }
  
  // 实时保存
  const index = currentRules.value.findIndex(r => r.id === selectedRule.value!.id)
  if (index >= 0) {
    currentRules.value[index] = { ...selectedRule.value }
    saveRules()
  }
}

function onPickTypeChange() {
  if (!selectedRule.value || selectedRule.value.type !== 'pick') return
  if (selectedRule.value.pickType === 'pinyin') {
    selectedRule.value.pinyinPart = selectedRule.value.pinyinPart || 'first_letter'
  } else {
    selectedRule.value.pickType = 'root'
  }
  onRuleChange()
}

// ============ 保存规则 ============

function saveRules() {
  console.log('保存规则，当前规则:', JSON.parse(JSON.stringify(currentRules.value)))
  if (activeTab.value === 'char') {
    engine.setCodeRules(codeRules.value)
  } else {
    engine.setWordCodeRules(wordCodeRules.value)
  }
  saveCurrentConfig()
  console.log('配置已保存到 localStorage')
}

// ============ 节点拖动保存位置 ============

function handleNodeDragEnd(event: NodeDragEvent) {
  console.log('节点拖动结束事件触发:', event)
  const node = event.node
  if (!node) {
    console.log('没有节点信息')
    return
  }
  
  console.log('节点信息:', node.id, '位置:', node.position)
  
  const ruleIndex = currentRules.value.findIndex(r => r.id === node.id)
  console.log('规则索引:', ruleIndex)
  
  if (ruleIndex >= 0) {
    // 创建新的规则对象以触发 Vue 响应式更新
    const updatedRule = {
      ...currentRules.value[ruleIndex],
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) }
    }
    // 替换数组中的元素
    currentRules.value = [
      ...currentRules.value.slice(0, ruleIndex),
      updatedRule,
      ...currentRules.value.slice(ruleIndex + 1)
    ]
    // 保存到 localStorage
    saveRules()
    console.log('节点位置已保存:', node.id, updatedRule.position)
  }
}

// ============ 切换标签时清除选中 ============

watch(activeTab, () => {
  selectedRule.value = null
})

// ============ 初始化 ============

onMounted(() => {
  const { charRules, wordRules } = loadRulesFromEngine()
  codeRules.value = charRules
  wordCodeRules.value = wordRules

  // 同步到 engine
  engine.setCodeRules(charRules)
  engine.setWordCodeRules(wordRules)

  setTimeout(() => fitView({ padding: 0.2 }), 100)

  // 全局点击关闭右键菜单
  document.addEventListener('click', hideContextMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
})
</script>

<template>
  <div class="rule-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title"><Icon name="rule" :size="18" /> 取码规则</span>
        
        <!-- 标签切换 -->
        <div class="tab-switch">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'char' }"
            @click="activeTab = 'char'"
          >
            单字
          </button>
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'word' }"
            @click="activeTab = 'word'"
          >
            多字词
          </button>
        </div>
        
        <span class="count">{{ currentRules.length }} 个节点</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm" @click="() => fitView({ padding: 0.2 })">自适应</button>
      </div>
    </div>

    <div class="main-content">
      <!-- 左侧节点面板 -->
      <div class="node-panel">
        <div class="panel-title">节点类型</div>
        <div class="node-list">
          <div
            v-for="template in currentNodeTemplates"
            :key="template.type"
            class="node-template"
            :class="{ disabled: !canAddNode(template.type) }"
            :style="{ borderColor: template.color }"
            draggable="true"
            @dragstart="onDragStart($event, template)"
            @dragend="onDragEnd"
            @click="addNodeFromTemplate(template)"
          >
            <div class="template-icon" :style="{ color: template.color }">{{ template.icon }}</div>
            <div class="template-info">
              <div class="template-label">{{ template.label }}</div>
              <div class="template-desc">{{ template.description }}</div>
            </div>
            <div v-if="!canAddNode(template.type)" class="template-badge">已存在</div>
          </div>
        </div>
        <div class="panel-hint">
          <p><Icon name="info" :size="14" /> 点击或拖动节点到右侧画布</p>
          <p><Icon name="link" :size="14" /> 拖动节点连接点创建连线</p>
        </div>
      </div>

      <!-- Vue Flow 画布 -->
      <div class="flow-wrapper" @drop="onDrop" @dragover="onDragOver">
        <VueFlow
          :nodes="flowNodes"
          :edges="flowEdges"
          :fit-view-on-init="false"
          :min-zoom="0.5"
          :max-zoom="2"
          @pane-click="onPaneClick"
          @node-click="onNodeClick"
          @node-drag-stop="handleNodeDragEnd"
          class="rule-flow"
        >
          <Background />
          <Controls />
          
          <!-- 源节点模板 -->
          <template #node-source="{ id, data }">
            <div
              class="source-node"
              :class="{ start: data.ruleType === 'start', end: data.ruleType === 'end', pick: data.ruleType === 'pick' }"
              @contextmenu="showContextMenu($event, id)"
            >
              <div class="node-icon">
                <template v-if="data.ruleType === 'start'">▶</template>
                <template v-else-if="data.ruleType === 'end'">⏹</template>
                <template v-else>📝</template>
              </div>
              <div class="node-label">{{ data.label }}</div>
              
              <Handle
                v-if="data.ruleType !== 'start'"
                type="target"
                :position="Position.Top"
                class="handle-target"
              />
              
              <Handle
                v-if="data.ruleType !== 'end'"
                type="source"
                :position="Position.Bottom"
                class="handle-source"
              />
            </div>
          </template>
          
          <!-- 条件节点模板 -->
          <template #node-condition="{ id, data }">
            <div class="condition-node" @contextmenu="showContextMenu($event, id)">
              <div class="node-icon">❓</div>
              <div class="node-label">{{ data.label }}</div>
              
              <Handle type="target" :position="Position.Top" class="handle-target" />
              <Handle type="source" id="positive" :position="Position.Left" class="handle-positive" />
              <Handle type="source" id="negative" :position="Position.Right" class="handle-negative" />
            </div>
          </template>
        </VueFlow>
        
        <!-- 右上角编辑面板 -->
        <div v-if="selectedRule" class="edit-panel">
          <div class="edit-panel-header">
            <h3>编辑 {{ selectedRule.type === 'pick' ? '取码节点' : '条件节点' }}</h3>
          </div>
          
          <div class="edit-panel-body">
            <!-- 取码节点编辑 -->
            <template v-if="selectedRule.type === 'pick'">
              <div class="form-row">
                <label>取码类型</label>
                <select
                  v-model="selectedRule.pickType"
                  @change="onPickTypeChange"
                >
                  <option value="root">字根</option>
                  <option value="pinyin">字音</option>
                </select>
              </div>
              <!-- 多字词模式：显示字位置选择 -->
              <div v-if="activeTab === 'word'" class="form-row">
                <label>字位置</label>
                <select v-model="selectedRule.charIndex" @change="onRuleChange">
                  <option :value="1">第1字</option>
                  <option :value="2">第2字</option>
                  <option :value="3">第3字</option>
                  <option :value="4">第4字</option>
                  <option :value="5">第5字</option>
                  <option :value="-1">末字</option>
                  <option :value="-2">末2字</option>
                </select>
              </div>
              <div v-if="selectedRule.pickType !== 'pinyin'" class="form-row">
                <label>字根位置</label>
                <select v-model="selectedRule.rootIndex" @change="onRuleChange">
                  <option :value="1">第1根</option>
                  <option :value="2">第2根</option>
                  <option :value="3">第3根</option>
                  <option :value="4">第4根</option>
                  <option :value="5">第5根</option>
                  <option :value="-1">末根</option>
                </select>
              </div>
              <div v-if="selectedRule.pickType !== 'pinyin'" class="form-row">
                <label>码位位置</label>
                <select v-model="selectedRule.codeIndex" @change="onRuleChange">
                  <option :value="1">首码</option>
                  <option :value="2">次码</option>
                  <option :value="3">三码</option>
                  <option :value="-1">末码</option>
                </select>
              </div>
              <div v-if="selectedRule.pickType === 'pinyin'" class="form-row">
                <label>音素</label>
                <select v-model="selectedRule.pinyinPart" @change="onRuleChange">
                  <option value="first_letter">首字母</option>
                  <option value="last_letter">末字母</option>
                  <option value="initial">声母</option>
                  <option value="final">韵母</option>
                </select>
              </div>
            </template>
            
            <!-- 条件节点编辑 -->
            <template v-if="selectedRule.type === 'condition'">
              <!-- 多字词模式：只有"存在第N个字"条件 -->
              <template v-if="activeTab === 'word'">
                <div class="form-row">
                  <label>条件类型</label>
                  <select v-model="selectedRule.conditionType" @change="onRuleChange">
                    <option value="char_exists">存在第N个字</option>
                  </select>
                </div>
                <div class="form-row">
                  <label>N值（字位置）</label>
                  <input type="number" v-model.number="selectedRule.conditionValue" min="1" max="10" @change="onRuleChange" />
                </div>
              </template>
              <!-- 单字模式：原有条件 -->
              <template v-else>
                <div class="form-row">
                  <label>条件类型</label>
                  <select v-model="selectedRule.conditionType" @change="onRuleChange">
                    <option value="root_exists">存在第N个根</option>
                    <option value="root_has_code">第N个根存在第M码</option>
                    <option value="root_count">字根数量≥N</option>
                  </select>
                </div>
                <div class="form-row">
                  <label>N值（字根位置）</label>
                  <input type="number" v-model.number="selectedRule.conditionValue" min="1" max="10" @change="onRuleChange" />
                </div>
                <div v-if="selectedRule.conditionType === 'root_has_code'" class="form-row">
                  <label>M值（码位位置）</label>
                  <input type="number" v-model.number="selectedRule.conditionCodeIndex" min="1" max="4" @change="onRuleChange" />
                </div>
              </template>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <div class="context-menu-item danger" @click="deleteNode(contextMenu.nodeId); hideContextMenu()">
          删除节点
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.rule-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
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

/* 标签切换 */
.tab-switch {
  display: flex;
  background: var(--bg3);
  border-radius: 6px;
  padding: 2px;
}

.tab-btn {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--text);
}

.tab-btn.active {
  background: var(--primary);
  color: white;
}

.count {
  font-size: 13px;
  color: var(--text2);
  background: var(--bg3);
  padding: 4px 10px;
  border-radius: 4px;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.main-content {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

/* 左侧节点面板 */
.node-panel {
  width: 220px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-title {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.node-list {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.node-template {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg);
  border: 2px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.node-template:hover:not(.disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.node-template.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.template-icon {
  font-size: 20px;
  width: 28px;
  text-align: center;
}

.template-info {
  flex: 1;
}

.template-label {
  font-size: 13px;
  font-weight: 500;
}

.template-desc {
  font-size: 11px;
  color: var(--text3);
  margin-top: 2px;
}

.template-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  padding: 2px 6px;
  background: var(--bg3);
  border-radius: 4px;
  color: var(--text3);
}

.panel-hint {
  padding: 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text3);
}

.panel-hint p {
  margin: 4px 0;
}

/* Flow 画布 */
.flow-wrapper {
  flex: 1;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  position: relative;
}

.rule-flow {
  width: 100%;
  height: 100%;
}

/* 源节点样式 */
.source-node {
  padding: 10px 20px;
  border-radius: 8px;
  min-width: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.source-node:hover {
  transform: scale(1.02);
}

.source-node.start {
  background: rgba(0, 180, 42, 0.15);
  border: 2px solid var(--success);
  color: var(--success);
}

.source-node.end {
  background: rgba(245, 63, 63, 0.15);
  border: 2px solid var(--danger);
  color: var(--danger);
}

.source-node.pick {
  background: var(--bg);
  border: 2px solid var(--primary);
  color: var(--primary);
}

/* 条件节点样式 */
.condition-node {
  padding: 10px 20px;
  border-radius: 0;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  background: var(--bg);
  border: 2px dashed var(--purple);
  color: var(--purple);
}

.condition-node:hover {
  transform: scale(1.02);
}

.node-icon {
  font-size: 16px;
}

.node-label {
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
}

/* Handle 样式 */
.handle-target,
.handle-source {
  width: 12px !important;
  height: 12px !important;
  background: var(--primary) !important;
  border: 2px solid var(--bg) !important;
}

.handle-positive {
  width: 12px !important;
  height: 12px !important;
  background: var(--success) !important;
  border: 2px solid var(--bg) !important;
}

.handle-negative {
  width: 12px !important;
  height: 12px !important;
  background: var(--danger) !important;
  border: 2px solid var(--bg) !important;
}

/* 编辑面板 */
.edit-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 280px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow2);
  z-index: 100;
}

.edit-panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.edit-panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.edit-panel-body {
  padding: 16px;
}

.form-row {
  margin-bottom: 12px;
}

.form-row label {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 4px;
}

.form-row select,
.form-row input {
  width: 100%;
}

/* 右键菜单 */
.context-menu {
  position: fixed;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow2);
  padding: 4px 0;
  min-width: 120px;
  z-index: 10000;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.15s ease;
}

.context-menu-item:hover {
  background: var(--primary-bg);
}

.context-menu-item.danger {
  color: var(--danger);
}

.context-menu-item.danger:hover {
  background: rgba(245, 63, 63, 0.1);
}
</style>

<!-- 全局 Vue Flow 样式 -->
<style>
.vue-flow__controls {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  background: var(--bg2) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  padding: 6px !important;
  box-shadow: var(--shadow) !important;
}

.vue-flow__controls-button {
  width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: var(--bg) !important;
  border: 1px solid var(--border) !important;
  border-radius: 4px !important;
  color: var(--text) !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

.vue-flow__controls-button:hover {
  background: var(--primary-bg) !important;
  border-color: var(--primary) !important;
  color: var(--primary) !important;
}

.vue-flow__controls-button svg {
  fill: currentColor !important;
  width: 14px !important;
  height: 14px !important;
}

.vue-flow__node {
  border: none !important;
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.vue-flow__edge-path {
  stroke-width: 2 !important;
}

.vue-flow__edge-textbg {
  fill: var(--bg2) !important;
}

.vue-flow__edge-text {
  font-size: 11px !important;
  fill: var(--text2) !important;
}

.vue-flow__handle {
  border-radius: 50% !important;
}
</style>
