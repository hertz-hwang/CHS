<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { VueFlow, useVueFlow, Position, MarkerType, type EdgeMarker, type NodeDragEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { useEngine } from '../../composables/useEngine'
import { CodeRuleNode, createDefaultCodeRules } from '../../engine/config'

const { engine, toast, refreshStats, rootsVersion, configVersion, saveCurrentConfig } = useEngine()

// 规则节点类型
type RuleType = 'start' | 'end' | 'pick' | 'condition'

// 条件类型
type ConditionType = 'root_exists' | 'root_has_code' | 'root_count'

// Vue Flow 节点
interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
  sourcePosition?: Position
  targetPosition?: Position
}

// Vue Flow 边
interface FlowEdge {
  id: string
  source: string
  target: string
  animated?: boolean
  label?: string
  style?: Record<string, string>
  markerEnd?: { type: MarkerType; color?: string }
}

// 从 engine 加载取码规则
function loadRulesFromEngine(): CodeRuleNode[] {
  const rules = engine.getCodeRules()
  return rules.length > 0 ? rules : createDefaultCodeRules()
}

const codeRules = ref<CodeRuleNode[]>([])

// 监听配置版本变化，重新加载规则
watch(configVersion, () => {
  const rules = loadRulesFromEngine()
  // 只在有规则时更新，避免覆盖已有位置信息
  if (rules.length > 0) {
    codeRules.value = rules
  }
}, { immediate: true })

// 编辑相关
const showEditModal = ref(false)
const editingNode = ref<CodeRuleNode | null>(null)
const isNewRule = ref(false)
const editForm = ref({
  type: 'pick' as RuleType,
  rootIndex: 1,
  codeIndex: 1,
  nextNode: '',  // 取码节点的下一节点
  conditionType: 'root_exists' as ConditionType,
  conditionValue: 1,
  conditionCodeIndex: 1, // 用于 root_has_code 条件
  trueBranch: '',
  falseBranch: '',
})

// Vue Flow 实例
const { fitView, addNodes, addEdges, removeNodes, getNodes, getEdges } = useVueFlow()

// 转换为 Vue Flow 节点
const flowNodes = computed<FlowNode[]>(() => {
  let defaultY = 0
  return codeRules.value.map((rule, index) => {
    const node: FlowNode = {
      id: rule.id,
      type: 'default',
      position: rule.position || { x: 300, y: defaultY },
      data: {
        label: rule.label,
        ruleType: rule.type,
        rule,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }
    defaultY += 100
    return node
  })
})

// 节点拖动结束事件 - 保存位置
function onNodeDragEnd(event: NodeDragEvent) {
  // 直接从事件参数获取节点的新位置
  const nodeId = event.node.id
  const newPosition = event.node.position
  
  const rule = codeRules.value.find(r => r.id === nodeId)
  if (rule) {
    // 更新规则中的位置信息
    rule.position = { x: newPosition.x, y: newPosition.y }
    // 保存到 engine 和 localStorage
    engine.setCodeRules(codeRules.value)
    saveCurrentConfig()
  }
}

// 转换为 Vue Flow 边
const flowEdges = computed<FlowEdge[]>(() => {
  const edges: FlowEdge[] = []
  
  codeRules.value.forEach((rule, index) => {
    // 条件节点的分支
    if (rule.type === 'condition') {
      if (rule.trueBranch) {
        edges.push({
          id: `e-${rule.id}-${rule.trueBranch}`,
          source: rule.id,
          target: rule.trueBranch,
          animated: true,
          label: '是',
          style: { stroke: 'var(--success)' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--success)' },
        })
      }
      if (rule.falseBranch) {
        edges.push({
          id: `e-${rule.id}-${rule.falseBranch}`,
          source: rule.id,
          target: rule.falseBranch,
          animated: true,
          label: '否',
          style: { stroke: 'var(--danger)' },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--danger)' },
        })
      }
      // 没有配置分支时，连接到下一个节点
      if (!rule.trueBranch && !rule.falseBranch && index < codeRules.value.length - 1) {
        const nextRule = codeRules.value[index + 1]
        edges.push({
          id: `e-${rule.id}-${nextRule.id}`,
          source: rule.id,
          target: nextRule.id,
          animated: true,
        })
      }
    } else if (rule.type === 'pick' && rule.nextNode) {
      // 取码节点有指定下一节点
      edges.push({
        id: `e-${rule.id}-${rule.nextNode}`,
        source: rule.id,
        target: rule.nextNode,
        animated: true,
      })
    } else {
      // 普通节点连接到下一个
      if (index < codeRules.value.length - 1) {
        const nextRule = codeRules.value[index + 1]
        // 检查上一个节点是否是条件节点且已配置分支
        const prevRule = index > 0 ? codeRules.value[index - 1] : null
        if (prevRule?.type === 'condition' && (prevRule.trueBranch === rule.id || prevRule.falseBranch === rule.id)) {
          // 已经由条件节点处理
        } else {
          edges.push({
            id: `e-${rule.id}-${nextRule.id}`,
            source: rule.id,
            target: nextRule.id,
            animated: true,
          })
        }
      }
    }
  })
  
  return edges
})

// 获取可用分支选项
const branchOptions = computed(() => {
  return codeRules.value
    .filter(r => r.type !== 'start')
    .map(r => ({ id: r.id, label: r.label }))
})

// 编辑规则
function editRule(rule: CodeRuleNode) {
  editingNode.value = rule
  editForm.value = {
    type: rule.type,
    rootIndex: rule.rootIndex || 1,
    codeIndex: rule.codeIndex || 1,
    nextNode: rule.nextNode || '',
    conditionType: rule.conditionType || 'root_exists',
    conditionValue: rule.conditionValue || 1,
    conditionCodeIndex: rule.conditionCodeIndex || 1,
    trueBranch: rule.trueBranch || '',
    falseBranch: rule.falseBranch || '',
  }
  isNewRule.value = false
  showEditModal.value = true
}

// 添加规则
function addRule() {
  const newId = `r${Date.now()}`
  editingNode.value = {
    id: newId,
    type: 'pick',
    label: '',
    rootIndex: 1,
    codeIndex: 1,
  }
  editForm.value = {
    type: 'pick',
    rootIndex: 1,
    codeIndex: 1,
    nextNode: '',
    conditionType: 'root_exists',
    conditionValue: 1,
    conditionCodeIndex: 1,
    trueBranch: '',
    falseBranch: '',
  }
  isNewRule.value = true
  showEditModal.value = true
}

// 保存规则
function saveRule() {
  if (!editingNode.value) return
  
  editingNode.value.type = editForm.value.type
  
  if (editForm.value.type === 'pick') {
    editingNode.value.rootIndex = editForm.value.rootIndex
    editingNode.value.codeIndex = editForm.value.codeIndex
    editingNode.value.nextNode = editForm.value.nextNode
    const rootLabel = editForm.value.rootIndex === -1 ? '末根' : `第${editForm.value.rootIndex}根`
    const codeLabel = editForm.value.codeIndex === -1 ? '末码' : `第${editForm.value.codeIndex}码`
    editingNode.value.label = `取${rootLabel}${codeLabel}`
  } else if (editForm.value.type === 'condition') {
    editingNode.value.conditionType = editForm.value.conditionType
    editingNode.value.conditionValue = editForm.value.conditionValue
    editingNode.value.trueBranch = editForm.value.trueBranch
    editingNode.value.falseBranch = editForm.value.falseBranch
    
    if (editForm.value.conditionType === 'root_exists') {
      editingNode.value.label = `存在第${editForm.value.conditionValue}根？`
    } else if (editForm.value.conditionType === 'root_has_code') {
      editingNode.value.conditionCodeIndex = editForm.value.conditionCodeIndex
      editingNode.value.label = `第${editForm.value.conditionValue}根有第${editForm.value.conditionCodeIndex}码？`
    } else if (editForm.value.conditionType === 'root_count') {
      editingNode.value.label = `字根数≥${editForm.value.conditionValue}？`
    }
  }
  
  if (isNewRule.value) {
    const endIdx = codeRules.value.findIndex(r => r.type === 'end')
    if (endIdx > 0) {
      codeRules.value.splice(endIdx, 0, editingNode.value)
    } else {
      codeRules.value.push(editingNode.value)
    }
    toast('已添加规则')
  } else {
    toast('规则已更新')
  }
  
  showEditModal.value = false
}

// 删除规则
function deleteRule(rule: CodeRuleNode) {
  if (rule.type === 'start' || rule.type === 'end') {
    toast('不能删除开始/结束节点')
    return
  }
  
  const index = codeRules.value.findIndex(r => r.id === rule.id)
  if (index > 0) {
    codeRules.value.splice(index, 1)
    toast('已删除规则')
  }
}

// 节点点击事件
function onNodeClick(event: { node: FlowNode }) {
  const rule = codeRules.value.find(r => r.id === event.node.id)
  if (rule && rule.type !== 'start' && rule.type !== 'end') {
    editRule(rule)
  }
}

// 重置规则
function resetRules() {
  codeRules.value = createDefaultCodeRules()
  toast('已重置为默认规则')
}

// 首次加载标记
const isFirstLoad = ref(true)

// 自适应视图 - 只在首次加载且没有保存位置时调用
onMounted(() => {
  // 检查是否有保存的位置
  const hasPositions = codeRules.value.some(r => r.position)
  if (!hasPositions) {
    setTimeout(() => fitView({ padding: 0.2 }), 100)
  }
  isFirstLoad.value = false
})

// 监听规则变化，自动保存到 engine 配置
watch(codeRules, (newRules) => {
  if (!isFirstLoad.value) {
    engine.setCodeRules(newRules)
    saveCurrentConfig()
  }
}, { deep: true })
</script>

<template>
  <div class="rule-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">🔀 取码规则</span>
        <span class="count">{{ codeRules.length }} 条规则</span>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm btn-success" @click="addRule">+ 添加规则</button>
      </div>
    </div>

    <!-- Vue Flow 画布 -->
    <div class="flow-wrapper">
      <VueFlow
        :nodes="flowNodes"
        :edges="flowEdges"
        :fit-view-on-init="false"
        :min-zoom="0.5"
        :max-zoom="2"
        @node-click="onNodeClick"
        @node-drag-end="onNodeDragEnd"
        class="rule-flow"
      >
        <Background />
        <Controls />
        
        <!-- 自定义节点模板 -->
        <template #node-default="{ data }">
          <div class="rule-node" :class="data.ruleType">
            <div class="node-icon">
              <template v-if="data.ruleType === 'start'">▶</template>
              <template v-else-if="data.ruleType === 'end'">⏹</template>
              <template v-else-if="data.ruleType === 'pick'">📝</template>
              <template v-else-if="data.ruleType === 'condition'">❓</template>
            </div>
            <div class="node-label">{{ data.label }}</div>
            <div v-if="data.ruleType !== 'start' && data.ruleType !== 'end'" class="node-actions">
              <button class="action-btn" @click.stop="editRule(data.rule)">✏️</button>
              <button class="action-btn danger" @click.stop="deleteRule(data.rule)">🗑️</button>
            </div>
          </div>
        </template>
      </VueFlow>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditModal && editingNode" class="modal-overlay" @click="showEditModal = false">
      <div class="modal-content" @click.stop>
        <h3>{{ isNewRule ? '添加规则' : '编辑规则' }}</h3>
        
        <div class="form-row">
          <label>规则类型</label>
          <select v-model="editForm.type">
            <option value="pick">取码</option>
            <option value="condition">条件判断</option>
          </select>
        </div>
        
        <template v-if="editForm.type === 'pick'">
          <div class="form-row">
            <label>字根位置</label>
            <select v-model="editForm.rootIndex">
              <option :value="1">第1根</option>
              <option :value="2">第2根</option>
              <option :value="3">第3根</option>
              <option :value="4">第4根</option>
              <option :value="-1">末根 (-1)</option>
            </select>
          </div>
          <div class="form-row">
            <label>码位位置</label>
            <select v-model="editForm.codeIndex">
              <option :value="1">首码 (1)</option>
              <option :value="2">次码 (2)</option>
              <option :value="3">三码 (3)</option>
              <option :value="4">末码 (4)</option>
              <option :value="-1">末码 (-1)</option>
            </select>
          </div>
          <div class="form-row">
            <label>下一节点</label>
            <select v-model="editForm.nextNode">
              <option value="">继续执行下一规则</option>
              <option v-for="opt in branchOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
            </select>
          </div>
        </template>
        
        <template v-if="editForm.type === 'condition'">
          <div class="form-row">
            <label>条件类型</label>
            <select v-model="editForm.conditionType">
              <option value="root_exists">存在第N个根</option>
              <option value="root_has_code">第N个根存在第M码</option>
              <option value="root_count">字根数量≥N</option>
            </select>
          </div>
          <div class="form-row">
            <label>N值（字根位置）</label>
            <input type="number" v-model.number="editForm.conditionValue" min="1" max="10" />
          </div>
          <div v-if="editForm.conditionType === 'root_has_code'" class="form-row">
            <label>M值（码位位置）</label>
            <input type="number" v-model.number="editForm.conditionCodeIndex" min="1" max="4" />
          </div>
          <div class="form-row">
            <label>条件为真时跳转</label>
            <select v-model="editForm.trueBranch">
              <option value="">继续执行下一规则</option>
              <option v-for="opt in branchOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
            </select>
          </div>
          <div class="form-row">
            <label>条件为假时跳转</label>
            <select v-model="editForm.falseBranch">
              <option value="">继续执行下一规则</option>
              <option v-for="opt in branchOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
            </select>
          </div>
        </template>
        
        <div class="modal-actions">
          <button class="btn btn-ghost" @click="showEditModal = false">取消</button>
          <button class="btn" @click="saveRule">保存</button>
        </div>
      </div>
    </div>
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

.flow-wrapper {
  flex: 1;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
}

.rule-flow {
  width: 100%;
  height: 100%;
}

/* 自定义节点样式 */
.rule-node {
  padding: 12px 16px;
  border-radius: 8px;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.rule-node:hover {
  transform: scale(1.02);
}

.rule-node.start {
  background: rgba(0, 180, 42, 0.15);
  border: 2px solid var(--success);
  color: var(--success);
}

.rule-node.end {
  background: rgba(245, 63, 63, 0.15);
  border: 2px solid var(--danger);
  color: var(--danger);
}

.rule-node.pick {
  background: var(--bg);
  border: 1px solid var(--primary);
  color: var(--primary);
}

.rule-node.condition {
  background: rgba(114, 46, 209, 0.15);
  border: 2px solid var(--purple);
  color: var(--purple);
}

.node-icon {
  font-size: 16px;
}

.node-label {
  font-weight: 500;
  font-size: 13px;
}

.node-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg3);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--primary-bg);
}

.action-btn.danger:hover {
  background: rgba(245, 63, 63, 0.2);
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg2);
  border-radius: 12px;
  padding: 24px;
  min-width: 360px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--shadow2);
}

.modal-content h3 {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
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

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>

<!-- 全局 Vue Flow 样式修复 -->
<style>
/* 控制器面板样式 */
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
  flex-shrink: 0 !important;
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
  max-width: 14px !important;
  max-height: 14px !important;
}

/* 节点基础样式 - 移除默认边框和选中样式 */
.vue-flow__node {
  border: none !important;
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 8px !important;
  outline: none !important;
}

.vue-flow__node.selected,
.vue-flow__node:focus {
  outline: none !important;
  box-shadow: none !important;
}

/* 边样式 */
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

/* MiniMap 样式 */
.vue-flow__minimap {
  background: var(--bg2) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
}
</style>
