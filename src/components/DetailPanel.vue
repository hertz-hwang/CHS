<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEngine } from '../composables/useEngine'
import { unicodeBlock, unicodeHex } from '../engine/unicode'
import { isBracedRoot, bracedRootToPua } from '../utils/pua'
import type { PinyinInfo } from '../engine/engine'

const { engine, selectedChar, refreshStats, toast, switchPage, setSearchChar, saveCurrentConfig } = useEngine()

// 字根编码对话框状态
const showRootCodeDialog = ref(false)
const rootCodeInput = ref('')
const editingRoot = ref<string | null>(null)  // 当前正在编辑的字根元素

const detail = computed(() => {
  const ch = selectedChar.value
  if (!ch) return null
  const { leaves, ids } = engine.decompose(ch)
  
  // 获取所有拼音（已按词频降序）
  const pinyinList = engine.getPinyinList(ch)
  
  // 获取所有笔画编码
  const strokeList = engine.getStrokes(ch)
  
  return {
    char: ch, leaves, ids,
    origIDS: engine.decomp.get(ch) || '—',
    sc: engine.strokeCount(ch),
    strokeList,         // 所有笔画编码
    pinyinList,         // 所有拼音信息
    fq: engine.freq.has(ch) ? engine.freq.get(ch) : '—',
    isRoot: engine.roots.has(ch),
    block: unicodeBlock(ch),
    code: unicodeHex(ch),
  }
})

// 格式化拼音显示
function formatPinyin(list: PinyinInfo[]): string {
  if (list.length === 0) return '—'
  return list.map(p => p.py).join(', ')
}

// 格式化词频显示
function formatFreq(freq: number): string {
  if (freq >= 100000000) return (freq / 100000000).toFixed(1) + '亿'
  if (freq >= 10000) return (freq / 10000).toFixed(1) + '万'
  return freq.toLocaleString()
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
    // 打开对话框让用户输入字根编码
    rootCodeInput.value = engine.getRootCodeString(ch) || ''
    showRootCodeDialog.value = true
  }
}

// 确认设置字根编码
function confirmSetRoot() {
  if (!detail.value) return
  const ch = detail.value.char
  const code = rootCodeInput.value.trim()
  
  if (code) {
    engine.setRootCode(ch, code)
    toast(`已设为字根: ${ch}，编码: ${code}`)
  } else {
    engine.addRoots(ch)
    toast(`已设为字根: ${ch}`)
  }
  
  saveCurrentConfig()
  refreshStats()
  showRootCodeDialog.value = false
  selectedChar.value = null
  setTimeout(() => { selectedChar.value = ch }, 0)
}

// 点击字根元素按钮，打开设置编码对话框
function openLeafDialog(leaf: string) {
  // 如果是等效字根，不允许设置编码
  if (engine.isEquivalentRoot(leaf)) {
    const mainRoot = engine.getMainRoot(leaf)
    toast(`"${leaf}" 是 "${mainRoot}" 的等效字根，无法单独设置编码`)
    return
  }
  
  editingRoot.value = leaf
  rootCodeInput.value = engine.getRootCodeString(leaf) || ''
  showRootCodeDialog.value = true
}

// 确认设置字根元素编码
function confirmSetLeafRoot() {
  if (!editingRoot.value) return
  const leaf = editingRoot.value
  const code = rootCodeInput.value.trim()
  
  if (code) {
    engine.setRootCode(leaf, code)
    toast(`已添加字根: ${leaf}，编码: ${code}`)
  } else {
    engine.addRoots(leaf)
    toast(`已添加字根: ${leaf}`)
  }
  
  saveCurrentConfig()
  refreshStats()
  closeRootCodeDialog()
}

// 关闭对话框
function closeRootCodeDialog() {
  showRootCodeDialog.value = false
  editingRoot.value = null
}

// 检查字根元素是否已存在于字根集
function isLeafRoot(leaf: string): boolean {
  return engine.roots.has(leaf)
}

// 检查字根元素是否是等效字根
function isLeafEquivRoot(leaf: string): boolean {
  return engine.isEquivalentRoot(leaf)
}

// 获取等效字根的主字根
function getLeafMainRoot(leaf: string): string | undefined {
  return engine.getMainRoot(leaf)
}

// 对话框确认处理
function handleDialogConfirm() {
  if (editingRoot.value) {
    confirmSetLeafRoot()
  } else {
    confirmSetRoot()
  }
}

// 获取对话框标题
const dialogTitle = computed(() => {
  if (editingRoot.value) {
    return `添加字根: ${editingRoot.value}`
  }
  return '设为字根'
})

// 判断当前字符是否是花括号字根
const isCharBracedRoot = computed(() => {
  return detail.value ? isBracedRoot(detail.value.char) : false
})

// 获取用于显示的字符（花括号字根转换为 PUA 字符）
const displayChar = computed(() => {
  if (!detail.value) return ''
  return bracedRootToPua(detail.value.char)
})

// 跳转到指定页面并带上当前字
function goToPage(page: string) {
  if (!detail.value) return
  setSearchChar(detail.value.char)
  switchPage(page)
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
              :title="isLeafRoot(leaf) ? '已是字根，点击修改编码' : isLeafEquivRoot(leaf) ? `等效字根，主字根: ${getLeafMainRoot(leaf)}` : '点击添加为字根'"
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

    <!-- 字根编码输入对话框 -->
    <Teleport to="body">
      <div class="overlay" :class="{ show: showRootCodeDialog }" @click.self="closeRootCodeDialog">
        <div class="modal">
          <h2>{{ dialogTitle }}</h2>
          <div class="form-group">
            <label>字根编码</label>
            <input
              v-model="rootCodeInput"
              type="text"
              class="input"
              placeholder="输入字根编码（如：a、ab、abc）"
              @keyup.enter="handleDialogConfirm"
            />
            <div class="hint">编码由字母组成，第一个字母为主码，第二个为小码（可选），其余为补码（可选）</div>
          </div>
          <div class="modal-actions">
            <button class="btn" @click="closeRootCodeDialog">取消</button>
            <button class="btn btn-primary" @click="handleDialogConfirm">确定</button>
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
.value.primary {
  color: var(--primary);
  font-weight: 500;
  font-size: 15px;
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

/* 拆分结果按钮样式 */
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

/* 等效字根样式 */
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

/* 对话框样式 */
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
  max-width: 400px;
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
.form-group .hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text2);
  line-height: 1.4;
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
