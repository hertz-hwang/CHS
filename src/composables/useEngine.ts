import { reactive, ref, readonly, computed } from 'vue'
import { CharsHijack } from '@/engine/engine'
import { 
  UserConfig, parseConfig, exportConfig, saveConfigToStorage, loadConfigFromStorage,
  ConfigScheme, ConfigSchemeWithData, listSchemes, loadScheme, saveScheme, deleteScheme, 
  renameScheme, createScheme, importSchemeFromToml, exportSchemeToToml, duplicateScheme,
  getCurrentSchemeId, setCurrentSchemeId, initExampleSchemes, loadExampleScheme,
  createDefaultConfig
} from '@/engine/config'
import { loadRoots2PuaMap, bracedRootToPua, convertBracedRootsToPua, isBracedRoot, needsPuaFont, getPuaFontName } from '@/utils/pua'

// 缓存版本号 - 更新此版本号会强制重新加载数据
const CACHE_VERSION = '0.1.9'
const CACHE_KEY_PREFIX = 'chars_hijack_cache_'
const CACHE_VERSION_KEY = `${CACHE_KEY_PREFIX}version`
const CUSTOM_FREQ_KEY = 'chars_hijack_custom_freq'
const CUSTOM_FREQ_NAME_KEY = 'chars_hijack_custom_freq_name'
const CURRENT_FREQ_SOURCE_KEY = 'chars_hijack_current_freq_source'

// 缓存的数据项定义
interface CachedData {
  ids: string | null          // IDS 数据
  customIds: string | null    // 自定义 IDS
  stroke: string | null       // 笔画数据
  pinyin: string | null       // 拼音数据
  freq: string | null         // 字词频数据
  charsets: Record<string, string>  // 字集数据
}

// 加载进度回调类型
export interface LoadingProgress {
  progress: number
  currentItem: string
  loaded: string[]
  failed: string[]
  items: Array<{ id: string; name: string; status: 'pending' | 'loading' | 'done' | 'error' }>
}

// 加载状态变化回调
type ProgressCallback = (progress: LoadingProgress) => void

// 字集选项定义
export interface CharsetOption {
  id: string        // 文件名（不含扩展名）
  name: string      // 显示名称
  file: string      // 文件路径
}

const BASE = import.meta.env.BASE_URL

export const CHARSET_OPTIONS: CharsetOption[] = [
  { id: 'gb2312', name: 'GB2312', file: `${BASE}data/gb2312.txt` },
  { id: 'kc6000', name: '科测6000', file: `${BASE}data/kc6000.txt` },
  { id: 'tg8105', name: '通规8105', file: `${BASE}data/tg8105.txt` },
  { id: 'cjk', name: '基本区', file: `${BASE}data/cjk.txt` },
  { id: 'all', name: '全部', file: `${BASE}data/all.txt` },
]

// 字词频数据源选项定义
export interface FreqSourceOption {
  id: string        // 数据源ID
  name: string      // 显示名称
  file?: string     // 文件路径
}

export const FREQ_SOURCE_OPTIONS: FreqSourceOption[] = [
  { id: 'kc6000', name: '科测', file: `${BASE}data/kc6000.txt` },
  { id: 'dictionary', name: '自带', file: `${BASE}data/dictionary.txt` },
  { id: 'custom', name: '自定义上传' },
]

const engine = new CharsHijack()

// 当前选中的字集ID（默认值 'all'）
const currentCharsetId = ref<string>('all')

// 当前字词频数据源ID（默认值 'kc6000'，即科测数据）
const currentFreqSourceId = ref<string>('kc6000')
const customFreqFileName = ref<string>('自定义上传')

if (typeof window !== 'undefined') {
  const savedFreqSourceId = localStorage.getItem(CURRENT_FREQ_SOURCE_KEY)
  if (savedFreqSourceId && FREQ_SOURCE_OPTIONS.some(o => o.id === savedFreqSourceId)) {
    currentFreqSourceId.value = savedFreqSourceId
  }
  const savedCustomFreqName = localStorage.getItem(CUSTOM_FREQ_NAME_KEY)
  if (savedCustomFreqName) {
    customFreqFileName.value = savedCustomFreqName
  }
}

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
const validPages = ['data', 'element', 'split', 'rule', 'code', 'evaluate', 'practice', 'type', 'coverage', 'suggest', 'load']

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

function getCustomFreqText(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CUSTOM_FREQ_KEY)
}

function saveCustomFreqFileName(fileName: string): void {
  customFreqFileName.value = fileName || '自定义上传'
  if (typeof window === 'undefined') return
  trySetStorageItem(CUSTOM_FREQ_NAME_KEY, customFreqFileName.value)
}

function saveCurrentFreqSourceId(freqSourceId: string): void {
  if (typeof window === 'undefined') return
  trySetStorageItem(CURRENT_FREQ_SOURCE_KEY, freqSourceId)
}

function syncFreqCache(text: string): void {
  if (typeof window === 'undefined') return
  trySetStorageItem(`${CACHE_KEY_PREFIX}freq`, text)
  trySetStorageItem(CACHE_VERSION_KEY, CACHE_VERSION)
}

async function getFreqSourceText(freqSourceId: string): Promise<string | null> {
  if (freqSourceId === 'custom') {
    return getCustomFreqText()
  }
  const option = FREQ_SOURCE_OPTIONS.find(o => o.id === freqSourceId)
  if (!option?.file) return null
  return fetchText(option.file)
}

async function loadDefaultData(): Promise<{ loaded: string[]; failed: string[] }> {
  const loaded: string[] = []
  const failed: string[] = []

  // 加载 IDS 数据
  const ids = await fetchText(`${BASE}data/sky_ids.txt`)
  if (ids) { engine.loadSkyIDS(ids); loaded.push('IDS') }
  else failed.push('IDS')

  // 加载自定义 IDS
  const custom = await fetchText(`${BASE}data/custom_ids.txt`)
  if (custom) { engine.loadCustomIDS(custom); loaded.push('自定义IDS') }

  // 加载笔画数据
  const stroke = await fetchText(`${BASE}data/stroke.txt`)
  if (stroke) { engine.loadStrokes(stroke); loaded.push('笔画') }

  // 加载拼音数据（始终从 dictionary.txt 加载）
  const dict = await fetchText(`${BASE}data/dictionary.txt`)
  if (dict) { engine.loadPinyin(dict); loaded.push('拼音') }

  // 加载默认字词频数据（科测数据）
  const freqText = await getFreqSourceText(currentFreqSourceId.value)
  const defaultFreqSource = FREQ_SOURCE_OPTIONS.find(o => o.id === currentFreqSourceId.value)
  if (freqText) {
    engine.loadFreq(freqText)
    loaded.push(`${defaultFreqSource?.name || '当前'}字频`)
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

// ============ 数据缓存管理 ============

// 检查缓存是否有效
function isCacheValid(): boolean {
  const version = localStorage.getItem(CACHE_VERSION_KEY)
  return version === CACHE_VERSION
}

function trySetStorageItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    console.warn(`localStorage 写入失败: ${key}`, e)
    return false
  }
}

// 保存数据到缓存
function saveDataToCache(data: CachedData): void {
  trySetStorageItem(`${CACHE_KEY_PREFIX}ids`, data.ids || '')
  trySetStorageItem(`${CACHE_KEY_PREFIX}customIds`, data.customIds || '')
  trySetStorageItem(`${CACHE_KEY_PREFIX}stroke`, data.stroke || '')
  trySetStorageItem(`${CACHE_KEY_PREFIX}pinyin`, data.pinyin || '')
  trySetStorageItem(`${CACHE_KEY_PREFIX}freq`, data.freq || '')
  trySetStorageItem(`${CACHE_KEY_PREFIX}charsets`, JSON.stringify(data.charsets))
  trySetStorageItem(CACHE_VERSION_KEY, CACHE_VERSION)
}

// 从缓存加载数据
function loadDataFromCache(): CachedData | null {
  try {
    if (!isCacheValid()) return null
    
    const charsetsStr = localStorage.getItem(`${CACHE_KEY_PREFIX}charsets`)
    const charsets = charsetsStr ? JSON.parse(charsetsStr) : {}
    
    return {
      ids: localStorage.getItem(`${CACHE_KEY_PREFIX}ids`) || null,
      customIds: localStorage.getItem(`${CACHE_KEY_PREFIX}customIds`) || null,
      stroke: localStorage.getItem(`${CACHE_KEY_PREFIX}stroke`) || null,
      pinyin: localStorage.getItem(`${CACHE_KEY_PREFIX}pinyin`) || null,
      freq: localStorage.getItem(`${CACHE_KEY_PREFIX}freq`) || null,
      charsets,
    }
  } catch (e) {
    console.warn('读取缓存失败:', e)
    return null
  }
}

// 清除缓存
function clearCache(): void {
  const keys = ['ids', 'customIds', 'stroke', 'pinyin', 'freq', 'charsets']
  keys.forEach(key => localStorage.removeItem(`${CACHE_KEY_PREFIX}${key}`))
  localStorage.removeItem(CACHE_VERSION_KEY)
}

// 带进度回调的数据加载函数
async function loadDefaultDataWithProgress(
  onProgress?: ProgressCallback
): Promise<{ loaded: string[]; failed: string[]; fromCache: boolean }> {
  
  // 定义所有加载项
  const loadingItems: Array<{ id: string; name: string; status: 'pending' | 'loading' | 'done' | 'error' }> = [
    { id: 'ids', name: 'IDS 拆分数据', status: 'pending' },
    { id: 'customIds', name: '自定义 IDS', status: 'pending' },
    { id: 'stroke', name: '笔画数据', status: 'pending' },
    { id: 'pinyin', name: '拼音数据', status: 'pending' },
    { id: 'freq', name: '字词频数据', status: 'pending' },
    { id: 'gb2312', name: 'GB2312 字集', status: 'pending' },
    { id: 'kc6000', name: '科测6000 字集', status: 'pending' },
    { id: 'tg8105', name: '通规8105 字集', status: 'pending' },
    { id: 'cjk', name: '基本区 字集', status: 'pending' },
    { id: 'all', name: '全部 字集', status: 'pending' },
    { id: 'pua', name: 'PUA 字根映射', status: 'pending' },
  ]
  
  const loaded: string[] = []
  const failed: string[] = []
  const totalItems = loadingItems.length
  
  // 更新进度的辅助函数
  const updateProgress = (currentItem: string) => {
    const doneCount = loadingItems.filter(i => i.status === 'done').length
    const errorCount = loadingItems.filter(i => i.status === 'error').length
    const progress = Math.round(((doneCount + errorCount) / totalItems) * 100)
    onProgress?.({
      progress,
      currentItem,
      loaded: [...loaded],
      failed: [...failed],
      items: [...loadingItems]
    })
  }
  
  // 设置加载项状态
  const setItemStatus = (id: string, status: 'loading' | 'done' | 'error') => {
    const item = loadingItems.find(i => i.id === id)
    if (item) item.status = status
  }

  // 先尝试从缓存加载
  const cachedData = loadDataFromCache()
  if (cachedData) {
    // 从缓存加载
    updateProgress('正在从缓存加载...')
    
    // IDS 数据
    setItemStatus('ids', 'loading')
    updateProgress('IDS 拆分数据')
    if (cachedData.ids) {
      engine.loadSkyIDS(cachedData.ids)
      loaded.push('IDS')
      setItemStatus('ids', 'done')
    } else {
      const ids = await fetchText(`${BASE}data/sky_ids.txt`)
      if (ids) {
        engine.loadSkyIDS(ids)
        loaded.push('IDS')
        setItemStatus('ids', 'done')
      } else {
        failed.push('IDS')
        setItemStatus('ids', 'error')
      }
    }
    
    // 自定义 IDS
    setItemStatus('customIds', 'loading')
    updateProgress('自定义 IDS')
    if (cachedData.customIds) {
      engine.loadCustomIDS(cachedData.customIds)
      loaded.push('自定义IDS')
    }
    setItemStatus('customIds', 'done')
    
    // 笔画数据
    setItemStatus('stroke', 'loading')
    updateProgress('笔画数据')
    if (cachedData.stroke) {
      engine.loadStrokes(cachedData.stroke)
      loaded.push('笔画')
      setItemStatus('stroke', 'done')
    } else {
      const stroke = await fetchText(`${BASE}data/stroke.txt`)
      if (stroke) {
        engine.loadStrokes(stroke)
        loaded.push('笔画')
        setItemStatus('stroke', 'done')
      } else {
        failed.push('笔画')
        setItemStatus('stroke', 'error')
      }
    }
    
    // 拼音数据
    setItemStatus('pinyin', 'loading')
    updateProgress('拼音数据')
    if (cachedData.pinyin) {
      engine.loadPinyin(cachedData.pinyin)
      loaded.push('拼音')
      setItemStatus('pinyin', 'done')
    } else {
      const dict = await fetchText(`${BASE}data/dictionary.txt`)
      if (dict) {
        engine.loadPinyin(dict)
        loaded.push('拼音')
        setItemStatus('pinyin', 'done')
      } else {
        failed.push('拼音')
        setItemStatus('pinyin', 'error')
      }
    }
    
    // 字词频数据
    setItemStatus('freq', 'loading')
    updateProgress('字词频数据')
    if (cachedData.freq) {
      engine.loadFreq(cachedData.freq)
      loaded.push('字频')
      setItemStatus('freq', 'done')
    } else {
      const freqText = await getFreqSourceText(currentFreqSourceId.value)
      if (freqText) {
        engine.loadFreq(freqText)
        loaded.push('字频')
        setItemStatus('freq', 'done')
      } else {
        failed.push('字频')
        setItemStatus('freq', 'error')
      }
    }
    
    // 字集数据
    for (const option of CHARSET_OPTIONS) {
      const content = cachedData.charsets[option.id]
      setItemStatus(option.id, 'loading')
      updateProgress(`${option.name} 字集`)
      if (content) {
        engine.loadCharset(option.id, content)
        loaded.push(`${option.id}字集`)
        setItemStatus(option.id, 'done')
      } else {
        const text = await fetchText(option.file)
        if (text) {
          engine.loadCharset(option.id, text)
          loaded.push(`${option.name}字集`)
          setItemStatus(option.id, 'done')
        } else {
          failed.push(`${option.name}字集`)
          setItemStatus(option.id, 'error')
        }
      }
    }
    
    // PUA 映射
    setItemStatus('pua', 'loading')
    updateProgress('PUA 字根映射')
    await loadRoots2PuaMap()
    loaded.push('PUA映射')
    setItemStatus('pua', 'done')
    
    refreshStats()
    updateProgress('加载完成')
    
    return { loaded, failed, fromCache: true }
  }
  
  // 缓存无效，从网络加载
  const cacheData: CachedData = {
    ids: null,
    customIds: null,
    stroke: null,
    pinyin: null,
    freq: null,
    charsets: {}
  }
  
  // 加载 IDS 数据
  setItemStatus('ids', 'loading')
  updateProgress('IDS 拆分数据')
  const ids = await fetchText(`${BASE}data/sky_ids.txt`)
  if (ids) {
    engine.loadSkyIDS(ids)
    cacheData.ids = ids
    loaded.push('IDS')
    setItemStatus('ids', 'done')
  } else {
    failed.push('IDS')
    setItemStatus('ids', 'error')
  }
  
  // 加载自定义 IDS
  setItemStatus('customIds', 'loading')
  updateProgress('自定义 IDS')
  const custom = await fetchText(`${BASE}data/custom_ids.txt`)
  if (custom) {
    engine.loadCustomIDS(custom)
    cacheData.customIds = custom
    loaded.push('自定义IDS')
  }
  setItemStatus('customIds', 'done')
  
  // 加载笔画数据
  setItemStatus('stroke', 'loading')
  updateProgress('笔画数据')
  const stroke = await fetchText(`${BASE}data/stroke.txt`)
  if (stroke) {
    engine.loadStrokes(stroke)
    cacheData.stroke = stroke
    loaded.push('笔画')
    setItemStatus('stroke', 'done')
  } else {
    failed.push('笔画')
    setItemStatus('stroke', 'error')
  }
  
  // 加载拼音数据
  setItemStatus('pinyin', 'loading')
  updateProgress('拼音数据')
  const dict = await fetchText(`${BASE}data/dictionary.txt`)
  if (dict) {
    engine.loadPinyin(dict)
    cacheData.pinyin = dict
    loaded.push('拼音')
    setItemStatus('pinyin', 'done')
  } else {
    failed.push('拼音')
    setItemStatus('pinyin', 'error')
  }
  
  // 加载字词频数据
  setItemStatus('freq', 'loading')
  updateProgress('字词频数据')
  const freqText = await getFreqSourceText(currentFreqSourceId.value)
  if (freqText) {
    engine.loadFreq(freqText)
    cacheData.freq = freqText
    loaded.push('字频')
    setItemStatus('freq', 'done')
  } else {
    failed.push('字频')
    setItemStatus('freq', 'error')
  }
  
  // 加载所有字集文件
  for (const option of CHARSET_OPTIONS) {
    setItemStatus(option.id, 'loading')
    updateProgress(`${option.name} 字集`)
    const content = await fetchText(option.file)
    if (content) {
      engine.loadCharset(option.id, content)
      cacheData.charsets[option.id] = content
      loaded.push(`${option.name}字集`)
      setItemStatus(option.id, 'done')
    } else {
      failed.push(`${option.name}字集`)
      setItemStatus(option.id, 'error')
    }
  }
  
  // 加载 PUA 字根映射
  setItemStatus('pua', 'loading')
  updateProgress('PUA 字根映射')
  await loadRoots2PuaMap()
  loaded.push('PUA映射')
  setItemStatus('pua', 'done')
  
  // 保存到缓存
  saveDataToCache(cacheData)
  
  refreshStats()
  updateProgress('加载完成')
  
  return { loaded, failed, fromCache: false }
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
  const text = await getFreqSourceText(freqSourceId)
  if (!text) return false
  
  engine.loadFreq(text)
  currentFreqSourceId.value = freqSourceId
  saveCurrentFreqSourceId(freqSourceId)
  syncFreqCache(text)
  freqVersion.value++
  refreshStats()
  
  return true
}

function setCustomFreqText(text: string, fileName = '自定义上传'): boolean {
  if (typeof window === 'undefined') return false
  trySetStorageItem(CUSTOM_FREQ_KEY, text)
  saveCustomFreqFileName(fileName)
  currentFreqSourceId.value = 'custom'
  saveCurrentFreqSourceId('custom')
  syncFreqCache(text)
  engine.clearFreq()
  engine.loadFreq(text)
  freqVersion.value++
  refreshStats()
  return true
}

function hasCustomFreqText(): boolean {
  return !!getCustomFreqText()
}

function getFreqSourceOptions(): FreqSourceOption[] {
  return FREQ_SOURCE_OPTIONS.map(option => (
    option.id === 'custom'
      ? { ...option, name: customFreqFileName.value }
      : option
  ))
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
  // 创建空配置，不使用当前配置
  const config = createDefaultConfig(name, author)
  config.meta.description = description
  config.meta.created = scheme.created
  
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
    // 带进度的数据加载
    loadDefaultDataWithProgress,
    // 缓存管理
    clearCache,
    isCacheValid,
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
    customFreqFileName: readonly(customFreqFileName),
    freqVersion,
    getFreqSourceOptions,
    setFreqSource,
    setCustomFreqText,
    hasCustomFreqText,
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
