<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { useEngine } from '../../composables/useEngine'
import { TransformRuleConfig } from '../../engine/config'
import { IDSTransformer, TransformResult } from '../../engine/transformer'

const { engine, toast, refreshStats, saveCurrentConfig, transformerDraft, clearTransformerDraft } = useEngine()

const rules = ref<TransformRuleConfig[]>([])
const previewResults = ref<Map<string, TransformResult>>(new Map())
const showPreview = ref(false)
const editingIndex = ref<number | null>(null)
const showModal = ref(false)

// 拖拽排序状态
const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

// 编辑表单
const form = ref<TransformRuleConfig>({
  name: '',
  mode: 'regex',
  pattern: '',
  replacement: '',
} as TransformRuleConfig)

// 从 engine 加载已有的转换器
onMounted(() => {
  const existingRules = engine.transformer?.getRules() || []
  if (existingRules.length > 0) {
    rules.value = [...existingRules]
  }
})

// 监听 rules 变化，自动保存到配置
watch(rules, () => {
  saveCurrentConfig()
}, { deep: true })

watch(transformerDraft, (draft) => {
  if (!draft) return
  editingIndex.value = null
  form.value = { ...draft }
  showModal.value = true
  clearTransformerDraft()
}, { immediate: true })

function openAddModal() {
  editingIndex.value = null
  form.value = {
    name: '',
    mode: 'regex',
    pattern: '',
    replacement: '',
  } as TransformRuleConfig
  showModal.value = true
}

function openEditModal(index: number) {
  editingIndex.value = index
  form.value = { ...rules.value[index] }
  showModal.value = true
}

function saveRule() {
  if (!form.value.name) {
    toast('请输入转换器名称')
    return
  }
  if (form.value.mode === 'regex' && !form.value.pattern) {
    toast('请输入匹配模式')
    return
  }

  if (editingIndex.value !== null) {
    rules.value[editingIndex.value] = { ...form.value }
  } else {
    rules.value.push({ ...form.value })
  }

  applyRules()
  showModal.value = false
  toast(editingIndex.value !== null ? '转换器已更新' : '转换器已添加')
}

function deleteRule(index: number) {
  rules.value.splice(index, 1)
  applyRules()
  toast('转换器已删除')
}

function toggleRule(index: number) {
  rules.value[index].enabled = !rules.value[index].enabled
  applyRules()
}

function applyRules() {
  const t = new IDSTransformer(rules.value)
  engine.setTransformer(t)
  
  // 收集要添加和删除的字根
  const rootsToAdd: string[] = []
  const rootsToRemove: string[] = []
  
  // 自动将转换器中的命名字根加入 roots
  const namedRoots = t.getNamedRoots()
  rootsToAdd.push(...namedRoots)
  
  // 处理每条转换器对字根集的影响
  for (const rule of rules.value) {
    if (rule.enabled === false) continue
    
    const pattern = rule.mode === 'regex' ? rule.pattern : rule.component
    const replacement = rule.mode === 'regex' ? rule.replacement : rule.replace_with
    
    if (!pattern || !replacement) continue
    
    // 检查 pattern 和 replacement 是否包含结构符
    const patternHasStructure = /[⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻]/.test(pattern)
    const replacementHasStructure = /[⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻]/.test(replacement)
    
    // 情况1：无结构符 → 有结构符（字根细化）
    // 例如：「尤」→「⿺尢丶」，「尤」应从字根集移除，「尢」「丶」应加入
    if (!patternHasStructure && replacementHasStructure) {
      // 从 pattern 中提取单个汉字（排除正则语法）
      if (rule.mode === 'regex') {
        const simplified = pattern.replace(/[.*+?^${}()|[\]\\]/g, '')
        for (const char of simplified) {
          if (/\p{Script=Han}/u.test(char)) {
            rootsToRemove.push(char)
          }
        }
      } else {
        for (const char of pattern) {
          if (/\p{Script=Han}/u.test(char) && !isStructureChar(char)) {
            rootsToRemove.push(char)
          }
        }
      }
      
      // 从替换结果中提取部件，自动加入字根集
      const components = extractComponents(replacement)
      for (const comp of components) {
        if (!comp.startsWith('{') && !comp.endsWith('}')) {
          rootsToAdd.push(comp)
        }
      }
    }
    
    // 情况2：有结构符 → 有结构符（拆分规则改变）
    // 例如：「⿸𠂇⿰丨(.*)」→「⿸{在字框}$1」，原部件保持不变
    // 这种情况不做任何字根操作，只是改变了拆分规则
    
    // 情况3：无结构符 → 无结构符（简单替换）
    // 例如：「A」→「B」，不需要特殊处理
  }
  
  // 批量更新字根集（会自动保存到 localStorage）
  if (rootsToRemove.length > 0) {
    engine.removeRoots(rootsToRemove)
  }
  if (rootsToAdd.length > 0) {
    engine.addRoots(rootsToAdd)
  }
  
  refreshStats()
}

// 从 IDS 字符串中提取所有部件（排除结构符和命名字根）
function extractComponents(ids: string): string[] {
  const components: string[] = []
  let i = 0
  
  while (i < ids.length) {
    const char = ids[i]
    
    // 跳过结构符
    if (isStructureChar(char)) {
      i++
      continue
    }
    
    // 处理命名字根 {xxx}
    if (char === '{') {
      const end = ids.indexOf('}', i)
      if (end >= 0) {
        components.push(ids.substring(i, end + 1))
        i = end + 1
        continue
      }
    }
    
    // 处理普通汉字
    if (/\p{Script=Han}/u.test(char)) {
      components.push(char)
    }
    
    i++
  }
  
  return components
}

// 判断是否是 IDS 结构符
function isStructureChar(char: string): boolean {
  return ['⿰', '⿱', '⿲', '⿳', '⿴', '⿵', '⿶', '⿷', '⿸', '⿹', '⿺', '⿻'].includes(char)
}

function runPreview() {
  if (!engine.decomp.size) {
    toast('请先加载 IDS 数据')
    return
  }
  const t = new IDSTransformer(rules.value)
  previewResults.value = t.previewAll(engine.decomp)
  showPreview.value = true
}

const previewList = computed(() => {
  const list: { char: string; original: string; transformed: string }[] = []
  for (const [char, result] of previewResults.value) {
    list.push({ char, original: result.original, transformed: result.transformed })
  }
  return list.slice(0, 200) // 限制显示数量
})

// 拖拽排序功能
function onDragStart(event: DragEvent, index: number) {
  draggedIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragEnd() {
  draggedIndex.value = null
  dragOverIndex.value = null
}

function onDragOver(event: DragEvent, index: number) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(event: DragEvent, targetIndex: number) {
  event.preventDefault()
  
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) {
    return
  }
  
  // 重新排序
  const sourceIndex = draggedIndex.value
  const newRules = [...rules.value]
  const [removed] = newRules.splice(sourceIndex, 1)
  newRules.splice(targetIndex, 0, removed)
  
  rules.value = newRules
  applyRules()
  
  toast(`转换器已移动到第 ${targetIndex + 1} 位`)
  
  draggedIndex.value = null
  dragOverIndex.value = null
}

// 上移/下移按钮
function moveRuleUp(index: number) {
  if (index <= 0) return
  const newRules = [...rules.value]
  ;[newRules[index - 1], newRules[index]] = [newRules[index], newRules[index - 1]]
  rules.value = newRules
  applyRules()
  toast('转换器已上移')
}

function moveRuleDown(index: number) {
  if (index >= rules.value.length - 1) return
  const newRules = [...rules.value]
  ;[newRules[index], newRules[index + 1]] = [newRules[index + 1], newRules[index]]
  rules.value = newRules
  applyRules()
  toast('转换器已下移')
}
</script>

<template>
  <div class="ids-transformer-panel">
    <div class="ids-transformer-head">
      <span>🔄 IDS 转换器</span>
      <div class="toolbar-actions">
        <span class="rule-count">当前 {{ rules.length }} 条转换器</span>
        <button class="btn btn-success btn-sm" @click="openAddModal">+ 新建转换</button>
        <button class="btn btn-sm" @click="runPreview" :disabled="rules.length === 0">预览效果</button>
      </div>
    </div>
    <div class="ids-transformer-body">

      <div v-if="rules.length === 0" style="color:var(--text2);font-size:13px">
        暂无转换器，点击「新建转换」添加 IDS 转换器
      </div>

      <div v-else class="rule-list">
        <div 
          v-for="(rule, index) in rules" 
          :key="index" 
          class="rule-item" 
          :class="{ 
            disabled: rule.enabled === false,
            dragging: draggedIndex === index,
            'drag-over': dragOverIndex === index && draggedIndex !== index
          }"
          draggable="true"
          @dragstart="onDragStart($event, index)"
          @dragend="onDragEnd"
          @dragover="onDragOver($event, index)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, index)"
        >
          <div class="rule-header">
            <span class="drag-handle" title="拖拽排序">⋮⋮</span>
            <span class="rule-priority">{{ index + 1 }}</span>
            <span class="rule-name">{{ rule.name }}</span>
            <span class="rule-mode">{{ rule.mode === 'regex' ? '正则' : '可视化' }}</span>
            <label class="toggle">
              <input type="checkbox" :checked="rule.enabled !== false" @change="toggleRule(index)" />
              <span class="slider"></span>
            </label>
          </div>
          <div class="rule-detail">
            <template v-if="rule.mode === 'regex'">
              <code>{{ rule.pattern }}</code> → <code>{{ rule.replacement }}</code>
            </template>
            <template v-else>
              {{ rule.match_type }} → {{ rule.replace_with }}
            </template>
          </div>
          <div class="rule-actions">
            <button 
              class="btn btn-sm btn-outline icon-btn" 
              @click="moveRuleUp(index)" 
              :disabled="index === 0"
              title="上移（提高优先级）"
            >↑</button>
            <button 
              class="btn btn-sm btn-outline icon-btn" 
              @click="moveRuleDown(index)" 
              :disabled="index === rules.length - 1"
              title="下移（降低优先级）"
            >↓</button>
            <button class="btn btn-sm btn-outline" @click="openEditModal(index)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="deleteRule(index)">删除</button>
          </div>
        </div>
      </div>

      <!-- 预览结果 -->
      <div v-if="showPreview" class="preview-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h4 style="margin:0">预览结果 ({{ previewResults.size }} 字受影响)</h4>
          <button class="btn btn-sm btn-outline" @click="showPreview = false">关闭</button>
        </div>
        <div v-if="previewList.length === 0" style="color:var(--text2)">无匹配结果</div>
        <table v-else class="data-table">
          <thead>
            <tr><th>字</th><th>原始 IDS</th><th>转换后</th></tr>
          </thead>
          <tbody>
            <tr v-for="item in previewList" :key="item.char">
              <td class="char-col">{{ item.char }}</td>
              <td style="font-family:monospace;font-size:12px">{{ item.original }}</td>
              <td style="font-family:monospace;font-size:12px;color:var(--accent)">{{ item.transformed }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <ModalDialog :visible="showModal" :title="editingIndex !== null ? '编辑转换' : '新建转换'" @close="showModal = false">
    <div class="form-group">
      <label>转换器名称</label>
      <input v-model="form.name" type="text" placeholder="如：落字框转换" />
    </div>
    <div class="form-group">
      <label>模式类型</label>
      <select v-model="form.mode">
        <option value="regex">正则表达式</option>
        <option value="visual">可视化模式</option>
      </select>
    </div>

    <template v-if="form.mode === 'regex'">
      <div class="form-group">
        <label>匹配模式</label>
        <input v-model="form.pattern" type="text" placeholder="如：⿱艹氵(.*)" />
        <small style="color:var(--text2)">支持正则语法，可用 $1 $2 等捕获组</small>
      </div>
      <div class="form-group">
        <label>替换为</label>
        <input v-model="form.replacement" type="text" placeholder="如：⿸{落字框}$1" />
      </div>
    </template>

    <template v-else>
      <div class="form-group">
        <label>匹配类型</label>
        <select v-model="form.match_type">
          <option value="structure">结构匹配</option>
          <option value="component">部件匹配</option>
          <option value="full">完整匹配</option>
        </select>
      </div>
      <div class="form-group" v-if="form.match_type === 'structure'">
        <label>目标结构</label>
        <input v-model="form.structure" type="text" placeholder="如：⿱" />
      </div>
      <div class="form-group">
        <label>目标部件</label>
        <input v-model="form.component" type="text" placeholder="如：艹" />
      </div>
      <div class="form-group">
        <label>替换为</label>
        <input v-model="form.replace_with" type="text" placeholder="如：{落字框}" />
      </div>
    </template>

    <template #actions>
      <button class="btn btn-outline" @click="showModal = false">取消</button>
      <button class="btn" @click="saveRule">保存</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.ids-transformer-panel {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
  box-shadow: var(--shadow);
  max-height: 500px;
  display: flex;
  flex-direction: column;
}

.ids-transformer-head {
  padding: 14px 20px;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-count {
  color: var(--text2);
  font-size: 12px;
  font-weight: normal;
}

.ids-transformer-body {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  max-height: 400px;
}

.rule-list { 
  display: flex; 
  flex-direction: column; 
  gap: 8px; 
  padding-right: 4px;
}
.rule-item {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s;
  cursor: grab;
}
.rule-item:active { cursor: grabbing; }
.rule-item.disabled { opacity: 0.5; }
.rule-item.dragging {
  opacity: 0.5;
  border: 2px dashed var(--accent);
  background: var(--bg2);
}
.rule-item.drag-over {
  border: 2px solid var(--accent);
  background: var(--bg2);
}
.rule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.drag-handle {
  color: var(--text2);
  cursor: grab;
  font-size: 12px;
  user-select: none;
  padding: 2px;
}
.drag-handle:hover { color: var(--text1); }
.rule-priority {
  background: var(--accent);
  color: white;
  font-size: 10px;
  font-weight: 600;
  min-width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rule-name { font-weight: 500; flex: 1; }
.rule-mode { font-size: 11px; color: var(--text2); background: var(--bg2); padding: 2px 6px; border-radius: 4px; }
.rule-detail { font-size: 12px; color: var(--text2); margin-bottom: 8px; }
.rule-detail code { background: var(--bg2); padding: 2px 4px; border-radius: 4px; font-family: monospace; }
.rule-actions { display: flex; gap: 4px; }
.icon-btn {
  min-width: 28px;
  padding: 0 6px;
  font-weight: bold;
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toggle { position: relative; width: 36px; height: 20px; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider {
  position: absolute; cursor: pointer; inset: 0;
  background: var(--border); border-radius: 10px; transition: 0.2s;
}
.toggle input:checked + .slider { background: var(--accent); }
.toggle .slider::before {
  content: ''; position: absolute; width: 14px; height: 14px; left: 3px; bottom: 3px;
  background: white; border-radius: 50%; transition: 0.2s;
}
.toggle input:checked + .slider::before { transform: translateX(16px); }
.preview-panel {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;
}
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: var(--text2); margin-bottom: 4px; }
.form-group input, .form-group select { width: 100%; }
</style>
