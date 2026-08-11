/**
 * 字根练习一 — 元素重复练习 composable
 * 封装卡片数据、Leitner 进度算法、IndexedDB 持久化、字体注册、ZIP 导入等
 */

import { computed, ref, shallowRef, watch } from 'vue'
import { useEngine } from './useEngine'
import { parseFontFamily } from '@/utils/fontParser'
import { parseZip, decodeText } from '@/utils/zipParser'

export interface ElementCard {
  name: string              // 显示名（去除 -[注释]-）
  key: string               // 编码
  hint: string              // 提示（可选）
  originalName: string      // 原始名（含注释标记）
  comments: string[]        // 提取的注释数组
}

export interface HighlightRule {
  lightColor: string
  darkColor: string
  pattern: string
}

export interface ElementPracticeSettings {
  fontFamily: string
  zigenSize: number
  answerSize: number
  inputSize: number
  hintSize: number
  commentSize: number
  gap: number
  firstCode: boolean
  wrapByCount: boolean
  wrapCountThreshold: number
  fontSizeByCount: boolean
  fontSizeCountThreshold: number
  fontSizeWhenLarge: number
  orderMode: boolean
  roundCount: number
  highlightRules: HighlightRule[]
  description: string
}

export interface ImportedFont {
  id: string
  name: string
  format: string
  buffer: ArrayBuffer
}

export const DEFAULT_SETTINGS: ElementPracticeSettings = {
  fontFamily: `Chai Sans, 'Noto Sans SC','Helvetica Neue',Helvetica,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','微软雅黑',Arial,sans-serif`,
  zigenSize: 5.5,
  answerSize: 1.2,
  inputSize: 1.3,
  hintSize: 1.2,
  commentSize: 2,
  gap: 8,
  firstCode: false,
  wrapByCount: false,
  wrapCountThreshold: 10,
  fontSizeByCount: false,
  fontSizeCountThreshold: 5,
  fontSizeWhenLarge: 3,
  orderMode: false,
  roundCount: 1,
  highlightRules: [],
  description: '1. 按对会自动跳下一个\n2. 按错会很快重复出现\n3. 五秒内想不起来就按空格'
}

const DB_NAME = 'ZigenPracticeDB'
const DB_VERSION = 1
const SETTINGS_KEY = 'zigen_memory_settings_v3'

let dbInstance: IDBDatabase | null = null
let dbPromise: Promise<IDBDatabase> | null = null

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('fonts')) db.createObjectStore('fonts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('filename')) db.createObjectStore('filename', { keyPath: 'id' })
    }
    req.onsuccess = (e) => { dbInstance = (e.target as IDBOpenDBRequest).result; resolve(dbInstance) }
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function idbPut(storeName: string, item: any): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.put(item)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbGet<T = any>(storeName: string, id: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.get(id)
    req.onsuccess = () => resolve((req.result || null) as T | null)
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(storeName: string, id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbGetAll<T = any>(storeName: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

async function idbClear(storeName: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbCount(storeName: string): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 注册字体到浏览器 FontFaceSet */
async function registerFont(font: ImportedFont): Promise<boolean> {
  try {
    const blob = new Blob([font.buffer])
    const url = URL.createObjectURL(blob)
    const face = new FontFace(font.name, `url(${url})`)
    await face.load()
    document.fonts.add(face)
    URL.revokeObjectURL(url)
    return true
  } catch {
    try {
      const face = new FontFace(font.name, font.buffer)
      await face.load()
      document.fonts.add(face)
      return true
    } catch (e) {
      console.warn('FontFace 注册失败:', font.name, e)
      return false
    }
  }
}

/** 从二进制 Buffer 读取为 ArrayBuffer */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/** HSL → 十六进制颜色 */
export function hsl2hex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)))
      .toString(16).padStart(2, '0')
  }
  return '#' + f(0) + f(8) + f(4)
}

/** 提取卡片名中 -[...]- 形式的注释，返回分割段数组 */
export function parseCardSegments(originalName: string): Array<{ t: 'root' | 'comment'; v: string; i: number }> {
  const segments: Array<{ t: 'root' | 'comment'; v: string; i: number }> = []
  const regex = /-\[(.+?)\]-/g
  let m: RegExpExecArray | null
  let lastIdx = 0
  while ((m = regex.exec(originalName)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ t: 'root', v: originalName.substring(lastIdx, m.index), i: segments.length })
    }
    segments.push({ t: 'comment', v: m[1], i: segments.length })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < originalName.length) {
    segments.push({ t: 'root', v: originalName.substring(lastIdx), i: segments.length })
  }
  return segments
}

/** 获取卡片名去除注释后的纯字符数 */
export function getPureCharCount(name: string): number {
  return (name || '').replace(/-\[.+?\]-/g, '').replace(/\s+/g, '').length
}

const MOVE_STEPS = [2, 4, 8, 12, 20, 30, 60, 100]

export function useElementPractice() {
  const { engine, rootsVersion } = useEngine()

  // ===== 状态 =====
  const cards = shallowRef<ElementCard[]>([])
  const records = shallowRef<Array<[number, number]>>([])
  const currentFileName = ref('未导入元素数据')
  const settings = ref<ElementPracticeSettings>({ ...DEFAULT_SETTINGS })
  const importedFonts = shallowRef<ImportedFont[]>([])
  const progressAsPercent = ref(false)
  const useEngineData = ref(true) // 默认从引擎字根加载

  // ===== 计算属性 =====
  const currentCard = computed<ElementCard | null>(() => {
    if (!cards.value.length || !records.value.length) return null
    const firstRec = records.value[0]
    if (!firstRec) return null
    return cards.value[firstRec[1]] || null
  })

  const isFirst = computed(() => {
    if (!records.value.length) return true
    return records.value[0][0] === -1
  })

  const progressCount = computed(() => {
    return records.value.filter(r => r[0] > 1).length
  })

  const progressText = computed(() => {
    const total = cards.value.length
    const mastered = progressCount.value
    if (progressAsPercent.value && total > 0) {
      return Math.round(mastered / total * 100) + '%'
    }
    return `${mastered}/${total}`
  })

  const progressPercent = computed(() => {
    if (!cards.value.length) return 0
    return (progressCount.value / cards.value.length) * 100
  })

  const allComplete = computed(() => {
    if (settings.value.orderMode) {
      return records.value.length > 0 && records.value[0][0] === 8
    }
    return records.value.length > 0 && records.value.every(r => r[0] === 8)
  })

  // ===== 内部：数据初始化 =====
  function initRecords() {
    records.value = cards.value.map((_, idx) => [-1, idx] as [number, number])
  }

  function syncSortAndCard() {
    if (!cards.value.length) return
    const firstRec = records.value[0]
    if (!firstRec) return
  }

  /** 从引擎字根构建默认卡片集 */
  function buildEngineCards() {
    rootsVersion.value // 依赖触发
    const newCards: ElementCard[] = []
    for (const [root, rootCode] of engine.rootCodes) {
      const code = (rootCode.main || '') + (rootCode.sub || '') + (rootCode.supplement || '')
      if (!code) continue
      const relatedChars = engine.findCharsDeep(root)
      const freqSum = relatedChars.reduce((sum, ch) => sum + (engine.freq.get(ch) || 0), 0)
      newCards.push({
        name: root,
        key: code,
        hint: '',
        originalName: root,
        comments: []
      })
      void freqSum // 暂未使用，预留扩展
    }
    cards.value = newCards
    if (newCards.length > 0) {
      currentFileName.value = '引擎字根'
    }
  }

  // ===== 答题逻辑 =====
  function answer(correct: boolean) {
    if (!cards.value.length || !records.value.length) return
    const firstRec = records.value[0]
    if (!firstRec) return

    if (!correct) {
      firstRec[0] = -1
      records.value = [...records.value]
      return { correct: false }
    }

    if (settings.value.orderMode) {
      firstRec[0] = 8
      records.value = [...records.value]
      return { correct: true, finished: records.value[0][0] === 8 }
    }

    firstRec[0] = firstRec[0] + 1

    const maxIndex = cards.value.length - 1
    let step: number
    const count = firstRec[0]
    if (count >= MOVE_STEPS.length) {
      firstRec[0] = 8
      step = maxIndex
    } else {
      step = MOVE_STEPS[count]
      if (step > maxIndex) step = maxIndex
    }
    const rec = [firstRec[0], firstRec[1]] as [number, number]
    const newRecords = [...records.value]
    newRecords.copyWithin(0, 1, step + 1)
    newRecords[step] = rec
    records.value = newRecords
    return { correct: true }
  }

  function restartProgress() {
    if (!cards.value.length) return
    initRecords()
    settings.value.roundCount = 1
    settings.value = { ...settings.value }
    saveSettings()
  }

  // ===== 数据导入 =====
  function parseCardsFromText(text: string): ElementCard[] {
    const lines = text.split(/\r?\n/)
    const newCards: ElementCard[] = []
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const parts = line.split('\t')
      if (parts.length < 2 || !parts[0] || !parts[1]) continue
      const nameWithComment = parts[0]
      const commentMatches = [...nameWithComment.matchAll(/-\[(.+?)\]-/g)]
      const displayName = nameWithComment.replace(/-\[.+?\]-/g, '').replace(/\s+/g, '')
      newCards.push({
        name: displayName,
        key: parts[1],
        hint: (parts[2] || '').trim(),
        originalName: nameWithComment,
        comments: commentMatches.map(m => m[1])
      })
    }
    return newCards
  }

  async function importFile(file: File) {
    const text = await readFileAsText(file)
    const newCards = parseCardsFromText(text)
    if (newCards.length === 0) throw new Error('无有效数据行')

    cards.value = newCards
    currentFileName.value = file.name.replace(/\.[^.]+$/, '')
    useEngineData.value = false
    initRecords()
    await persistCards()
    await persistRecords()
    await persistFilename()
  }

  async function reimportFile(file: File) {
    const text = await readFileAsText(file)
    const newCards = parseCardsFromText(text)
    if (newCards.length === 0) throw new Error('无有效数据行')

    // 旧记录：同名+同 key+同 hint+同 originalName 保留
    const oldMap = new Map<string, { card: ElementCard; score: number }>()
    cards.value.forEach((c, i) => {
      oldMap.set(c.name + '\t' + c.key, { card: c, score: records.value[i] ? records.value[i][0] : -1 })
    })
    const newRecords = newCards.map((nc) => {
      const old = oldMap.get(nc.name + '\t' + nc.key)
      if (old && old.card.hint === nc.hint && old.card.originalName === nc.originalName) {
        return [old.score, newCards.indexOf(nc)] as [number, number]
      }
      return [-1, newCards.indexOf(nc)] as [number, number]
    })

    // 按分数排序：未掌握在前
    newRecords.sort((a, b) => {
      if (a[0] === 8 && b[0] !== 8) return 1
      if (b[0] === 8 && a[0] !== 8) return -1
      return a[0] - b[0]
    })

    cards.value = newCards
    currentFileName.value = file.name.replace(/\.[^.]+$/, '')
    useEngineData.value = false
    records.value = newRecords
    await persistCards()
    await persistRecords()
    await persistFilename()
  }

  async function clearCards() {
    cards.value = []
    records.value = []
    currentFileName.value = '未导入元素数据'
    useEngineData.value = true
    await Promise.all([
      idbClear('cards'),
      idbClear('records'),
      idbClear('filename')
    ])
  }

  // ===== ZIP 导入 =====
  async function importZip(file: File) {
    const buffer = await readFileAsArrayBuffer(file)
    const entries = await parseZip(buffer)

    const MAX_FONTS = 5
    let fonts = entries.filter(e => /\.(ttf|otf|woff|woff2)$/i.test(e.name))
    let skippedFonts: typeof fonts = []
    if (fonts.length > MAX_FONTS) {
      fonts.sort((a, b) => a.name.localeCompare(b.name))
      skippedFonts = fonts.slice(MAX_FONTS)
      fonts = fonts.slice(0, MAX_FONTS)
    }
    for (const f of fonts) {
      const count = await idbCount('fonts')
      if (count >= MAX_FONTS) break
      const ext = f.name.split('.').pop()!.toLowerCase()
      const fontName = await parseFontFamily(f.data, ext, f.name.split('/').pop() || f.name)
      const id = 'font_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
      const font: ImportedFont = { id, name: fontName, format: ext, buffer: f.data }
      const ok = await registerFont(font)
      if (ok) {
        await idbPut('fonts', font)
      }
    }
    if (skippedFonts.length) {
      console.warn('跳过的字体:', skippedFonts.map(f => f.name).join(', '))
    }

    // 找到 txt/tsv 数据文件
    const txt = entries.find(e => e.name.endsWith('.txt') || e.name.endsWith('.tsv'))
    if (!txt) throw new Error('ZIP 内无元素列表 .txt 文件')
    const text = decodeText(txt.data)
    const fakeFile = new Blob([text], { type: 'text/plain' })
    const displayName = (txt.name.includes('/') ? txt.name.split('/').pop() : txt.name) || file.name
    Object.defineProperty(fakeFile, 'name', { value: displayName, writable: false })
    await importFile(fakeFile as File)
    await refreshFonts()
  }

  // ===== 字体管理 =====
  async function importFont(file: File) {
    const ext = file.name.split('.').pop()!.toLowerCase()
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      throw new Error('仅支持 ttf/otf/woff/woff2 格式')
    }
    const count = await idbCount('fonts')
    const MAX_FONTS = 5
    if (count >= MAX_FONTS) {
      throw new Error('最多只能导入 ' + MAX_FONTS + ' 个字体！请先删除已有字体')
    }
    const buffer = await readFileAsArrayBuffer(file)
    const fontName = await parseFontFamily(buffer, ext, file.name)
    const id = 'font_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    const font: ImportedFont = { id, name: fontName, format: ext, buffer }
    const ok = await registerFont(font)
    if (!ok) {
      throw new Error('无法导入此字体（可能存在兼容性问题）')
    }
    await idbPut('fonts', font)
    await refreshFonts()
    return fontName
  }

  async function removeFont(id: string) {
    const target = importedFonts.value.find(f => f.id === id)
    if (!target) return
    // 从 document.fonts 移除
    const toRemove: FontFace[] = []
    document.fonts.forEach((ff) => {
      if (ff.family === target.name) toRemove.push(ff)
    })
    toRemove.forEach(ff => document.fonts.delete(ff))
    await idbDelete('fonts', id)
    await refreshFonts()
  }

  async function refreshFonts() {
    importedFonts.value = await idbGetAll<ImportedFont>('fonts')
  }

  async function registerAllFonts() {
    const fonts = await idbGetAll<ImportedFont>('fonts')
    for (const f of fonts) {
      await registerFont(f)
    }
    importedFonts.value = fonts
  }

  // ===== 进度导入/导出 =====
  function exportProgress(): string {
    return JSON.stringify(records.value)
  }

  async function importProgress(str: string) {
    const imported = JSON.parse(str)
    if (!Array.isArray(imported) || imported.length !== cards.value.length) {
      throw new Error('长度不匹配')
    }
    records.value = imported
    await persistRecords()
  }

  /** 生成带表头和卡片数据的完整文件文本 */
  function exportWithHeader(): string {
    const lines: string[] = []
    if (settings.value.orderMode) lines.push('#顺序确认模式: true')
    if (settings.value.fontFamily !== DEFAULT_SETTINGS.fontFamily) {
      lines.push('#字体候补: ' + settings.value.fontFamily)
    }
    if (settings.value.description && settings.value.description.trim()) {
      settings.value.description.split('\n').forEach(dl => {
        lines.push('#说明: ' + dl)
      })
    }
    settings.value.highlightRules.forEach(r => {
      const parts = ['浅色=' + r.lightColor, '深色=' + r.darkColor]
      if (r.pattern) parts.push('正则=' + r.pattern)
      lines.push('#高亮规则: ' + parts.join(' '))
    })
    cards.value.forEach(c => {
      const row = [c.originalName, c.key]
      if (c.hint) row.push(c.hint)
      lines.push(row.join('\t'))
    })
    return lines.join('\n')
  }

  // ===== 高亮匹配 =====
  function matchHighlight(name: string): string {
    for (const r of settings.value.highlightRules) {
      if (!r.pattern.trim()) continue
      try {
        if (new RegExp(r.pattern).test(name)) return r.lightColor
      } catch { /* ignore invalid regex */ }
    }
    return ''
  }

  function validRegex(p: string): string {
    if (!p.trim()) return ''
    try { new RegExp(p); return '' } catch (e: any) { return '正则语法错误' }
  }

  function genHlColor(usedHues: Set<number>): { light: string; dark: string } {
    let h: number
    do { h = Math.floor(Math.random() * 360) } while (usedHues.has(h))
    usedHues.add(h)
    return { light: hsl2hex(h, 60, 45), dark: hsl2hex(h, 50, 35) }
  }

  // ===== 持久化 =====
  async function persistCards() {
    await idbPut('cards', { id: 'main', data: cards.value })
  }
  async function persistRecords() {
    await idbPut('records', { id: 'main', data: records.value })
  }
  async function persistFilename() {
    await idbPut('filename', { id: 'main', name: currentFileName.value })
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
    } catch (e) {
      console.warn('保存设置失败:', e)
    }
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY)
      if (saved) {
        const s = JSON.parse(saved)
        settings.value = { ...DEFAULT_SETTINGS, ...s }
      }
    } catch { /* ignore */ }
  }

  async function loadStoredData() {
    const loadedCards = await idbGet<{ id: string; data: ElementCard[] }>('cards', 'main')
    const loadedRecords = await idbGet<{ id: string; data: Array<[number, number]> }>('records', 'main')
    const loadedFname = await idbGet<{ id: string; name: string }>('filename', 'main')

    if (loadedCards?.data && loadedCards.data.length > 0) {
      cards.value = loadedCards.data
      currentFileName.value = loadedFname?.name || '未导入元素数据'
      useEngineData.value = false
      if (loadedRecords?.data && loadedRecords.data.length === cards.value.length) {
        records.value = loadedRecords.data
      } else {
        initRecords()
      }
    } else {
      // 无持久数据，从引擎构建默认卡片
      buildEngineCards()
      initRecords()
    }
  }

  async function resetAll() {
    const toRemove: FontFace[] = []
    importedFonts.value.forEach(f => {
      document.fonts.forEach((ff) => {
        if (ff.family === f.name) toRemove.push(ff)
      })
    })
    toRemove.forEach(ff => document.fonts.delete(ff))
    await Promise.all([
      idbClear('cards'),
      idbClear('records'),
      idbClear('filename'),
      idbClear('fonts')
    ])
    localStorage.removeItem(SETTINGS_KEY)
    cards.value = []
    records.value = []
    importedFonts.value = []
    currentFileName.value = '未导入元素数据'
    settings.value = { ...DEFAULT_SETTINGS }
    useEngineData.value = true
    buildEngineCards()
    initRecords()
  }

  // ===== 初始化 =====
  async function init() {
    loadSettings()
    try {
      await registerAllFonts()
      await loadStoredData()
    } catch (e) {
      console.warn('初始化失败:', e)
      buildEngineCards()
      initRecords()
    }
  }

  // 自动保存设置
  watch(settings, () => saveSettings(), { deep: true })

  return {
    // 状态
    cards,
    records,
    currentCard,
    currentFileName,
    isFirst,
    settings,
    importedFonts,
    progressCount,
    progressText,
    progressPercent,
    progressAsPercent,
    allComplete,
    useEngineData,

    // 方法
    init,
    answer,
    restartProgress,
    importFile,
    reimportFile,
    importZip,
    clearCards,
    importFont,
    removeFont,
    refreshFonts,
    exportProgress,
    importProgress,
    exportWithHeader,
    matchHighlight,
    validRegex,
    genHlColor,
    getPureCharCount,
    parseCardSegments,
    saveSettings,
    resetAll,
    rebuildFromEngine: buildEngineCards,
    togglePercentDisplay: () => { progressAsPercent.value = !progressAsPercent.value }
  }
}
