<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEngine } from '../composables/useEngine'
import { unicodeBlock, unicodeHex } from '../engine/unicode'
import { isBracedRoot, bracedRootToPua } from '../utils/pua'
import type { PinyinInfo } from '../engine/engine'
import KeySelect from './element/KeySelect.vue'

const {
  engine, selectedChar, refreshStats, toast, switchPage, setSearchChar,
  saveCurrentConfig, setTransformerDraft
} = useEngine()

const showRootCodeDialog = ref(false)
const editingRoot = ref<string | null>(null)
const codePositions = ref<string[]>(['', '', '', ''])
const mergeTarget = ref('')
const mergeSearchQuery = ref('')

const detail = computed(() => {
  const ch = selectedChar.value
  if (!ch) return null
  const { leaves, ids } = engine.decompose(ch)
  const pinyinList = engine.getPinyinList(ch)
  const strokeList = engine.getStrokes(ch)

  return {
    char: ch, leaves, ids,
    origIDS: engine.decomp.get(ch) || '—',
    sc: engine.strokeCount(ch),
    strokeList,
    pinyinList,
    fq: engine.freq.has(ch) ? engine.freq.get(ch) : '—',
    isRoot: engine.roots.has(ch),
    block: unicodeBlock(ch),
    code: unicodeHex(ch),
  }
})

function formatFreq(freq: number): string {
  if (freq >= 100000000) return (freq / 100000000).toFixed(1) + '亿'
  if (freq >= 10000) return (freq / 10000).toFixed(1) + '万'
  return freq.toLocaleString()
}

function getActiveRoot(): string | null {
  return editingRoot.value || detail.value?.char || null
}

function initCodePositions(root: string) {
  mergeTarget.value = engine.getMergedFrom(root) || ''
  mergeSearchQuery.value = ''
  const codeEquivs = engine.getCodeEquivalencesForRoot(root)
  const code = engine.rootCodes.get(root)
  const fullCode = code ? `${code.main || ''}${code.sub || ''}${code.supplement || ''}` : ''

  codePositions.value = ['', '', '', '']
  for (let i = 0; i < 4; i++) {
    codePositions.value[i] = codeEquivs.get(i) || fullCode[i] || ''
  }
}

function openRootDialog(root: string) {
  editingRoot.value = root
  initCodePositions(root)
  showRootCodeDialog.value = true
}

function toggleRoot() {
  if (!detail.value) return
  const ch = detail.value.char
  if (detail.value.isRoot) {
    engine.removeRoots(ch)
    toast(`已移除字根: ${ch}`)
    refreshStats()
    selectedChar.value = null
    setTimeout(() => { selectedChar.value = ch }, 0)
  } else {
    openRootDialog(ch)
  }
}

function openLeafDialog(leaf: string) {
  if (engine.isEquivalentRoot(leaf)) {
    const mainRoot = engine.getMainRoot(leaf)
    toast(`"${leaf}" 是 "${mainRoot}" 的等效字根，无法单独设置编码`)
    return
  }
  openRootDialog(leaf)
}

function finalizeDialog() {
  const currentChar = detail.value?.char || null
  closeRootCodeDialog()
  if (!currentChar) return
  selectedChar.value = null
  setTimeout(() => { selectedChar.value = currentChar }, 0)
}

function isCodeRef(value: string): boolean {
  return value.includes('.')
}

function confirmSetRoot() {
  const root = getActiveRoot()
  if (!root) return

  if (!mergeTarget.value && engine.isMergedRoot(root)) {
    engine.removeMergedRoot(root)
  }

  const hasAnyCode = codePositions.value.some(pos => !!pos)

  if (!mergeTarget.value && !hasAnyCode) {
    engine.removeRoots(root)
    saveCurrentConfig()
    refreshStats()
    toast(`已清除字根设置: ${root}`)
    finalizeDialog()
    return
  }

  if (mergeTarget.value) {
    engine.setMergedRoot(root, mergeTarget.value)
    saveCurrentConfig()
    refreshStats()
    toast(`已将「${root}」归并到「${mergeTarget.value}」`)
    finalizeDialog()
    return
  }

  const mainKey = codePositions.value[0]
  if (!mainKey) {
    engine.addRoots(root)
    saveCurrentConfig()
    refreshStats()
    toast(`已添加字根: ${root}`)
    finalizeDialog()
    return
  }

  const codeEquivalences: { targetIndex: number; sourceRef: string }[] = []
  const codeChars: string[] = []

  for (let i = 0; i < codePositions.value.length; i++) {
    const pos = codePositions.value[i]
    if (!pos) continue
    if (isCodeRef(pos)) {
      const parsed = engine.parseCodeRef(pos)
      if (!parsed) continue
      const sourceCodeChar = engine.getRootCodeAt(parsed.root, parsed.codeIndex)
      if (!sourceCodeChar) continue
      codeChars.push(sourceCodeChar)
      codeEquivalences.push({ targetIndex: i, sourceRef: pos })
    } else {
      codeChars.push(pos)
    }
  }

  engine.setRootCode(root, codeChars.join(''))
  for (const equiv of codeEquivalences) {
    engine.setCodeEquivalence(`${root}.${equiv.targetIndex}`, equiv.sourceRef)
  }

  saveCurrentConfig()
  refreshStats()

  let msg = `已添加字根: ${root}`
  if (codeChars.length > 0) {
    msg += `，编码: ${codeChars.join('')}`
  }
  if (codeEquivalences.length > 0) {
    msg += `（含 ${codeEquivalences.length} 个半归并）`
  }
  toast(msg)
  finalizeDialog()
}

function closeRootCodeDialog() {
  showRootCodeDialog.value = false
  editingRoot.value = null
  codePositions.value = ['', '', '', '']
  mergeTarget.value = ''
  mergeSearchQuery.value = ''
}

function isLeafRoot(leaf: string): boolean {
  return engine.roots.has(leaf)
}

function isLeafEquivRoot(leaf: string): boolean {
  return engine.isEquivalentRoot(leaf)
}

function getLeafMainRoot(leaf: string): string | undefined {
  return engine.getMainRoot(leaf)
}

const dialogTitle = computed(() => {
  const root = getActiveRoot()
  return root ? `设置字根: ${root}` : '设为字根'
})

const isCharBracedRoot = computed(() => {
  return detail.value ? isBracedRoot(detail.value.char) : false
})

const displayChar = computed(() => {
  if (!detail.value) return ''
  return bracedRootToPua(detail.value.char)
})

function goToPage(page: string) {
  if (!detail.value) return
  setSearchChar(detail.value.char)
  switchPage(page)
}

const activeRootIds = computed(() => {
  const root = getActiveRoot()
  if (!root) return ''
  return engine.decompose(root).ids || engine.decomp.get(root) || ''
})

const mergeSearchResults = computed(() => {
  const query = mergeSearchQuery.value.trim().toLowerCase()
  const currentRoot = getActiveRoot()
  if (!query || !currentRoot) return []

  const results: { root: string; code: string }[] = []
  for (const [root, code] of engine.rootCodes) {
    if (!code?.main || root === currentRoot) continue
    const codeStr = `${code.main || ''}${code.sub || ''}${code.supplement || ''}`
    if (root.toLowerCase().includes(query) || codeStr.toLowerCase().includes(query)) {
      results.push({ root, code: codeStr })
    }
  }
  return results.slice(0, 20)
})

function selectMergeTarget(root: string) {
  mergeTarget.value = root
  mergeSearchQuery.value = ''
}

function clearMergeTarget() {
  mergeTarget.value = ''
  mergeSearchQuery.value = ''
}

function openTransformerWithCurrentIds() {
  const root = getActiveRoot()
  const ids = activeRootIds.value
  if (!root || !ids || ids === '—') {
    toast('当前字根没有可用的 IDS 结构式')
    return
  }

  setTransformerDraft({
    name: `${root} IDS 变换`,
    mode: 'regex',
    pattern: ids,
    replacement: '',
  })
  closeRootCodeDialog()
  switchPage('data')
}
</script>

<template>
  <aside class="detail-panel">
    <h3>字详情</h3>
    <div v-if="!detail" class="empty">点击任意汉字查看详情</div>
    <template v-else>
      <div class="char-display" :class="{ 'pua-font': isCharBracedRoot }">{{ displayChar }}</div>

      <div class="info-row">
        <div class="label">拆分结果</div>
        <div class="leaves-container">
          <template v-for="(leaf, index) in detail.leaves" :key="index">
            <button
              class="leaf-btn"
              :class="{
                'is-root': isLeafRoot(leaf),
                'is-equiv': isLeafEquivRoot(leaf)
              }"
              @click="openLeafDialog(leaf)"
              :title="isLeafRoot(leaf) ? '点击编辑字根设置' : isLeafEquivRoot(leaf) ? `等效字根，主字根: ${getLeafMainRoot(leaf)}` : '点击添加为字根'"
            >
              <span class="leaf-char" :class="{ 'pua-font': isBracedRoot(leaf) }">{{ bracedRootToPua(leaf) }}</span>
              <span v-if="isLeafRoot(leaf)" class="leaf-badge">✓</span>
              <span v-else-if="isLeafEquivRoot(leaf)" class="leaf-badge equiv">≡</span>
            </button>
            <span v-if="index < detail.leaves.length - 1" class="leaf-sep">+</span>
          </template>
        </div>
      </div>

      <div class="info-row">
        <div class="label">结构式</div>
        <div class="value mono">{{ detail.ids }}</div>
      </div>

      <div class="info-row">
        <div class="label">原始 IDS</div>
        <div class="value mono small">{{ detail.origIDS }}</div>
      </div>

      <div class="info-grid">
        <div class="info-item">
          <div class="label">笔画数</div>
          <div class="value">{{ detail.sc || '—' }}</div>
        </div>
        <div class="info-item">
          <div class="label">词频</div>
          <div class="value">{{ detail.fq }}</div>
        </div>
        <div class="info-item">
          <div class="label">Unicode</div>
          <div class="value mono">{{ detail.code }}</div>
        </div>
        <div class="info-item">
          <div class="label">区段</div>
          <div class="value">
            <span class="tag tag-primary">{{ detail.block }}</span>
          </div>
        </div>
      </div>

      <div class="info-row">
        <div class="label">拼音</div>
        <div class="value">
          <template v-if="detail.pinyinList.length > 0">
            <span v-for="(p, i) in detail.pinyinList" :key="i" class="pinyin-item">
              <span class="pinyin-text">{{ p.py }}</span>
              <span v-if="p.freq > 0" class="pinyin-freq">({{ formatFreq(p.freq) }})</span>
            </span>
          </template>
          <span v-else>—</span>
        </div>
      </div>

      <div class="info-row">
        <div class="label">笔画编码</div>
        <div class="value">
          <template v-if="detail.strokeList.length > 0">
            <div v-for="(s, i) in detail.strokeList" :key="i" class="stroke-item">
              <span class="mono small">{{ s }}</span>
              <span class="stroke-label">{{ i === 0 ? '(大陆)' : '(台湾)' }}</span>
            </div>
          </template>
          <span v-else>—</span>
        </div>
      </div>

      <div class="info-row">
        <div class="label">状态</div>
        <div class="value">
          <span v-if="detail.isRoot" class="tag tag-success">是字根</span>
          <span v-else class="tag tag-warning">非字根</span>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-sm" :class="detail.isRoot ? 'btn-danger' : 'btn-success'" @click="toggleRoot">
          {{ detail.isRoot ? '移除字根' : '设为字根' }}
        </button>
      </div>
    </template>

    <Teleport to="body">
      <div class="overlay" :class="{ show: showRootCodeDialog }" @click.self="closeRootCodeDialog">
        <div class="modal">
          <h2>{{ dialogTitle }}</h2>
          <div class="form-group">
            <label>编码设置</label>
            <div class="code-inputs">
              <KeySelect v-model="codePositions[0]" :allow-empty="true" placeholder="主码" />
              <KeySelect v-model="codePositions[1]" :allow-empty="true" placeholder="2码" />
              <KeySelect v-model="codePositions[2]" :allow-empty="true" placeholder="3码" />
              <KeySelect v-model="codePositions[3]" :allow-empty="true" placeholder="4码" />
            </div>
            <div class="hint">可直接选键位，也可选字根码位创建半归并；留空则只加入字根集</div>
          </div>
          <div class="form-group">
            <label>归并至</label>
            <input
              v-model="mergeSearchQuery"
              type="search"
              class="input"
              placeholder="搜索已有字根（留空表示不归并）"
            />
            <div v-if="mergeSearchResults.length > 0" class="merge-results">
              <button
                v-for="item in mergeSearchResults"
                :key="item.root"
                type="button"
                class="merge-result-item"
                @click="selectMergeTarget(item.root)"
              >
                <span :class="{ 'pua-font': isBracedRoot(item.root) }">{{ bracedRootToPua(item.root) }}</span>
                <span class="mono small">{{ item.code.toUpperCase() }}</span>
              </button>
            </div>
            <div v-if="mergeTarget" class="merge-target-row">
              <div class="hint">当前归并目标：{{ mergeTarget }}</div>
              <button type="button" class="btn btn-sm btn-outline" @click="clearMergeTarget">取消归并</button>
            </div>
          </div>
          <div class="form-group">
            <label>IDS 变换器</label>
            <div class="hint mono">{{ activeRootIds || '—' }}</div>
            <button type="button" class="btn btn-sm" @click="openTransformerWithCurrentIds">添加 IDS 变换器</button>
          </div>
          <div class="modal-actions">
            <button class="btn" @click="closeRootCodeDialog">取消</button>
            <button class="btn btn-primary" @click="confirmSetRoot">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.detail-panel {
  background: var(--bg2);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  padding: 20px;
}
h3 {
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  letter-spacing: 0.5px;
}
.empty {
  color: var(--text2);
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
}
.char-display {
  font-size: 64px;
  text-align: center;
  padding: 24px;
  background: var(--bg3);
  border-radius: 8px;
  margin-bottom: 20px;
  line-height: 1.2;
  color: var(--text);
}
.info-row {
  margin-bottom: 14px;
}
.label {
  font-size: 11px;
  color: var(--text2);
  margin-bottom: 4px;
  font-weight: 500;
}
.value {
  font-size: 14px;
  color: var(--text);
}
.value.mono {
  font-family: monospace;
}
.value.small {
  font-size: 12px;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}
.info-item {
  margin-bottom: 0;
}
.actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pinyin-item {
  display: inline-block;
  margin-right: 8px;
  margin-bottom: 4px;
}
.pinyin-text {
  color: var(--text);
}
.pinyin-freq {
  font-size: 11px;
  color: var(--text2);
  margin-left: 2px;
}
.pinyin-item:not(:last-child)::after {
  content: ',';
  color: var(--text2);
}
.stroke-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.stroke-label {
  font-size: 11px;
  color: var(--text2);
  background: var(--bg3);
  padding: 1px 4px;
  border-radius: 3px;
}
.leaves-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.leaf-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 4px 8px;
  font-size: 16px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}
.leaf-btn:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.leaf-btn.is-root {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}
.leaf-btn.is-root:hover {
  background: var(--primary-dark, #0066cc);
  border-color: var(--primary-dark, #0066cc);
}
.leaf-btn.is-equiv {
  background: rgba(19, 194, 194, 0.15);
  border-color: #13c2c2;
  color: #0d8a8a;
}
.leaf-btn.is-equiv:hover {
  background: rgba(19, 194, 194, 0.25);
  border-color: #13c2c2;
  color: #0d8a8a;
}
.leaf-char {
  font-weight: 500;
}
.leaf-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--success, #28a745);
  color: white;
  border-radius: 50%;
}
.leaf-badge.equiv {
  background: #13c2c2;
}
.leaf-sep {
  color: var(--text2);
  font-weight: 600;
  font-size: 12px;
  margin: 0 2px;
}
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
  min-width: 320px;
  max-width: 520px;
  box-shadow: var(--shadow2);
}
.modal h2 {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 6px;
  font-weight: 500;
}
.form-group .input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.2s;
}
.form-group .input:focus {
  border-color: var(--primary);
}
.code-inputs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.form-group .hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text2);
  line-height: 1.4;
}
.merge-results {
  margin-top: 8px;
  max-height: 160px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.merge-result-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  padding: 8px 10px;
  cursor: pointer;
}
.merge-result-item:last-child {
  border-bottom: none;
}
.merge-result-item:hover {
  background: var(--bg3);
}
.merge-target-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
