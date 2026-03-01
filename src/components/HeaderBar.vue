<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useEngine } from "../composables/useEngine"
import { useTheme } from "../composables/useTheme"
import { exportConfig, parseConfig, saveConfigToStorage, createDefaultConfig } from "../engine/config"

const { engine, refreshStats, toast, stats, configVersion, getConfig, applyConfig } = useEngine()
const { theme, toggleTheme, isDark } = useTheme()

const fileInput = ref<HTMLInputElement>()

// 配置名和作者名（计算属性，依赖 configVersion 实现响应式更新）
const configName = computed(() => {
  configVersion.value // 依赖 configVersion，当配置更新时重新计算
  return getConfig().meta?.name || '未命名配置'
})
const configAuthor = computed(() => {
  configVersion.value // 依赖 configVersion，当配置更新时重新计算
  return getConfig().meta?.author || '未知作者'
})

// 新建配置对话框
const showNewConfigDialog = ref(false)
const newConfigName = ref('')
const newConfigAuthor = ref('')

// 编辑配置信息对话框
const showEditMetaDialog = ref(false)
const editConfigName = ref('')
const editConfigAuthor = ref('')

// 打开新建配置对话框
function openNewConfigDialog() {
  newConfigName.value = ''
  newConfigAuthor.value = ''
  showNewConfigDialog.value = true
}

// 确认新建配置
function confirmNewConfig() {
  const name = newConfigName.value.trim() || '未命名配置'
  const author = newConfigAuthor.value.trim() || '未知作者'
  const config = createDefaultConfig(name, author)
  engine.applyConfig(config)
  refreshStats()
  saveConfigToStorage(engine.getConfig())
  showNewConfigDialog.value = false
  toast(`已创建新配置: ${name}`)
}

// 新建配置（旧方法，已被对话框替代）
function newConfig() {
  openNewConfigDialog()
}

// 导入配置
function importConfig(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const config = parseConfig(reader.result as string)
      engine.applyConfig(config)
      refreshStats()
      saveConfigToStorage(engine.getConfig())
      toast(`配置已加载: ${Object.keys(config.roots).length} 字根, ${config.rules.length} 规则`)
    } catch (err) {
      toast('配置文件解析失败')
      console.error(err)
    }
  }
  reader.readAsText(file)
  if (fileInput.value) fileInput.value.value = ''
}

// 导出配置
function exportConfigFile() {
  const config = engine.getConfig()
  const toml = exportConfig(config)
  const blob = new Blob([toml], { type: 'application/toml;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  // 文件名格式：配置名_作者名.toml
  const name = config.meta.name || '未命名配置'
  const author = config.meta.author || '未知作者'
  a.download = `${name}_${author}.toml`
  a.click()
  URL.revokeObjectURL(a.href)
  toast('配置已导出')
}

// 触发文件选择
function triggerFileInput() {
  fileInput.value?.click()
}

// 打开编辑配置信息对话框
function openEditMetaDialog() {
  const config = getConfig()
  editConfigName.value = config.meta?.name || ''
  editConfigAuthor.value = config.meta?.author || ''
  showEditMetaDialog.value = true
}

// 确认编辑配置信息
function confirmEditMeta() {
  const config = getConfig()
  config.meta = config.meta || { version: '1.0' }
  config.meta.name = editConfigName.value.trim() || '未命名配置'
  config.meta.author = editConfigAuthor.value.trim() || '未知作者'
  applyConfig(config)
  saveConfigToStorage(config)
  showEditMetaDialog.value = false
  toast('配置信息已更新')
}

// 监听配置变化，自动保存到 localStorage
watch(configVersion, () => {
  saveConfigToStorage(engine.getConfig())
})
</script>

<template>
  <!-- 新建配置对话框 -->
  <Teleport to="body">
    <div class="overlay" :class="{ show: showNewConfigDialog }" @click.self="showNewConfigDialog = false">
      <div class="modal">
        <h2>新建配置</h2>
        <div class="form-group">
          <label>配置名称</label>
          <input 
            type="text" 
            v-model="newConfigName" 
            placeholder="请输入配置名称"
            @keydown.enter="confirmNewConfig"
          />
        </div>
        <div class="form-group">
          <label>作者名称</label>
          <input 
            type="text" 
            v-model="newConfigAuthor" 
            placeholder="请输入作者名称"
            @keydown.enter="confirmNewConfig"
          />
        </div>
        <div class="actions">
          <button class="btn btn-ghost" @click="showNewConfigDialog = false">取消</button>
          <button class="btn btn-primary" @click="confirmNewConfig">创建</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 编辑配置信息对话框 -->
  <Teleport to="body">
    <div class="overlay" :class="{ show: showEditMetaDialog }" @click.self="showEditMetaDialog = false">
      <div class="modal">
        <h2>编辑配置信息</h2>
        <div class="form-group">
          <label>配置名称</label>
          <input 
            type="text" 
            v-model="editConfigName" 
            placeholder="请输入配置名称"
            @keydown.enter="confirmEditMeta"
          />
        </div>
        <div class="form-group">
          <label>作者名称</label>
          <input 
            type="text" 
            v-model="editConfigAuthor" 
            placeholder="请输入作者名称"
            @keydown.enter="confirmEditMeta"
          />
        </div>
        <div class="actions">
          <button class="btn btn-ghost" @click="showEditMetaDialog = false">取消</button>
          <button class="btn btn-primary" @click="confirmEditMeta">保存</button>
        </div>
      </div>
    </div>
  </Teleport>

  <header class="header">
    <div class="header-left">
      <div class="title">
        <h1>字劫 <span class="title-suffix">CHS</span><span class="ver">v0.1.3</span></h1>
      </div>
      <div class="stats">
        <div class="stat-item">
          <span class="stat-label">拆分</span>
          <span class="stat-value">{{ stats.decomp.toLocaleString() }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">字根</span>
          <span class="stat-value">{{ stats.roots.toLocaleString() }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">笔画</span>
          <span class="stat-value">{{ stats.strokes.toLocaleString() }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">字频</span>
          <span class="stat-value">{{ stats.freq.toLocaleString() }}</span>
        </div>
      </div>
    </div>
    
    <div class="header-right">
      <!-- 配置信息展示 -->
      <div class="config-info" @click="openEditMetaDialog" title="点击编辑配置信息">
        <span class="config-name">{{ configName }}</span>
        <span class="config-author">{{ configAuthor }}</span>
      </div>
      
      <!-- 配置操作 -->
      <div class="config-actions">
        <input ref="fileInput" type="file" accept=".toml" style="display:none" @change="importConfig" />
        <button class="btn btn-sm btn-ghost" @click="newConfig" title="新建配置">
          <span class="btn-icon">📄</span>
          <span class="btn-text">新建</span>
        </button>
        <button class="btn btn-sm btn-ghost" @click="triggerFileInput" title="导入配置">
          <span class="btn-icon">📥</span>
          <span class="btn-text">导入</span>
        </button>
        <button class="btn btn-sm btn-ghost" @click="exportConfigFile" title="导出配置">
          <span class="btn-icon">📤</span>
          <span class="btn-text">导出</span>
        </button>
      </div>
      
    </div>
  </header>
</template>

<style scoped>
.header {
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
}

h1 {
  font-size: 26px;
  font-weight: 700;
  color: var(--primary);
  letter-spacing: 2px;
  margin: 0;
}

.title-suffix {
  font-size: 18px;
  font-weight: 600;
}

.ver {
  font-size: 11px;
  color: var(--text2);
  background: var(--bg3);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
  margin-left: 8px;
  vertical-align: middle;
}

.stats {
  display: flex;
  gap: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  color: var(--text2);
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.config-info:hover .config-name,
.config-info:hover .config-author {
  filter: brightness(1.1);
}

.config-name {
  font-size: 16px;
  font-weight: 800;
  color: var(--primary);
  background: rgba(0, 102, 180, 0.15);
  padding: 4px 10px;
  border-radius: 8px;
}

.config-author {
  font-size: 14px;
  font-weight: 500;
  color: var(--success);
  background: rgba(0, 180, 42, 0.15);
  padding: 4px 10px;
  border-radius: 8px;
}

.config-author::before {
  content: '';
  margin-right: 0px;
  color: var(--text3);
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.config-actions .btn {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-icon {
  font-size: 14px;
}

.btn-text {
  font-size: 13px;
}

.divider-v {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 8px;
}

.theme-toggle {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s ease;
}

.theme-toggle:hover {
  background: var(--primary-bg);
  border-color: var(--primary);
  transform: scale(1.05);
}

@media (max-width: 900px) {
  .stats {
    display: none;
  }
  
  .config-info {
    padding: 4px 8px;
  }
  
  .config-name {
    font-size: 12px;
  }
  
  .config-author {
    display: none;
  }
  
  .btn-text {
    display: none;
  }
  
  .config-actions .btn {
    padding: 6px 10px;
  }
}

/* 新建配置对话框样式 */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
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
  border-radius: 8px;
  padding: 24px;
  min-width: 360px;
  max-width: 400px;
  box-shadow: var(--shadow2);
}

.modal h2 {
  margin: 0 0 16px 0;
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

.form-group input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}

.form-group input:focus {
  border-color: var(--primary);
}

.form-group input::placeholder {
  color: var(--text3);
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
