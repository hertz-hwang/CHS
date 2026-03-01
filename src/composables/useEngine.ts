import { reactive, ref, readonly } from 'vue'
import { CharsHijack } from '@/engine/engine'
import { UserConfig, parseConfig, exportConfig, saveConfigToStorage, loadConfigFromStorage } from '@/engine/config'

const engine = new CharsHijack()

// 在模块初始化时立即加载保存的配置
const savedConfig = loadConfigFromStorage()
if (savedConfig) {
  engine.applyConfig(savedConfig)
}

const stats = reactive({ decomp: 0, roots: 0, strokes: 0, freq: 0 })

// 有效的页面名称列表
const validPages = ['data', 'element', 'split', 'rule', 'code', 'coverage', 'suggest', 'load']

// 从 URL hash 获取初始页面
function getInitialPage(): string {
  const hash = window.location.hash.slice(1) // 移除 # 号
  return validPages.includes(hash) ? hash : 'data'
}

const currentPage = ref(getInitialPage())

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

  // 加载字集文件
  const cjk = await fetchText('/data/cjk.txt')
  if (cjk) { engine.loadCharset('cjk', cjk); loaded.push('CJK字集') }

  const tg8105 = await fetchText('/data/tg8105.txt')
  if (tg8105) { engine.loadCharset('tg8105', tg8105); loaded.push('tg8105字集') }

  refreshStats()
  return { loaded, failed }
}

// ============ 配置管理方法 ============

function applyConfig(config: UserConfig): void {
  engine.applyConfig(config)
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

export function useEngine() {
  return {
    engine, stats: readonly(stats), refreshStats, rootsVersion, configVersion,
    currentPage, switchPage,
    selectedChar, selectChar,
    searchChar: readonly(searchChar), setSearchChar, clearSearchChar,
    toastMsg: readonly(toastMsg), toastVisible: readonly(toastVisible), toast,
    loadDefaultData,
    // 配置管理
    applyConfig, getConfig, importConfigFromToml, exportConfigToToml, saveCurrentConfig, loadSavedConfig,
  }
}
