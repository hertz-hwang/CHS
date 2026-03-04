<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useEngine } from '../composables/useEngine'
import { ConfigScheme, exportConfig } from '../engine/config'
import Icon from './Icon.vue'

const { 
  toast, getSchemes, schemesVersion, currentSchemeId, 
  switchScheme, saveCurrentToScheme, createNewScheme, 
  importScheme, exportSchemeAsync, removeScheme, renameSchemeById, 
  copySchemeAsync, initSchemes, getConfig
} = useEngine()

// 对话框显示状态
const showDialog = defineModel<boolean>({ default: false })

// 方案列表
const schemes = computed(() => {
  schemesVersion.value // 依赖触发
  return getSchemes()
})

// 当前选中的方案（用于编辑）
const editingScheme = ref<ConfigScheme | null>(null)
const editDialogType = ref<'new' | 'edit' | 'none'>('none')

// 表单数据
const formData = ref({
  name: '',
  author: '',
  description: ''
})

// 文件输入引用
const fileInput = ref<HTMLInputElement>()

// 初始化
onMounted(async () => {
  await initSchemes()
})

// 关闭对话框
function closeDialog() {
  showDialog.value = false
  editDialogType.value = 'none'
  editingScheme.value = null
  formData.value = { name: '', author: '', description: '' }
}

// 切换方案
async function onSelectScheme(scheme: ConfigScheme) {
  if (currentSchemeId.value === scheme.id) return
  
  const success = await switchScheme(scheme.id)
  if (success) {
    toast(`已切换到方案: ${scheme.name}`)
  } else {
    toast('切换方案失败', 3000)
  }
}

// 打开新建对话框
function openNewDialog() {
  const config = getConfig()
  formData.value = {
    name: '',
    author: config.meta?.author || '',
    description: ''
  }
  editDialogType.value = 'new'
  editingScheme.value = null
}

// 打开编辑对话框
function openEditDialog(scheme: ConfigScheme, event: Event) {
  event.stopPropagation()
  if (scheme.isExample) {
    toast('官方示例方案不能编辑')
    return
  }
  editingScheme.value = scheme
  formData.value = {
    name: scheme.name,
    author: scheme.author,
    description: scheme.description
  }
  editDialogType.value = 'edit'
}

// 保存方案
function saveScheme() {
  const name = formData.value.name.trim()
  if (!name) {
    toast('请输入方案名称')
    return
  }
  
  if (editDialogType.value === 'new') {
    // 创建新方案
    createNewScheme(name, formData.value.author.trim() || '未知作者', formData.value.description.trim())
    toast(`已创建方案: ${name}`)
  } else if (editDialogType.value === 'edit' && editingScheme.value) {
    // 编辑现有方案
    renameSchemeById(
      editingScheme.value.id, 
      name, 
      formData.value.author.trim(),
      formData.value.description.trim()
    )
    toast(`已更新方案: ${name}`)
  }
  
  editDialogType.value = 'none'
  editingScheme.value = null
}

// 复制方案
async function onCopyScheme(scheme: ConfigScheme, event: Event) {
  event.stopPropagation()
  const result = await copySchemeAsync(scheme.id)
  if (result) {
    toast(`已复制方案: ${result.name}`)
  } else {
    toast('复制方案失败', 3000)
  }
}

// 删除方案
function onDeleteScheme(scheme: ConfigScheme, event: Event) {
  event.stopPropagation()
  if (scheme.isExample) {
    toast('官方示例方案不能删除')
    return
  }
  
  if (confirm(`确定要删除方案 "${scheme.name}" 吗？此操作不可恢复。`)) {
    if (removeScheme(scheme.id)) {
      toast(`已删除方案: ${scheme.name}`)
    } else {
      toast('删除方案失败', 3000)
    }
  }
}

// 导出方案
async function onExportScheme(scheme: ConfigScheme, event: Event) {
  event.stopPropagation()
  const toml = await exportSchemeAsync(scheme.id)
  if (!toml) {
    toast('导出方案失败', 3000)
    return
  }
  
  const blob = new Blob([toml], { type: 'application/toml;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${scheme.name}_${scheme.author}.toml`
  a.click()
  URL.revokeObjectURL(a.href)
  toast('已导出方案')
}

// 导入方案
function onImportScheme(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = () => {
    const toml = reader.result as string
    const result = importScheme(toml)
    if (result) {
      toast(`已导入方案: ${result.name}`)
    } else {
      toast('导入方案失败', 3000)
    }
  }
  reader.readAsText(file)
  
  // 清空文件输入
  if (fileInput.value) fileInput.value.value = ''
}

// 触发文件选择
function triggerFileInput() {
  fileInput.value?.click()
}

// 应用当前配置到方案
function saveCurrentTo(id: string) {
  if (saveCurrentToScheme(id)) {
    toast('已保存当前配置到方案')
  } else {
    toast('保存失败', 3000)
  }
}

// 导出当前配置
function exportCurrentConfig() {
  const config = getConfig()
  const toml = exportConfig(config)
  const blob = new Blob([toml], { type: 'application/toml;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const name = config.meta?.name || '未命名配置'
  const author = config.meta?.author || '未知作者'
  a.download = `${name}_${author}.toml`
  a.click()
  URL.revokeObjectURL(a.href)
  toast('已导出当前配置')
}
</script>

<template>
  <Teleport to="body">
    <!-- 主对话框 -->
    <div class="overlay" :class="{ show: showDialog && editDialogType === 'none' }" @click.self="closeDialog">
      <div class="modal scheme-modal">
        <div class="modal-header">
          <h2>配置方案管理</h2>
          <button class="close-btn" @click="closeDialog">
            <Icon name="close" :size="20" />
          </button>
        </div>
        
        <div class="modal-body">
          <!-- 操作栏 -->
          <div class="action-bar">
            <button class="btn btn-primary" @click="openNewDialog">
              <Icon name="new" :size="16" />
              <span>新建方案</span>
            </button>
            <button class="btn btn-ghost" @click="triggerFileInput">
              <Icon name="import" :size="16" />
              <span>导入方案</span>
            </button>
            <input ref="fileInput" type="file" accept=".toml" style="display:none" @change="onImportScheme" />
          </div>
          
          <!-- 方案列表 -->
          <div class="scheme-list">
            <div 
              v-for="scheme in schemes" 
              :key="scheme.id"
              class="scheme-item"
              :class="{ 
                active: currentSchemeId === scheme.id,
                example: scheme.isExample 
              }"
              @click="onSelectScheme(scheme)"
            >
              <div class="scheme-info">
                <div class="scheme-name">
                  {{ scheme.name }}
                  <span v-if="scheme.isExample" class="badge">官方示例</span>
                  <span v-if="currentSchemeId === scheme.id" class="badge active-badge">当前</span>
                </div>
                <div class="scheme-meta">
                  <span class="author">{{ scheme.author }}</span>
                  <span class="date">{{ scheme.updated }}</span>
                </div>
                <div v-if="scheme.description" class="scheme-desc">{{ scheme.description }}</div>
              </div>
              
              <div class="scheme-actions">
                <button class="action-btn" title="编辑" @click="openEditDialog(scheme, $event)">
                  <Icon name="edit" :size="16" />
                </button>
                <button class="action-btn" title="复制" @click="onCopyScheme(scheme, $event)">
                  <Icon name="copy" :size="16" />
                </button>
                <button class="action-btn" title="导出" @click="onExportScheme(scheme, $event)">
                  <Icon name="export" :size="16" />
                </button>
                <button 
                  v-if="!scheme.isExample" 
                  class="action-btn danger" 
                  title="删除" 
                  @click="onDeleteScheme(scheme, $event)"
                >
                  <Icon name="delete" :size="16" />
                </button>
              </div>
            </div>
            
            <div v-if="schemes.length === 0" class="empty-state">
              <p>暂无配置方案</p>
              <p class="hint">点击上方按钮创建或导入方案</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 新建/编辑对话框 -->
    <div class="overlay" :class="{ show: editDialogType !== 'none' }" @click.self="editDialogType = 'none'">
      <div class="modal edit-modal">
        <h2>{{ editDialogType === 'new' ? '新建方案' : '编辑方案信息' }}</h2>
        
        <div class="form-group">
          <label>方案名称 <span class="required">*</span></label>
          <input 
            type="text" 
            v-model="formData.name" 
            placeholder="请输入方案名称"
            @keydown.enter="saveScheme"
          />
        </div>
        
        <div class="form-group">
          <label>作者</label>
          <input 
            type="text" 
            v-model="formData.author" 
            placeholder="请输入作者名称"
            @keydown.enter="saveScheme"
          />
        </div>
        
        <div class="form-group">
          <label>描述</label>
          <textarea 
            v-model="formData.description" 
            placeholder="请输入方案描述（可选）"
            rows="3"
          ></textarea>
        </div>
        
        <div class="actions">
          <button class="btn btn-ghost" @click="editDialogType = 'none'">取消</button>
          <button class="btn btn-primary" @click="saveScheme">
            {{ editDialogType === 'new' ? '创建' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.overlay.show {
  opacity: 1;
  pointer-events: auto;
}

.modal {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow2);
  max-height: 90vh;
  overflow: hidden;
}

.scheme-modal {
  width: 600px;
  max-width: 95vw;
}

.edit-modal {
  width: 400px;
  max-width: 95vw;
  padding: 24px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--bg3);
  color: var(--text);
}

.modal-body {
  padding: 16px 20px;
  max-height: calc(90vh - 60px);
  overflow-y: auto;
}

.action-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.btn-primary {
  background: var(--primary);
  color: white;
  border: none;
}

.btn-primary:hover {
  background: var(--primary-light);
  transform: translateY(-1px);
}

.btn-ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-ghost:hover {
  background: var(--bg3);
  border-color: var(--primary);
}

.scheme-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scheme-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scheme-item:hover {
  border-color: var(--primary);
  transform: translateX(4px);
}

.scheme-item.active {
  border-color: var(--primary);
  background: var(--primary-bg);
}

.scheme-item.example {
  background: linear-gradient(135deg, var(--bg) 0%, rgba(255, 193, 7, 0.05) 100%);
}

.scheme-info {
  flex: 1;
  min-width: 0;
}

.scheme-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  background: var(--warning-bg);
  color: var(--warning);
}

.active-badge {
  background: var(--primary);
  color: white;
}

.scheme-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text2);
}

.scheme-desc {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text2);
  line-height: 1.4;
}

.scheme-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.scheme-item:hover .scheme-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: var(--primary-bg);
  border-color: var(--primary);
  color: var(--primary);
}

.action-btn.danger:hover {
  background: rgba(220, 53, 69, 0.1);
  border-color: var(--danger);
  color: var(--danger);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text2);
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  margin-top: 8px;
  font-size: 13px;
}

/* 编辑对话框样式 */
.edit-modal h2 {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text2);
  margin-bottom: 6px;
}

.form-group .required {
  color: var(--danger);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: var(--primary);
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--text3);
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

@media (max-width: 600px) {
  .scheme-modal {
    width: 100%;
    max-width: 100%;
    border-radius: 0;
    max-height: 100vh;
  }
  
  .scheme-actions {
    opacity: 1;
  }
}
</style>