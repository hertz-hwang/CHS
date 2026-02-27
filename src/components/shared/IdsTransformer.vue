<script setup lang="ts">
import { ref, computed } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { useEngine } from '../../composables/useEngine'
import { TransformRuleConfig } from '../../engine/config'
import { IDSTransformer, TransformResult } from '../../engine/transformer'

const { engine, toast, refreshStats } = useEngine()

const rules = ref<TransformRuleConfig[]>([])
const previewResults = ref<Map<string, TransformResult>>(new Map())
const showPreview = ref(false)
const editingIndex = ref<number | null>(null)
const showModal = ref(false)

// 编辑表单
const form = ref<TransformRuleConfig>({
  name: '',
  mode: 'regex',
  pattern: '',
  replacement: '',
} as TransformRuleConfig)

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
    toast('请输入规则名称')
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
  toast(editingIndex.value !== null ? '规则已更新' : '规则已添加')
}

function deleteRule(index: number) {
  rules.value.splice(index, 1)
  applyRules()
  toast('规则已删除')
}

function toggleRule(index: number) {
  rules.value[index].enabled = !rules.value[index].enabled
  applyRules()
}

function applyRules() {
  const t = new IDSTransformer(rules.value)
  engine.setTransformer(t)
  refreshStats()
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
</script>

<template>
  <div class="panel">
    <div class="panel-head">🔄 IDS 转换器</div>
    <div class="panel-body">
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-success" @click="openAddModal">+ 新建规则</button>
        <button class="btn" @click="runPreview" :disabled="rules.length === 0">预览效果</button>
        <span style="color:var(--text2);font-size:12px;line-height:32px">
          当前 {{ rules.length }} 条规则
        </span>
      </div>

      <div v-if="rules.length === 0" style="color:var(--text2);font-size:13px">
        暂无规则，点击「新建规则」添加 IDS 转换规则
      </div>

      <div v-else class="rule-list">
        <div v-for="(rule, index) in rules" :key="index" class="rule-item" :class="{ disabled: rule.enabled === false }">
          <div class="rule-header">
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

  <ModalDialog :visible="showModal" :title="editingIndex !== null ? '编辑规则' : '新建规则'" @close="showModal = false">
    <div class="form-group">
      <label>规则名称</label>
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
.rule-list { display: flex; flex-direction: column; gap: 8px; }
.rule-item {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  transition: all 0.2s;
}
.rule-item.disabled { opacity: 0.5; }
.rule-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rule-name { font-weight: 500; flex: 1; }
.rule-mode { font-size: 11px; color: var(--text2); background: var(--bg2); padding: 2px 6px; border-radius: 4px; }
.rule-detail { font-size: 12px; color: var(--text2); margin-bottom: 8px; }
.rule-detail code { background: var(--bg2); padding: 2px 4px; border-radius: 4px; font-family: monospace; }
.rule-actions { display: flex; gap: 4px; }
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