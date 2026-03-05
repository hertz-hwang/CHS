<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useEngine, CHARSET_OPTIONS, FREQ_SOURCE_OPTIONS, CharsetOption, FreqSourceOption } from "../composables/useEngine"
import { useTheme } from "../composables/useTheme"
import { exportConfig, parseConfig, saveConfigToStorage, createDefaultConfig } from "../engine/config"
import Icon from './Icon.vue'
import ConfigManager from './ConfigManager.vue'

const { engine, refreshStats, toast, stats, configVersion, getConfig, applyConfig, currentCharsetId, setCharset, getCurrentCharsetName, initSchemes, getCurrentScheme, currentFreqSourceId, setFreqSource, getCurrentFreqSourceName } = useEngine()
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

// 编辑方案信息对话框
const showEditMetaDialog = ref(false)
const editConfigName = ref('')
const editConfigAuthor = ref('')
const editConfigDesc = ref('')

// 配置方案管理对话框
const showConfigManager = ref(false)

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
  saveConfigToStorage(getConfig())
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
      applyConfig(config)
      saveConfigToStorage(getConfig())
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
  const config = getConfig()
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

// 打开编辑方案信息对话框
function openEditMetaDialog() {
  const config = getConfig()
  editConfigName.value = config.meta?.name || ''
  editConfigAuthor.value = config.meta?.author || ''
  editConfigDesc.value = config.meta?.description || ''
  showEditMetaDialog.value = true
}

// 确认编辑方案信息
function confirmEditMeta() {
  const config = getConfig()
  config.meta = config.meta || { version: '1.0' }
  config.meta.name = editConfigName.value.trim() || '未命名配置'
  config.meta.author = editConfigAuthor.value.trim() || '未知作者'
  config.meta.description = editConfigDesc.value.trim()
  applyConfig(config)
  saveConfigToStorage(config)
  showEditMetaDialog.value = false
  toast('配置信息已更新')
}

// 监听配置变化，自动保存到 localStorage
watch(configVersion, () => {
  saveConfigToStorage(getConfig())
})

// 字集切换事件处理
function onCharsetChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const charsetId = target.value
  if (setCharset(charsetId)) {
    const option = CHARSET_OPTIONS.find(o => o.id === charsetId)
    toast(`已切换到字集: ${option?.name || charsetId}`)
  }
}

// 字词频数据源切换事件处理
async function onFreqSourceChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const freqSourceId = target.value
  const option = FREQ_SOURCE_OPTIONS.find(o => o.id === freqSourceId)
  if (await setFreqSource(freqSourceId)) {
    toast(`已切换到字频数据: ${option?.name || freqSourceId}`)
  }
}
</script>

<template>
  <!-- 新建配置对话框 -->
  <Teleport to="body">
    <div class="overlay" :class="{ show: showNewConfigDialog }" @click.self="showNewConfigDialog = false">
      <div class="modal">
        <h2>新建方案</h2>
        <div class="form-group">
          <label>方案名称</label>
          <input 
            type="text" 
            v-model="newConfigName" 
            placeholder="请输入方案名称"
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

  <!-- 编辑方案信息对话框 -->
  <Teleport to="body">
    <div class="overlay" :class="{ show: showEditMetaDialog }" @click.self="showEditMetaDialog = false">
      <div class="modal">
        <h2>编辑方案信息</h2>
        <div class="form-group">
          <label>方案名称</label>
          <input 
            type="text" 
            v-model="editConfigName" 
            placeholder="请输入方案名称"
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
        <div class="form-group">
          <label>描述</label>
          <textarea 
            v-model="editConfigDesc" 
            placeholder="请输入配置描述（可选）"
            rows="3"
          ></textarea>
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
        <h1>字劫 <span class="title-suffix">CHS</span><span class="ver">v0.1.8</span></h1>
      </div>
      
      <!-- 配置操作 -->
      <div class="config-actions">
        <button class="btn btn-sm btn-primary" @click="showConfigManager = true" title="配置方案管理">
          <Icon name="folder" :size="16" class="btn-icon" />
          <span class="btn-text">方案</span>
        </button>
      </div>
      
      <!-- 配置信息展示 -->
      <div class="config-info" @click="openEditMetaDialog" title="点击编辑方案信息">
        <span class="config-name">{{ configName }}</span>
        <span class="config-author">{{ configAuthor }}</span>
      </div>
    </div>
    
    <div class="header-right">
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
      
      <!-- 字集选择器 -->
      <div class="stat-item charset-item">
        <span class="stat-label">字集</span>
        <select 
          class="stat-value charset-select" 
          :value="currentCharsetId" 
          @change="onCharsetChange($event)"
          title="选择字集"
        >
          <option v-for="option in CHARSET_OPTIONS" :key="option.id" :value="option.id">
            {{ option.name }}
          </option>
        </select>
      </div>
      
      <!-- 字词频数据源选择器 -->
      <div class="stat-item freq-item">
        <span class="stat-label">字频</span>
        <select 
          class="stat-value freq-select" 
          :value="currentFreqSourceId" 
          @change="onFreqSourceChange($event)"
          title="选择字频数据源"
        >
          <option v-for="option in FREQ_SOURCE_OPTIONS" :key="option.id" :value="option.id">
            {{ option.name }}
          </option>
        </select>
      </div>
    </div>
  </header>
  
  <!-- 配置方案管理对话框 -->
  <ConfigManager v-model="showConfigManager" />
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

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.btn-sm.btn-primary {
  background: var(--primary);
  color: white;
  border: none;
}

.btn-sm.btn-primary:hover {
  background: var(--primary-light);
  transform: translateY(-1px);
}

.btn-sm.btn-ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-sm.btn-ghost:hover {
  background: var(--bg3);
  border-color: var(--primary);
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

.form-group input,
.form-group textarea {
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

/* 字集选择器样式 */
.charset-item {
  margin-left: 8px;
}

.charset-select {
  padding: 2px 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-bg);
  border: 1px solid var(--primary);
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
  min-width: 70px;
  text-align: center;
}

.charset-select:hover {
  background: var(--primary);
  color: white;
}

.charset-select:focus {
  box-shadow: 0 0 0 2px rgba(0, 102, 180, 0.2);
}

@media (max-width: 900px) {
  .charset-item {
    display: none;
  }
}

/* 字词频数据源选择器样式 */
.freq-item {
  margin-left: 4px;
}

.freq-select {
  padding: 2px 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--success);
  background: rgba(0, 180, 42, 0.15);
  border: 1px solid var(--success);
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
  min-width: 50px;
  text-align: center;
}

.freq-select:hover {
  background: var(--success);
  color: white;
}

.freq-select:focus {
  box-shadow: 0 0 0 2px rgba(0, 180, 42, 0.2);
}

@media (max-width: 900px) {
  .freq-item {
    display: none;
  }
}
</style>
