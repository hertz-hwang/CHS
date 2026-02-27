import { reactive, ref, readonly, computed } from 'vue'
import { CharsHijack } from '@/engine/engine'
import { UserConfig, parseConfig, exportConfig, saveConfigToStorage, loadConfigFromStorage } from '@/engine/config'

const engine = new CharsHijack()

const stats = reactive({ decomp: 0, roots: 0, strokes: 0, freq: 0 })
const currentPage = ref('load')
const selectedChar = ref<string | null>(null)
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
  rootsVersion.value++ // 触发依赖 roots 的计算属性更新
  configVersion.value++ // 触发配置相关的更新
}

function toast(msg: string, duration = 2500) {
  toastMsg.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, duration)
}

function switchPage(name: string) { currentPage.value = name }
function selectChar(ch: string) { selectedChar.value = ch }

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
    toastMsg: readonly(toastMsg), toastVisible: readonly(toastVisible), toast,
    loadDefaultData,
    // 配置管理
    applyConfig, getConfig, importConfigFromToml, exportConfigToToml, saveCurrentConfig, loadSavedConfig,
  }
}