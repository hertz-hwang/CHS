<script setup lang="ts">
import { ref, shallowRef, computed, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { codeToString } from '../../engine/config'
import Icon from '../Icon.vue'

const { engine, toast, getCurrentCharset, getCurrentCharsetName, rootsVersion, bracedRootToPua, isBracedRoot } = useEngine()

const activeTab = ref<'distribution' | 'collision' | 'balance' | 'marginal' | 'multi'>('distribution')
const useFreqWeight = ref(true)
const isAnalyzing = ref(false)
const filterCodeLength = ref(0) // 0 = all
const distViewPos = ref(0) // 当前查看的码位（0=合计）

const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
]

interface KeyDistResult {
  data: Map<string, number[]>
  positionTotals: number[]
  keyTotals: Map<string, number>
  maxCodeLength: number
  totalChars: number
}

interface CollisionGroup {
  code: string
  chars: string[]
  totalFreq: number
}

interface BalanceResult {
  positionEntropies: number[]
  idealEntropy: number
  overallBalance: number
  keyCount: number
}

interface MarginalResult {
  baseCollisionCount: number
  mergedCollisionCount: number
  delta: number
  mergedGroups: { elements: string; chars: string[]; isChanged: boolean }[]
  hasMerge: boolean
}

interface MultiDistGroup {
  partialCode: string
  elements: string
  chars: string[]
  count: number
  estimatedCollision: number
}

const distResult = shallowRef<KeyDistResult | null>(null)
const collisionGroups = shallowRef<CollisionGroup[]>([])
const balanceResult = shallowRef<BalanceResult | null>(null)

// 边际一阶重码
const marginalPositions = ref<boolean[]>([true, true, true, true])
const marginalResult = shallowRef<MarginalResult | null>(null)

// 归并模拟 - 结构化数据
interface MergeItem {
  root: string
  codeIndex: number | null  // null = 全量归并，0/1/2/3 = 部分归并
}
const mergeGroups = ref<MergeItem[][]>([[]])
const mergeSearchQueries = ref<string[]>([''])
const mergeSearchDebounced = ref('')
const mergeActiveGroupIdx = ref<number | null>(null)
let mergeSearchTimer: ReturnType<typeof setTimeout> | null = null

function onMergeSearchInput(gIdx: number, val: string) {
  mergeSearchQueries.value[gIdx] = val
  if (mergeSearchTimer) clearTimeout(mergeSearchTimer)
  mergeSearchTimer = setTimeout(() => { mergeSearchDebounced.value = val }, 200)
}

const hasMergeSpec = computed(() => mergeGroups.value.some(g => g.length >= 2))

const mergeSearchResults = computed(() => {
  rootsVersion.value
  const query = mergeSearchDebounced.value.trim().toLowerCase()
  if (!query || mergeActiveGroupIdx.value === null) return []

  const results: { root: string; code: string }[] = []
  const strokeSearch = /^[1-5]+$/.test(query)

  for (const root of engine.roots) {
    const code = engine.rootCodes.get(root)
    const codeStr = code ? codeToString(code) : ''
    if (strokeSearch) {
      const strokes = engine.getStrokes(root)
      const strokeCode = strokes.length > 0 ? strokes[0] : ''
      if (strokeCode.includes(query)) results.push({ root, code: codeStr })
    } else {
      if (root.toLowerCase().includes(query) || codeStr.toLowerCase().includes(query))
        results.push({ root, code: codeStr })
    }
  }

  if (strokeSearch) {
    results.sort((a, b) => {
      const sa = engine.getStrokes(a.root)[0] ?? ''
      const sb = engine.getStrokes(b.root)[0] ?? ''
      return (sa === query ? 0 : 1) - (sb === query ? 0 : 1)
    })
  }
  return results.slice(0, 20)
})

function addMergeGroup() {
  mergeGroups.value = [...mergeGroups.value, []]
  mergeSearchQueries.value = [...mergeSearchQueries.value, '']
}

function removeMergeGroup(gIdx: number) {
  const groups = [...mergeGroups.value]
  const queries = [...mergeSearchQueries.value]
  groups.splice(gIdx, 1)
  queries.splice(gIdx, 1)
  if (groups.length === 0) { groups.push([]); queries.push('') }
  mergeGroups.value = groups
  mergeSearchQueries.value = queries
  runMarginalAnalysis()
}

function addToGroup(gIdx: number, root: string) {
  const groups = mergeGroups.value.map(g => [...g])
  if (!groups[gIdx].some(item => item.root === root)) {
    groups[gIdx].push({ root, codeIndex: null })
  }
  mergeGroups.value = groups
  mergeSearchQueries.value[gIdx] = ''
  mergeSearchDebounced.value = ''
  runMarginalAnalysis()
}

function removeFromGroup(gIdx: number, iIdx: number) {
  const groups = mergeGroups.value.map(g => [...g])
  groups[gIdx].splice(iIdx, 1)
  mergeGroups.value = groups
  runMarginalAnalysis()
}

function setCodeIndex(gIdx: number, iIdx: number, value: string) {
  const groups = mergeGroups.value.map(g => g.map(item => ({ ...item })))
  groups[gIdx][iIdx].codeIndex = value === '' ? null : parseInt(value)
  mergeGroups.value = groups
  runMarginalAnalysis()
}

function closeMergeSearch() {
  if (mergeActiveGroupIdx.value !== null) {
    mergeSearchQueries.value[mergeActiveGroupIdx.value] = ''
  }
  mergeSearchDebounced.value = ''
  mergeActiveGroupIdx.value = null
}

function onMergeSearchBlur() {
  // 延迟关闭，让 mousedown.prevent 的 addToGroup 先执行
  setTimeout(closeMergeSearch, 150)
}

function buildMergeSpec(): MergeSpec | null {
  const full = new Map<string, string>()
  const partial = new Map<string, string>()
  for (const group of mergeGroups.value) {
    if (group.length < 2) continue
    const target = group[0]
    for (let i = 1; i < group.length; i++) {
      const src = group[i]
      if (src.codeIndex === null && target.codeIndex === null) {
        full.set(src.root, target.root)
      } else {
        const srcIdx = src.codeIndex ?? 0
        const tgtIdx = target.codeIndex ?? 0
        partial.set(`${src.root}.${srcIdx}`, `${target.root}.${tgtIdx}`)
      }
    }
  }
  if (full.size === 0 && partial.size === 0) return null
  return { full, partial }
}

// 多元分布
const multiPositions = ref<boolean[]>([true, true, false, false])
const multiDistGroups = shallowRef<MultiDistGroup[]>([])

// 共享的 codeMap 缓存（分析后保留，供边际/多元使用）
const cachedCodeMap = shallowRef<Map<string, string> | null>(null)

const hasResult = computed(() => distResult.value !== null)

function getKeyValue(key: string): number {
  if (!distResult.value) return 0
  const pos = distViewPos.value
  if (pos === 0) return distResult.value.keyTotals.get(key) ?? 0
  const counts = distResult.value.data.get(key)
  return counts?.[pos - 1] ?? 0
}

function getKeyPercent(key: string): string {
  if (!distResult.value) return '0'
  const pos = distViewPos.value
  const total = pos === 0
    ? distResult.value.positionTotals.reduce((a, b) => a + b, 0)
    : distResult.value.positionTotals[pos - 1] ?? 0
  if (total === 0) return '0'
  return ((getKeyValue(key) / total) * 100).toFixed(1)
}

function getKeyBgColor(key: string): string {
  if (!distResult.value) return 'var(--bg2)'
  const pos = distViewPos.value
  const total = pos === 0
    ? distResult.value.positionTotals.reduce((a, b) => a + b, 0)
    : distResult.value.positionTotals[pos - 1] ?? 0
  if (total === 0) return 'var(--bg2)'
  const ratio = getKeyValue(key) / total
  if (ratio === 0) return 'var(--bg2)'
  // 从浅蓝到深蓝
  const intensity = Math.min(ratio * 15, 1)
  return `rgba(59, 130, 246, ${0.1 + intensity * 0.6})`
}

function getKeyTextColor(key: string): string {
  if (!distResult.value) return 'var(--text)'
  const pos = distViewPos.value
  const total = pos === 0
    ? distResult.value.positionTotals.reduce((a, b) => a + b, 0)
    : distResult.value.positionTotals[pos - 1] ?? 0
  if (total === 0) return 'var(--text)'
  const ratio = getKeyValue(key) / total
  return ratio * 15 > 0.6 ? '#fff' : 'var(--text)'
}

const filteredCollisions = computed(() => {
  if (!collisionGroups.value.length) return []
  if (filterCodeLength.value === 0) return collisionGroups.value
  return collisionGroups.value.filter(g => g.code.length === filterCodeLength.value)
})

const availableCodeLengths = computed(() => {
  if (!collisionGroups.value.length) return []
  const lengths = new Set(collisionGroups.value.map(g => g.code.length))
  return [...lengths].sort((a, b) => a - b)
})

function runAnalysis() {
  isAnalyzing.value = true
  setTimeout(() => {
    try {
      const chars = getCurrentCharset()
      const codeMap = new Map<string, string>()
      for (const ch of chars) {
        const code = engine.calculateCharCode(ch)
        if (code) codeMap.set(ch, code)
      }

      if (codeMap.size === 0) {
        toast('无法生成编码，请先配置取码规则')
        isAnalyzing.value = false
        return
      }

      cachedCodeMap.value = codeMap

      // 只取字集内的字频
      const freqMap = new Map<string, number>()
      if (useFreqWeight.value) {
        for (const ch of chars) {
          const f = engine.freq.get(ch)
          if (f) freqMap.set(ch, f)
        }
      }

      distResult.value = computeKeyDistribution(codeMap, useFreqWeight.value ? freqMap : null)
      collisionGroups.value = computeCollisions(codeMap, freqMap)
      balanceResult.value = computePositionBalance(distResult.value)

      // 初始化码位选择器长度
      const maxLen = distResult.value.maxCodeLength
      if (marginalPositions.value.length < maxLen) {
        marginalPositions.value = Array.from({ length: maxLen }, (_, i) => i < 2)
      }
      if (multiPositions.value.length < maxLen) {
        multiPositions.value = Array.from({ length: maxLen }, (_, i) => i < 2)
      }

      runMarginalAnalysis()
      runMultiDistAnalysis()

      toast(`分析完成：${codeMap.size} 字`)
    } catch (e: any) {
      toast('分析出错: ' + (e.message || e))
    }
    isAnalyzing.value = false
  }, 50)
}

function computeKeyDistribution(
  codeMap: Map<string, string>,
  freqMap: Map<string, number> | null
): KeyDistResult {
  const data = new Map<string, number[]>()
  let maxLen = 0
  for (const code of codeMap.values()) {
    if (code.length > maxLen) maxLen = code.length
  }

  const positionTotals = new Array(maxLen).fill(0)
  const keyTotals = new Map<string, number>()

  for (const [char, code] of codeMap) {
    const weight = freqMap?.get(char) ?? 1
    for (let i = 0; i < code.length; i++) {
      const key = code[i]
      if (!data.has(key)) data.set(key, new Array(maxLen).fill(0))
      data.get(key)![i] += weight
      positionTotals[i] += weight
      keyTotals.set(key, (keyTotals.get(key) ?? 0) + weight)
    }
  }

  return { data, positionTotals, keyTotals, maxCodeLength: maxLen, totalChars: codeMap.size }
}

function computeCollisions(
  codeMap: Map<string, string>,
  freqMap: Map<string, number>
): CollisionGroup[] {
  const codeToChars = new Map<string, string[]>()
  for (const [char, code] of codeMap) {
    if (!codeToChars.has(code)) codeToChars.set(code, [])
    codeToChars.get(code)!.push(char)
  }

  const groups: CollisionGroup[] = []
  for (const [code, chars] of codeToChars) {
    if (chars.length >= 2) {
      const totalFreq = chars.reduce((sum, ch) => sum + (freqMap.get(ch) ?? 0), 0)
      groups.push({ code, chars, totalFreq })
    }
  }

  groups.sort((a, b) => b.totalFreq - a.totalFreq)
  return groups
}

function computePositionBalance(dist: KeyDistResult): BalanceResult {
  const positionEntropies: number[] = []
  const numKeys = dist.data.size

  for (let pos = 0; pos < dist.maxCodeLength; pos++) {
    const total = dist.positionTotals[pos]
    if (total === 0) { positionEntropies.push(0); continue }

    let entropy = 0
    for (const [, counts] of dist.data) {
      const p = counts[pos] / total
      if (p > 0) entropy -= p * Math.log2(p)
    }
    positionEntropies.push(entropy)
  }

  const idealEntropy = numKeys > 0 ? Math.log2(numKeys) : 0
  const overallBalance = positionEntropies.length > 0 && idealEntropy > 0
    ? positionEntropies.reduce((s, e) => s + e / idealEntropy, 0) / positionEntropies.length
    : 0

  return { positionEntropies, idealEntropy, overallBalance, keyCount: numKeys }
}

function getSelectedPositions(flags: boolean[]): number[] {
  return flags.map((v, i) => v ? i : -1).filter(i => i >= 0)
}

function extractPartialCode(code: string, positions: number[]): string {
  return positions.map(p => p < code.length ? code[p] : '').join('')
}

interface MergeSpec {
  full: Map<string, string>    // root → root（全量归并）
  partial: Map<string, string> // "root.N" → "root.N"（部分归并）
}

function computeMarginalCollisionsByElements(
  chars: string[],
  positions: number[],
  mergeSpec: MergeSpec | null
): { count: number; groups: { elements: string; chars: string[] }[] } {
  const elemKeyToChars = new Map<string, string[]>()
  const elemKeyToDisplay = new Map<string, string>()

  for (const char of chars) {
    const elems = engine.getCharCodeElements(char)
    if (!elems.length) continue
    const sliced = positions.map(p => {
      const e = elems[p]
      if (!e || !e.root) return ''
      if (!mergeSpec) return `${e.root}.${e.codeIndex}`
      const partialKey = `${e.root}.${e.codeIndex}`
      if (mergeSpec.partial.has(partialKey)) return mergeSpec.partial.get(partialKey)!
      const fullMapped = mergeSpec.full.get(e.root)
      return fullMapped ? `${fullMapped}.${e.codeIndex}` : partialKey
    })
    if (sliced.every(s => !s)) continue
    const key = JSON.stringify(sliced)
    if (!elemKeyToChars.has(key)) {
      elemKeyToChars.set(key, [])
      elemKeyToDisplay.set(key, sliced.join(' '))
    }
    elemKeyToChars.get(key)!.push(char)
  }

  let count = 0
  const groups: { elements: string; chars: string[] }[] = []
  for (const [key, groupChars] of elemKeyToChars) {
    if (groupChars.length >= 2) {
      count += groupChars.length - 1
      groups.push({ elements: elemKeyToDisplay.get(key) ?? '', chars: groupChars })
    }
  }
  groups.sort((a, b) => b.chars.length - a.chars.length)
  return { count, groups }
}

function runMarginalAnalysis() {
  const positions = getSelectedPositions(marginalPositions.value)
  if (positions.length === 0) {
    marginalResult.value = null
    return
  }

  const chars = getCurrentCharset()
  const mergeSpec = buildMergeSpec()
  const base = computeMarginalCollisionsByElements(chars, positions, null)
  const merged = computeMarginalCollisionsByElements(chars, positions, mergeSpec)

  const baseCharSets = new Set(base.groups.map(g => JSON.stringify([...g.chars].sort())))

  marginalResult.value = {
    baseCollisionCount: base.count,
    mergedCollisionCount: merged.count,
    delta: merged.count - base.count,
    hasMerge: mergeSpec !== null,
    mergedGroups: merged.groups.map(g => ({
      ...g,
      isChanged: !baseCharSets.has(JSON.stringify([...g.chars].sort())),
    })),
  }
}

function runMultiDistAnalysis() {
  if (!cachedCodeMap.value) return
  const positions = getSelectedPositions(multiPositions.value)
  if (positions.length === 0) {
    multiDistGroups.value = []
    return
  }

  const maxLen = distResult.value?.maxCodeLength ?? 4
  const freePositions = maxLen - positions.length
  const alphabetSize = distResult.value?.data.size ?? 26

  // 按元素序列（字根序列）分组
  const elemKeyToChars = new Map<string, string[]>()
  const elemKeyToDisplay = new Map<string, string>()
  const posSet = new Set(positions)
  for (const [char] of cachedCodeMap.value) {
    const elems = engine.getCharCodeElements(char)
    // 选中码位取对应字根+码位索引作为分组键
    const sliced = positions.map(p => {
      const e = elems[p]
      return e ? `${e.root}.${e.codeIndex}` : ''
    })
    const key = JSON.stringify(sliced)
    if (!elemKeyToChars.has(key)) {
      elemKeyToChars.set(key, [])
      // 显示时：选中码位显示「字根.码位索引」，未选中码位显示 *
      const display = Array.from({ length: maxLen }, (_, i) => {
        if (!posSet.has(i)) return '*'
        const e = elems[i]
        return e ? `${e.root}.${e.codeIndex}` : ''
      }).join(' ')
      elemKeyToDisplay.set(key, display)
    }
    elemKeyToChars.get(key)!.push(char)
  }

  const groups: MultiDistGroup[] = []
  const space = Math.pow(alphabetSize, freePositions)
  for (const [key, chars] of elemKeyToChars) {
    if (chars.length >= 2) {
      const n = chars.length
      const estimated = freePositions > 0
        ? Math.round((n * n) / 2 / space)
        : n - 1
      const elements = elemKeyToDisplay.get(key) ?? ''
      // partialCode 用第一个字的实际部分编码作为参考
      const firstCode = cachedCodeMap.value.get(chars[0]) ?? ''
      const partialCode = extractPartialCode(firstCode, positions)
      groups.push({ partialCode, elements, chars, count: n, estimatedCollision: estimated })
    }
  }
  groups.sort((a, b) => b.count - a.count)
  multiDistGroups.value = groups
}
</script>

<template>
  <div class="panel">
    <div class="panel-head"><Icon name="analysis" :size="18" /> 离散性分析</div>
    <div class="panel-body">
      <div class="input-row">
        <label class="toggle-label">
          <input type="checkbox" v-model="useFreqWeight" /> 按频率加权
        </label>
        <button class="btn" @click="runAnalysis" :disabled="isAnalyzing">
          {{ isAnalyzing ? '分析中...' : '开始分析' }}
        </button>
      </div>

      <div class="tab-bar" v-if="hasResult">
        <button class="tab-btn" :class="{ active: activeTab === 'distribution' }" @click="activeTab = 'distribution'">键位分布</button>
        <button class="tab-btn" :class="{ active: activeTab === 'collision' }" @click="activeTab = 'collision'">重码聚类</button>
        <button class="tab-btn" :class="{ active: activeTab === 'balance' }" @click="activeTab = 'balance'">码位均衡度</button>
        <button class="tab-btn" :class="{ active: activeTab === 'marginal' }" @click="activeTab = 'marginal'">边际重码</button>
        <button class="tab-btn" :class="{ active: activeTab === 'multi' }" @click="activeTab = 'multi'">多元分布</button>
      </div>

      <!-- 键位分布 -->
      <div v-if="hasResult && activeTab === 'distribution'" class="section">
        <div class="dist-pos-selector">
          <button class="pos-btn" :class="{ active: distViewPos === 0 }" @click="distViewPos = 0">合计</button>
          <button v-for="i in distResult!.maxCodeLength" :key="i" class="pos-btn" :class="{ active: distViewPos === i }" @click="distViewPos = i">第{{ i }}码</button>
        </div>
        <div class="keyboard-layout">
          <div v-for="(row, rowIdx) in KEYBOARD_ROWS" :key="rowIdx" class="kbd-row" :class="'kbd-row-' + rowIdx">
            <div v-for="key in row" :key="key" class="kbd-key" :style="{ backgroundColor: getKeyBgColor(key), color: getKeyTextColor(key) }">
              <span class="kbd-label">{{ key }}</span>
              <span class="kbd-value">{{ getKeyPercent(key) }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 重码聚类 -->
      <div v-if="hasResult && activeTab === 'collision'" class="section">
        <div class="filter-row">
          <span>码长筛选：</span>
          <select v-model.number="filterCodeLength">
            <option :value="0">全部</option>
            <option v-for="len in availableCodeLengths" :key="len" :value="len">{{ len }}码</option>
          </select>
          <span class="collision-count">共 {{ filteredCollisions.length }} 组重码</span>
        </div>
        <div class="collision-list">
          <div v-for="(group, idx) in filteredCollisions.slice(0, 200)" :key="idx" class="collision-item">
            <span class="collision-code">{{ group.code }}</span>
            <span class="collision-chars">{{ group.chars.join(' ') }}</span>
            <span class="collision-freq">频{{ group.totalFreq.toLocaleString() }}</span>
          </div>
          <div v-if="filteredCollisions.length > 200" class="no-data">
            仅显示前 200 组（共 {{ filteredCollisions.length }} 组）
          </div>
          <div v-if="filteredCollisions.length === 0" class="no-data">无重码</div>
        </div>
      </div>

      <!-- 码位均衡度 -->
      <div v-if="hasResult && activeTab === 'balance'" class="section">
        <div class="balance-grid">
          <div class="balance-card">
            <div class="balance-label">整体均衡度</div>
            <div class="balance-value">{{ (balanceResult!.overallBalance * 100).toFixed(1) }}%</div>
            <div class="balance-label">使用 {{ balanceResult!.keyCount }} 个键位</div>
          </div>
          <div class="balance-card">
            <div class="balance-label">理想熵值</div>
            <div class="balance-value">{{ balanceResult!.idealEntropy.toFixed(2) }}</div>
            <div class="balance-label">log₂({{ balanceResult!.keyCount }}) bits</div>
          </div>
          <div class="balance-card">
            <div class="balance-label">编码字数</div>
            <div class="balance-value">{{ distResult!.totalChars }}</div>
            <div class="balance-label">当前字集</div>
          </div>
        </div>
        <div class="balance-detail">
          <table>
            <thead>
              <tr>
                <th>码位</th>
                <th>实际熵</th>
                <th>均衡度</th>
                <th>分布</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(ent, idx) in balanceResult!.positionEntropies" :key="idx">
                <td>第{{ idx + 1 }}码</td>
                <td>{{ ent.toFixed(3) }}</td>
                <td>{{ balanceResult!.idealEntropy > 0 ? ((ent / balanceResult!.idealEntropy) * 100).toFixed(1) + '%' : '-' }}</td>
                <td>
                  <div class="bar-wrap">
                    <div class="bar" :style="{ width: (balanceResult!.idealEntropy > 0 ? (ent / balanceResult!.idealEntropy) * 100 : 0) + '%' }"></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 边际一阶重码 -->
      <div v-if="hasResult && activeTab === 'marginal'" class="section">
        <div class="marginal-config">
          <div class="config-row">
            <span class="config-label">分析码位：</span>
            <label v-for="(_, idx) in marginalPositions" :key="idx" class="pos-check">
              <input type="checkbox" v-model="marginalPositions[idx]" @change="runMarginalAnalysis" />
              第{{ idx + 1 }}码
            </label>
          </div>
          <div class="config-row merge-config-row">
            <span class="config-label">归并模拟：</span>
            <div class="merge-groups-editor">
              <div v-for="(group, gIdx) in mergeGroups" :key="gIdx" class="merge-group-row">
                <div class="merge-chips">
                  <span
                    v-for="(item, iIdx) in group"
                    :key="iIdx"
                    class="merge-chip"
                    :class="{ 'chip-partial': item.codeIndex !== null }"
                  >
                    <span :class="isBracedRoot(item.root) ? 'pua-font' : ''">{{ bracedRootToPua(item.root) }}</span>
                    <select
                      class="chip-code-select"
                      :value="item.codeIndex !== null ? String(item.codeIndex) : ''"
                      @change="setCodeIndex(gIdx, iIdx, ($event.target as HTMLSelectElement).value)"
                      @click.stop
                    >
                      <option value="">全</option>
                      <option v-for="n in (distResult?.maxCodeLength ?? 4)" :key="n - 1" :value="String(n - 1)">.{{ n - 1 }}</option>
                    </select>
                    <button class="chip-remove" @click.stop="removeFromGroup(gIdx, iIdx)">×</button>
                  </span>
                  <div class="merge-search-wrapper">
                    <input
                      type="text"
                      class="merge-search-input"
                      :value="mergeSearchQueries[gIdx] ?? ''"
                      placeholder="搜索字根..."
                      @focus="mergeActiveGroupIdx = gIdx"
                      @input="onMergeSearchInput(gIdx, ($event.target as HTMLInputElement).value)"
                      @blur="onMergeSearchBlur"
                    />
                    <div
                      v-if="mergeActiveGroupIdx === gIdx && mergeSearchResults.length > 0"
                      class="merge-dropdown"
                    >
                      <div
                        v-for="item in mergeSearchResults"
                        :key="item.root"
                        class="merge-dropdown-item"
                        @mousedown.prevent="addToGroup(gIdx, item.root)"
                      >
                        <span class="dropdown-root" :class="isBracedRoot(item.root) ? 'pua-font' : ''">{{ bracedRootToPua(item.root) }}</span>
                        <span class="dropdown-code">{{ item.code.toUpperCase() }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <button class="btn-group-remove" @click="removeMergeGroup(gIdx)" title="删除此组">×</button>
              </div>
              <button class="btn btn-sm btn-outline merge-add-group" @click="addMergeGroup">+ 新建组</button>
            </div>
          </div>
        </div>
        <div v-if="marginalResult" class="marginal-summary">
          <div class="stat-row">
            <span class="stat-item">基础重码：<strong>{{ marginalResult.baseCollisionCount }}</strong></span>
            <span class="stat-item" v-if="hasMergeSpec">
              归并后：<strong>{{ marginalResult.mergedCollisionCount }}</strong>
            </span>
            <span class="stat-item stat-delta" v-if="hasMergeSpec" :class="{ negative: marginalResult.delta < 0 }">
              变化：<strong>{{ marginalResult.delta >= 0 ? '+' : '' }}{{ marginalResult.delta }}</strong>
            </span>
          </div>
          <div class="collision-list">
            <template v-for="(group, idx) in marginalResult.mergedGroups" :key="idx">
              <div v-if="!marginalResult.hasMerge || group.isChanged" class="collision-item">
                <span class="collision-code elem-cell">{{ group.elements }}</span>
                <span class="collision-chars">{{ group.chars.slice(0, 20).join(' ') }}{{ group.chars.length > 20 ? '…' : '' }}</span>
                <span class="collision-freq">{{ group.chars.length }}字</span>
              </div>
            </template>
            <div v-if="marginalResult.mergedGroups.length > 150" class="no-data">
              仅显示前 150 组（共 {{ marginalResult.mergedGroups.length }} 组）
            </div>
          </div>
        </div>
      </div>

      <!-- 多元分布 -->
      <div v-if="hasResult && activeTab === 'multi'" class="section">
        <div class="marginal-config">
          <div class="config-row">
            <span class="config-label">选取码位：</span>
            <label v-for="(_, idx) in multiPositions" :key="idx" class="pos-check">
              <input type="checkbox" v-model="multiPositions[idx]" @change="runMultiDistAnalysis" />
              第{{ idx + 1 }}码
            </label>
          </div>
        </div>
        <div class="collision-count" v-if="multiDistGroups.length">
          共 {{ multiDistGroups.length }} 组部分编码冲突
        </div>
        <div class="table-wrap" v-if="multiDistGroups.length">
          <table class="data-table dist-table">
            <thead>
              <tr>
                <th>部分编码</th>
                <th>字数</th>
                <th>预估重码</th>
                <th>元素序列</th>
                <th>包含汉字</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(group, idx) in multiDistGroups.slice(0, 200)" :key="idx">
                <td class="key-cell">{{ group.partialCode }}</td>
                <td>{{ group.count }}</td>
                <td>{{ group.estimatedCollision }}</td>
                <td class="elem-cell">{{ group.elements }}</td>
                <td class="chars-cell">{{ group.chars.slice(0, 30).join(' ') }}{{ group.chars.length > 30 ? '…' : '' }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="multiDistGroups.length > 200" class="no-data">
            仅显示前 200 组（共 {{ multiDistGroups.length }} 组）
          </div>
        </div>
        <div v-if="!multiDistGroups.length" class="no-data">无冲突组（请至少选择一个码位）</div>
      </div>

      <div v-if="!hasResult" class="no-data">点击「开始分析」运行离散性分析</div>
    </div>
  </div>
</template>

<style scoped>
.input-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text2);
  cursor: pointer;
}
.tab-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}
.tab-btn {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg2);
  color: var(--text2);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.tab-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.tab-btn:hover:not(.active) {
  background: var(--bg3);
}
.section { margin-top: 8px; }
.table-wrap { overflow-x: auto; }
.dist-table { font-size: 12px; border-collapse: collapse; width: 100%; }
.dist-table th, .dist-table td {
  padding: 4px 8px;
  border: 1px solid var(--border);
  text-align: center;
  white-space: nowrap;
}
.dist-table th { background: var(--bg2); font-weight: 600; }
.key-cell { font-weight: 600; font-family: monospace; }
.total-cell { font-weight: 600; background: var(--bg2); }
.dist-pos-selector {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}
.pos-btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg2);
  color: var(--text2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.pos-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.pos-btn:hover:not(.active) { background: var(--bg3); }
.keyboard-layout {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 680px;
}
.kbd-row {
  display: flex;
  gap: 5px;
}
.kbd-row-1 { padding-left: 24px; }
.kbd-row-2 { padding-left: 48px; }
.kbd-key {
  width: 58px;
  height: 54px;
  border-radius: 6px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: background-color 0.2s;
}
.kbd-label {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
}
.kbd-value {
  font-size: 11px;
  opacity: 0.85;
}
.collision-list { display: flex; flex-direction: column; gap: 6px; max-height: 500px; overflow-y: auto; }
.collision-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg2);
  border-radius: 6px;
  border: 1px solid var(--border);
}
.collision-code { font-family: monospace; font-weight: 600; min-width: 60px; }
.collision-chars { flex: 1; font-size: 15px; letter-spacing: 2px; }
.collision-freq { font-size: 12px; color: var(--text2); min-width: 80px; text-align: right; }
.filter-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 13px; }
.filter-row select { padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); }
.balance-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.balance-card {
  padding: 16px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
  text-align: center;
}
.balance-value { font-size: 24px; font-weight: 700; color: var(--primary); margin: 8px 0; }
.balance-label { font-size: 12px; color: var(--text2); }
.balance-detail { margin-top: 16px; }
.balance-detail table { width: 100%; font-size: 13px; border-collapse: collapse; }
.balance-detail th, .balance-detail td { padding: 6px 10px; border: 1px solid var(--border); text-align: center; }
.balance-detail th { background: var(--bg2); }
.bar-wrap { display: flex; align-items: center; gap: 8px; }
.bar { height: 16px; border-radius: 3px; background: var(--primary); transition: width 0.3s; }
.no-data { color: var(--text2); font-size: 13px; padding: 20px; text-align: center; }
.collision-count { font-size: 13px; color: var(--text2); margin-bottom: 8px; }
.marginal-config { margin-bottom: 12px; }
.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}
.config-label { color: var(--text2); white-space: nowrap; min-width: 70px; }
.pos-check {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text);
}
.merge-config-row { align-items: flex-start; }
.merge-groups-editor { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.merge-group-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.merge-chips {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.merge-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s;
}
.merge-chip:hover { border-color: var(--primary); }
.merge-chip.chip-partial { border-color: var(--primary); background: rgba(var(--primary-rgb, 59,130,246), 0.08); }
.chip-code-select {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 11px;
  font-family: monospace;
  cursor: pointer;
  padding: 0;
  max-width: 36px;
}
.chip-remove {
  border: none;
  background: transparent;
  color: var(--text3);
  font-size: 13px;
  cursor: pointer;
  padding: 0 1px;
  line-height: 1;
}
.chip-remove:hover { color: var(--danger, #e53e3e); }
.merge-search-wrapper { position: relative; }
.merge-search-input {
  width: 100px;
  padding: 2px 6px;
  border: 1px dashed var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
}
.merge-search-input:focus { border-color: var(--primary); outline: none; width: 140px; }
.merge-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 140px;
  max-height: 180px;
  overflow-y: auto;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  z-index: 20;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  margin-top: 2px;
}
.merge-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 0.1s;
}
.merge-dropdown-item:hover { background: var(--bg3); }
.dropdown-root { font-size: 16px; }
.dropdown-code { font-family: monospace; font-size: 12px; color: var(--success); }
.btn-group-remove {
  border: none;
  background: transparent;
  color: var(--text3);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  flex-shrink: 0;
  align-self: center;
}
.btn-group-remove:hover { color: var(--danger, #e53e3e); }
.merge-add-group { align-self: flex-start; font-size: 12px; padding: 3px 10px; }
.marginal-summary { margin-bottom: 12px; }
.stat-row {
  display: flex;
  gap: 20px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--text2);
}
.stat-item strong { color: var(--text); }
.stat-delta strong { color: var(--danger, #e53e3e); }
.stat-delta.negative strong { color: var(--success, #38a169); }
.chars-cell { font-size: 14px; letter-spacing: 1px; text-align: left; max-width: 400px; overflow: hidden; text-overflow: ellipsis; }
.elem-cell { font-size: 14px; letter-spacing: 2px; white-space: nowrap; }
</style>
