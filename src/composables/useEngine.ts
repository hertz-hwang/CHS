import { reactive, ref, readonly, computed } from 'vue'
import { CharsHijack } from '@/engine/engine'
import { UserConfig, parseConfig, exportConfig, saveConfigToStorage, loadConfigFromStorage } from '@/engine/config'
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

const engine = new CharsHijack()

// 当前选中的字集ID（默认值 'all'）
const currentCharsetId = ref<string>('all')

// 在模块初始化时立即加载保存的配置
const savedConfig = loadConfigFromStorage()
if (savedConfig) {
  engine.applyConfig(savedConfig)
  // 恢复字集设置
  if (savedConfig.charset) {
    currentCharsetId.value = savedConfig.charset
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

  // 加载字典数据
  const dict = await fetchText('/data/dictionary.txt')
  if (dict) { engine.loadDict(dict); loaded.push('字典') }

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
  
  // 保存字集设置到配置
  const config = engine.getConfig()
  config.charset = charsetId
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

// ============ 配置管理方法 ============

function applyConfig(config: UserConfig): void {
  engine.applyConfig(config)
  // 恢复字集设置
  if (config.charset && CHARSET_OPTIONS.some(o => o.id === config.charset)) {
    currentCharsetId.value = config.charset
    charsetVersion.value++
  }
  refreshStats()
}

function getConfig(): UserConfig {
  const config = engine.getConfig()
  // 包含当前字集信息
  config.charset = currentCharsetId.value
  return config
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
    // PUA 字根转换
    bracedRootToPua,
    convertBracedRootsToPua,
    isBracedRoot,
    needsPuaFont,
    getPuaFontName,
  }
}
