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

export function useEngine() {
  return {
    engine, stats: readonly(stats), refreshStats,
    currentPage, switchPage,
    selectedChar, selectChar,
    toastMsg: readonly(toastMsg), toastVisible: readonly(toastVisible), toast,
  }
}
