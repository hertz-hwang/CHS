import { reactive, ref, readonly } from 'vue'
import { CharsHijack } from '@/engine/engine'

const engine = new CharsHijack()

const stats = reactive({ decomp: 0, roots: 0, strokes: 0, freq: 0 })
const currentPage = ref('load')
const selectedChar = ref<string | null>(null)
const toastMsg = ref('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function refreshStats() {
  stats.decomp = engine.decomp.size
  stats.roots = engine.roots.size
  stats.strokes = engine.strokes.size
  stats.freq = engine.freq.size
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

export function useEngine() {
  return {
    engine, stats: readonly(stats), refreshStats,
    currentPage, switchPage,
    selectedChar, selectChar,
    toastMsg: readonly(toastMsg), toastVisible: readonly(toastVisible), toast,
    loadDefaultData,
  }
}
