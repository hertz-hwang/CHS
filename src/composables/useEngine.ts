import { reactive, ref, readonly, computed } from 'vue'
import { CharsHijack } from '@/engine/engine'
import { 
  UserConfig, parseConfig, exportConfig, saveConfigToStorage, loadConfigFromStorage,
  ConfigScheme, ConfigSchemeWithData, listSchemes, loadScheme, saveScheme, deleteScheme, 
  renameScheme, createScheme, importSchemeFromToml, exportSchemeToToml, duplicateScheme,
  getCurrentSchemeId, setCurrentSchemeId, initExampleSchemes, loadExampleScheme
} from '@/engine/config'
import { loadRoots2PuaMap, bracedRootToPua, convertBracedRootsToPua, isBracedRoot, needsPuaFont, getPuaFontName } from '@/utils/pua'

// 字集选项定义
export interface CharsetOption {
  id: string        // 文件名（不含扩展名）
  name: string      // 显示名称
  file: string      // 文件路径
}

export const CHARSET_OPTIONS: CharsetOption[] = [
  { id: 'gb2312', name: 'GB2312', file: '/data/gb2312.txt' },
  { id: 'kc6000', name: '科测6000', file: '/data/kc6000.txt' },
  { id: 'tg8105', name: '通规8105', file: '/data/tg8105.txt' },
  { id: 'cjk', name: '基本区', file: '/data/cjk.txt' },
  { id: 'all', name: '全部', file: '/data/all.txt' },
]

// 字词频数据源选项定义
export interface FreqSourceOption {
  id: string        // 数据源ID
  name: string      // 显示名称
  file: string      // 文件路径
}

export const FREQ_SOURCE_OPTIONS: FreqSourceOption[] = [
  { id: 'kc6000', name: '科测', file: '/data/kc6000.txt' },
  { id: 'dictionary', name: '自带', file: '/data/dictionary.txt' },
]

const engine = new CharsHijack()

// 当前选中的字集ID（默认值 'all'）
const currentCharsetId = ref<string>('all')

// 当前字词频数据源ID（默认值 'kc6000'，即科测数据）
const currentFreqSourceId = ref<string>('kc6000')

// 字词频版本号，用于触发相关更新
const freqVersion = ref(0)

// 在模块初始化时立即加载保存的配置
const savedConfig = loadConfigFromStorage()
if (savedConfig) {
  engine.applyConfig(savedConfig)
  // 恢复字集设置（从 engine 的内部状态获取，确保同步）
  const charset = engine.getConfig().charset || 'all'
  if (CHARSET_OPTIONS.some(o => o.id === charset)) {
    currentCharsetId.value = charset
  }
}

const stats = reactive({ decomp: 0, roots: 0, strokes: 0, freq: 0 })

// 有效的页面名称列表
const validPages = ['data', 'element', 'split', 'rule', 'code', 'evaluate', 'practice', 'coverage', 'suggest', 'load']

// 从 URL hash 获取初始页面
function getInitialPage(): string {
  const hash = window.location.hash.slice(1) // 移除 # 号
  return validPages.includes(hash) ? hash : 'data'
}

const currentPage = ref(getInitialPage())
const navCollapsed = ref(false)

// 初始化时设置 URL hash（如果当前没有 hash 或 hash 无效）
if (typeof window !== 'undefined' && !window.location.hash) {
  window.history.replaceState(null, '', `#${currentPage.value}`)
}

// 监听 URL hash 变化（浏览器前进/后退）
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1)
    if (validPages.includes(hash) && hash !== currentPage.value) {
      currentPage.value = hash
    }
  })
}
const selectedChar = ref<string | null>(null)
const searchChar = ref<string | null>(null)  // 用于页面间传递查询字
const toastMsg = ref('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

// 响应式版本号，用于触发计算属性更新
const rootsVersion = ref(0)

// 配置版本号，用于触发配置相关的更新
const configVersion = ref(0)

// 字集版本号，用于触发字集相关的更新
const charsetVersion = ref(0)

function refreshStats() {
  stats.decomp = engine.decomp.size
  stats.roots = engine.roots.size
  stats.strokes = engine.strokes.size
  stats.freq = engine.freq.size
  engine.clearCache() // 清除拆分缓存，确保重新计算
  rootsVersion.value++ // 触发依赖 roots 的计算属性更新
  configVersion.value++ // 触发配置相关的更新
}

function toast(msg: string, duration = 2500) {
  toastMsg.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, duration)
}

function switchPage(name: string) {
  currentPage.value = name
  // 更新 URL hash（不触发 hashchange 事件，避免重复处理）
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', `#${name}`)
  }
}
function selectChar(ch: string) { selectedChar.value = ch }
function setSearchChar(ch: string) { searchChar.value = ch }
function clearSearchChar() { searchChar.value = null }

async function fetchText(path: string): Promise<string | null> {
  try {
    const res = await fetch(path)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function loadDefaultData(): Promise<{ loaded: string[]; failed: string[] }> {
  const loaded: string[] = []
  const failed: string[] = []

  // 加载 IDS 数据
  const ids = await fetchText('/data/sky_ids.txt')
  if (ids) { engine.loadSkyIDS(ids); loaded.push('IDS') }
  else failed.push('IDS')

  // 加载自定义 IDS
  const custom = await fetchText('/data/custom_ids.txt')
  if (custom) { engine.loadCustomIDS(custom); loaded.push('自定义IDS') }

  // 加载笔画数据
  const stroke = await fetchText('/data/stroke.txt')
  if (stroke) { engine.loadStrokes(stroke); loaded.push('笔画') }

  // 加载拼音数据（始终从 dictionary.txt 加载）
  const dict = await fetchText('/data/dictionary.txt')
  if (dict) { engine.loadPinyin(dict); loaded.push('拼音') }

  // 加载默认字词频数据（科测数据）
  const defaultFreqSource = FREQ_SOURCE_OPTIONS.find(o => o.id === currentFreqSourceId.value)
  if (defaultFreqSource) {
    const freqText = await fetchText(defaultFreqSource.file)
    if (freqText) {
      engine.loadFreq(freqText)
      loaded.push(`${defaultFreqSource.name}字频`)
    }
  }

  // 加载所有字集文件
  for (const option of CHARSET_OPTIONS) {
    const content = await fetchText(option.file)
    if (content) {
      engine.loadCharset(option.id, content)
      loaded.push(`${option.name}字集`)
    } else {
      failed.push(`${option.name}字集`)
    }
  }

  // 加载 PUA 字根映射
  await loadRoots2PuaMap()

  refreshStats()
  return { loaded, failed }
}

// 切换字集
function setCharset(charsetId: string): boolean {
  const option = CHARSET_OPTIONS.find(o => o.id === charsetId)
  if (!option) return false
  
  currentCharsetId.value = charsetId
  charsetVersion.value++ // 触发字集相关更新
  
  // 同步更新 engine 内部的字集设置
  engine.setCharset(charsetId)
  
  // 保存字集设置到配置
  const config = engine.getConfig()
  saveConfigToStorage(config)
  
  return true
}

// 获取当前字集名称
function getCurrentCharsetName(): string {
  const option = CHARSET_OPTIONS.find(o => o.id === currentCharsetId.value)
  return option?.name || '全部'
}

// 获取当前字集的汉字列表
function getCurrentCharset(): string[] {
  charsetVersion.value // 依赖触发
  return engine.getCharset(currentCharsetId.value)
}

// 切换字词频数据源
async function setFreqSource(freqSourceId: string): Promise<boolean> {
  const option = FREQ_SOURCE_OPTIONS.find(o => o.id === freqSourceId)
  if (!option) return false
  
  // 清除现有字词频数据
  engine.clearFreq()
  
  // 加载新的字词频数据
  const text = await fetchText(option.file)
  if (!text) return false
  
  engine.loadFreq(text)
  currentFreqSourceId.value = freqSourceId
  freqVersion.value++
  refreshStats()
  
  return true
}

// 获取当前字词频数据源名称
function getCurrentFreqSourceName(): string {
  const option = FREQ_SOURCE_OPTIONS.find(o => o.id === currentFreqSourceId.value)
  return option?.name || '科测'
}

// ============ 配置管理方法 ============

function applyConfig(config: UserConfig): void {
  engine.applyConfig(config)
  // 恢复字集设置（优先使用配置中的字集，否则使用默认值 'all'）
  const charsetId = config.charset || 'all'
  if (CHARSET_OPTIONS.some(o => o.id === charsetId)) {
    currentCharsetId.value = charsetId
    charsetVersion.value++
  }
  refreshStats()
}

function getConfig(): UserConfig {
  return engine.getConfig()
}

function importConfigFromToml(toml: string): boolean {
  try {
    const config = parseConfig(toml)
    applyConfig(config)
    return true
  } catch (e) {
    console.error('Failed to parse config:', e)
    return false
  }
}

function exportConfigToToml(): string {
  return exportConfig(getConfig())
}

function saveCurrentConfig(): void {
  saveConfigToStorage(getConfig())
}

function loadSavedConfig(): boolean {
  const config = loadConfigFromStorage()
  if (config) {
    applyConfig(config)
    return true
  }
  return false
}

function toggleNavCollapsed() {
  navCollapsed.value = !navCollapsed.value
}

// ============ 配置方案管理方法 ============

// 当前方案ID
const currentSchemeId = ref<string | null>(null)

// 方案列表版本号（用于触发更新）
const schemesVersion = ref(0)

// 初始化配置方案系统
async function initSchemes(): Promise<void> {
  await initExampleSchemes()
  const savedId = getCurrentSchemeId()
  if (savedId) {
    currentSchemeId.value = savedId
  }
  schemesVersion.value++
}

// 获取所有方案列表
function getSchemes(): ConfigScheme[] {
  schemesVersion.value // 依赖触发
  return listSchemes()
}

// 切换方案
async function switchScheme(id: string): Promise<boolean> {
  try {
    // 如果当前有方案且不是示例方案，先保存当前配置到该方案
    // 示例方案是只读的，不需要保存
    if (currentSchemeId.value && currentSchemeId.value !== id && !currentSchemeId.value.startsWith('example_')) {
      saveCurrentToScheme(currentSchemeId.value)
    }

    // 尝试加载示例配置
    let schemeData = await loadExampleScheme(id)

    // 如果不是示例或加载失败，尝试从 localStorage 加载
    if (!schemeData) {
      schemeData = loadScheme(id)
    }

    if (!schemeData) return false

    applyConfig(schemeData.config)
    currentSchemeId.value = id
    setCurrentSchemeId(id)
    // 保存配置到 localStorage，确保刷新后能恢复
    saveConfigToStorage(getConfig())
    schemesVersion.value++
    return true
  } catch (e) {
    console.error('Failed to switch scheme:', e)
    return false
  }
}

// 保存当前配置到方案
function saveCurrentToScheme(id: string): boolean {
  const schemes = listSchemes()
  const scheme = schemes.find(s => s.id === id)
  if (!scheme) return false
  
  const config = getConfig()
  
  // 更新方案的更新时间
  scheme.updated = new Date().toISOString().split('T')[0]
  
  // 同步 meta 信息
  config.meta = {
    ...config.meta,
    name: scheme.name,
    author: scheme.author,
    description: scheme.description,
  }
  
  saveScheme(scheme, config)
  schemesVersion.value++
  return true
}

// 创建新方案
function createNewScheme(name: string, author: string, description: string = ''): ConfigScheme {
  const scheme = createScheme(name, author, description)
  const config = getConfig()
  
  // 使用当前配置作为新方案的配置
  config.meta = {
    version: '1.0',
    name,
    author,
    created: scheme.created,
    description,
  }
  
  saveScheme(scheme, config)
  schemesVersion.value++
  return scheme
}

// 导入方案
function importScheme(toml: string, name?: string, author?: string): ConfigSchemeWithData | null {
  const schemeData = importSchemeFromToml(toml, name, author)
  if (!schemeData) return null
  
  saveScheme(schemeData, schemeData.config)
  schemesVersion.value++
  return schemeData
}

// 导出方案
function exportScheme(id: string): string | null {
  // 先检查是否为示例
  if (id.startsWith('example_')) {
    // 示例需要异步加载，这里返回 null，需要用 exportSchemeAsync
    return null
  }
  
  const schemeData = loadScheme(id)
  if (!schemeData) return null
  
  return exportSchemeToToml(schemeData)
}

// 异步导出方案（支持示例）
async function exportSchemeAsync(id: string): Promise<string | null> {
  let schemeData = await loadExampleScheme(id)
  if (!schemeData) {
    schemeData = loadScheme(id)
  }
  if (!schemeData) return null
  
  return exportSchemeToToml(schemeData)
}

// 删除方案
function removeScheme(id: string): boolean {
  const result = deleteScheme(id)
  if (result) {
    schemesVersion.value++
    // 如果删除的是当前方案，清除标记
    if (currentSchemeId.value === id) {
      currentSchemeId.value = null
    }
  }
  return result
}

// 重命名方案
function renameSchemeById(id: string, newName: string, newAuthor?: string, newDescription?: string): boolean {
  const result = renameScheme(id, newName, newAuthor, newDescription)
  if (result) {
    schemesVersion.value++
  }
  return result
}

// 复制方案
function copyScheme(id: string, newName?: string): ConfigSchemeWithData | null {
  // 对于示例方案，需要异步加载
  if (id.startsWith('example_')) {
    // 这里需要特殊处理，返回 null，需要用 copySchemeAsync
    return null
  }
  
  const result = duplicateScheme(id, newName)
  if (result) {
    schemesVersion.value++
  }
  return result
}

// 异步复制方案（支持示例）
async function copySchemeAsync(id: string, newName?: string): Promise<ConfigSchemeWithData | null> {
  let schemeData = await loadExampleScheme(id)
  if (!schemeData) {
    schemeData = loadScheme(id)
  }
  if (!schemeData) return null
  
  const now = new Date().toISOString().split('T')[0]
  const scheme: ConfigScheme = {
    id: `scheme_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: newName || `${schemeData.name} (副本)`,
    author: schemeData.author,
    created: now,
    updated: now,
    description: schemeData.description,
  }
  
  const config = { ...schemeData.config }
  config.meta = {
    ...config.meta,
    name: scheme.name,
    author: scheme.author,
    created: scheme.created,
    description: scheme.description,
  }
  
  saveScheme(scheme, config)
  schemesVersion.value++
  return { ...scheme, config }
}

// 应用方案到当前配置（不切换方案ID）
function applySchemeToCurrent(id: string): boolean {
  // 对于示例方案需要异步处理
  if (id.startsWith('example_')) {
    return false
  }
  
  const schemeData = loadScheme(id)
  if (!schemeData) return false
  
  applyConfig(schemeData.config)
  return true
}

// 异步应用方案到当前配置（支持示例）
async function applySchemeToCurrentAsync(id: string): Promise<boolean> {
  let schemeData = await loadExampleScheme(id)
  if (!schemeData) {
    schemeData = loadScheme(id)
  }
  if (!schemeData) return false
  
  applyConfig(schemeData.config)
  return true
}

// 获取当前方案信息
function getCurrentScheme(): ConfigScheme | null {
  if (!currentSchemeId.value) return null
  const schemes = listSchemes()
  return schemes.find(s => s.id === currentSchemeId.value) || null
}

export function useEngine() {
  return {
    engine, stats: readonly(stats), refreshStats, rootsVersion, configVersion,
    currentPage, switchPage,
    navCollapsed: readonly(navCollapsed), toggleNavCollapsed,
    selectedChar, selectChar,
    searchChar: readonly(searchChar), setSearchChar, clearSearchChar,
    toastMsg: readonly(toastMsg), toastVisible: readonly(toastVisible), toast,
    loadDefaultData,
    // 配置管理
    applyConfig, getConfig, importConfigFromToml, exportConfigToToml, saveCurrentConfig, loadSavedConfig,
    // 字集管理
    currentCharsetId: readonly(currentCharsetId),
    charsetVersion,
    setCharset,
    getCurrentCharsetName,
    getCurrentCharset,
    // 字词频数据源管理
    currentFreqSourceId: readonly(currentFreqSourceId),
    freqVersion,
    setFreqSource,
    getCurrentFreqSourceName,
    // PUA 字根转换
    bracedRootToPua,
    convertBracedRootsToPua,
    isBracedRoot,
    needsPuaFont,
    getPuaFontName,
    // 配置方案管理
    currentSchemeId: readonly(currentSchemeId),
    schemesVersion,
    initSchemes,
    getSchemes,
    switchScheme,
    saveCurrentToScheme,
    createNewScheme,
    importScheme,
    exportScheme,
    exportSchemeAsync,
    removeScheme,
    renameSchemeById,
    copyScheme,
    copySchemeAsync,
    applySchemeToCurrent,
    applySchemeToCurrentAsync,
    getCurrentScheme,
  }
}
