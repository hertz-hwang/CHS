<script setup lang="ts">
import { ref, computed } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import KeyboardLayout from '../shared/KeyboardLayout.vue'
import { useEngine } from '../../composables/useEngine'
import { parseCode } from '../../engine/config'

const { engine, refreshStats, toast, rootsVersion } = useEngine()

// 弹窗状态
const modalMode = ref<'set' | 'add' | 'remove' | null>(null)
const modalInput = ref('')

// 随机打乱弹窗
const showShuffleModal = ref(false)
const shufflePattern = ref('[a-z]')

// 所有可用键位
const ALL_KEYS = 'qwertyuiopasdfghjkl;zxcvbnm,./_'

// 添加字根弹窗
const showAddRoot = ref(false)
const addForm = ref({ root: '', code: 'd' })

// 统计信息
const rootsCount = computed(() => {
  rootsVersion.value
  return engine.roots.size
})

// 未编码的字根（没有在 rootCodes 中定义）
const unencodedRoots = computed(() => {
  rootsVersion.value
  const result: string[] = []
  for (const root of engine.roots) {
    if (!engine.rootCodes.has(root)) {
      result.push(root)
    }
  }
  return result.sort()
})

function openModal(mode: 'set' | 'add' | 'remove') {
  modalMode.value = mode
  modalInput.value = mode === 'set' ? [...engine.roots].join('') : ''
}

function confirmModal() {
  if (modalMode.value === 'set') {
    engine.setRoots(modalInput.value)
    toast(`已设置 ${engine.roots.size} 个字根`)
  } else if (modalMode.value === 'add') {
    engine.addRoots(modalInput.value)
    toast(`已追加，共 ${engine.roots.size} 个`)
  } else if (modalMode.value === 'remove') {
    engine.removeRoots(modalInput.value)
    toast(`已移除，共 ${engine.roots.size} 个`)
  }
  modalMode.value = null
  refreshStats()
}

function initAtomic() {
  if (!engine.decomp.size) {
    toast('请先加载数据')
    return
  }
  engine.useAtomicRoots()
  refreshStats()
  toast(`原子字根: ${engine.roots.size} 个`)
}

function exportRoots() {
  const blob = new Blob([engine.exportRootsText()], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'roots.txt'
  a.click()
  toast('已导出')
}

// 添加新字根
function addRoot() {
  if (!addForm.value.root) {
    toast('请输入字根')
    return
  }

  const root = addForm.value.root
  const code = addForm.value.code || 'd'

  // 使用 setRootCode 方法设置编码，自动同步归并字根编码
  engine.setRootCode(root, code)

  showAddRoot.value = false
  addForm.value = { root: '', code: 'd' }
  refreshStats()
  toast(`已添加字根: ${root}`)
}

// 为所有未编码字根设置默认编码
function setDefaultCodes() {
  let count = 0
  for (const root of engine.roots) {
    if (!engine.rootCodes.has(root)) {
      // 使用 setRootCode 方法设置编码，自动同步归并字根编码
      engine.setRootCode(root, 'd')
      count++
    }
  }
  refreshStats()
  toast(`已为 ${count} 个字根设置默认编码 "d"`)
}

// 解析键位正则模式，返回匹配的键位列表
function parseKeyPattern(pattern: string): string[] {
  const keys: string[] = []

  // 使用正则匹配所有字符
  const regex = new RegExp(pattern, 'gi')
  const matches = ALL_KEYS.match(regex) || []

  // 去重并转为小写
  for (const k of matches) {
    const key = k.toLowerCase()
    if (!keys.includes(key)) {
      keys.push(key)
    }
  }

  return keys
}

// 随机打乱所有字根到指定键位上
function shuffleRoots() {
  const keys = parseKeyPattern(shufflePattern.value)

  if (keys.length === 0) {
    toast('未匹配到任何键位')
    return
  }

  if (engine.roots.size === 0) {
    toast('没有字根可打乱')
    return
  }

  // 收集所有字根及其编码信息（保留 sub 和 supplement）
  const rootsData: { root: string; sub?: string; supplement?: string }[] = []

  for (const root of engine.roots) {
    const code = engine.rootCodes.get(root)
    rootsData.push({
      root,
      sub: code?.sub,
      supplement: code?.supplement,
    })
  }

  // Fisher-Yates 洗牌算法
  for (let i = rootsData.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rootsData[i], rootsData[j]] = [rootsData[j], rootsData[i]]
  }

  // 计算每个键位应该分配的字根数量（尽量均匀）
  const baseCount = Math.floor(rootsData.length / keys.length)
  const extraCount = rootsData.length % keys.length

  // 随机选择哪些键位多分配一个字根
  const extraKeys = [...keys]
  for (let i = extraKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[extraKeys[i], extraKeys[j]] = [extraKeys[j], extraKeys[i]]
  }
  const extraKeySet = new Set(extraKeys.slice(0, extraCount))

  // 分配字根到键位
  let rootIndex = 0
  for (const key of keys) {
    const count = baseCount + (extraKeySet.has(key) ? 1 : 0)
    for (let i = 0; i < count && rootIndex < rootsData.length; i++) {
      const data = rootsData[rootIndex]
      engine.rootCodes.set(data.root, {
        root: data.root,
        main: key,
        sub: data.sub,
        supplement: data.supplement,
      })
      rootIndex++
    }
  }

  refreshStats()
  showShuffleModal.value = false
  toast(`已将 ${rootsData.length} 个字根随机分配到 ${keys.length} 个键位`)
}

const modalTitle = computed(() => ({
  set: '手动设置字根',
  add: '追加字根',
  remove: '移除字根',
}[modalMode.value!] || ''))
</script>

<template>
  <div class="roots-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="title">设置字根</span>
        <span class="count">{{ rootsCount }} 个字根</span>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-success btn-sm" @click="initAtomic">原子字根</button>
        <button class="btn btn-purple btn-sm" @click="showAddRoot = true">+ 添加</button>
        <button class="btn btn-outline btn-sm" @click="openModal('add')">批量追加</button>
        <button class="btn btn-outline btn-sm" @click="openModal('remove')">批量移除</button>
        <button class="btn btn-outline btn-sm" @click="showShuffleModal = true">随机打乱</button>
        <button class="btn btn-outline btn-sm" @click="exportRoots">导出</button>
        <button
          v-if="unencodedRoots.length > 0"
          class="btn btn-sm"
          @click="setDefaultCodes"
        >
          设默认 ({{ unencodedRoots.length }})
        </button>
      </div>
    </div>

    <!-- 设置字根 -->
    <KeyboardLayout />
  </div>

  <!-- 批量操作弹窗 -->
  <ModalDialog :visible="modalMode !== null" :title="modalTitle" @close="modalMode = null">
    <p style="font-size: 13px; color: var(--text2); margin-bottom: 8px">
      {{ modalMode === 'set' ? '输入字根（替换全部）：' : modalMode === 'add' ? '输入要追加的字根：' : '输入要移除的字根：' }}
    </p>
    <textarea v-model="modalInput" style="width: 100%" />
    <template #actions>
      <button class="btn btn-outline" @click="modalMode = null">取消</button>
      <button
        class="btn"
        :class="modalMode === 'remove' ? 'btn-danger' : modalMode === 'add' ? 'btn-purple' : ''"
        @click="confirmModal"
      >
        {{ modalMode === 'set' ? '确定' : modalMode === 'add' ? '追加' : '移除' }}
      </button>
    </template>
  </ModalDialog>

  <!-- 随机打乱弹窗 -->
  <ModalDialog :visible="showShuffleModal" title="随机打乱字根" @close="showShuffleModal = false">
    <div class="shuffle-form">
      <p style="font-size: 13px; color: var(--text2); margin-bottom: 12px">
        将所有字根随机分配到指定键位上，尽量均匀分布：
      </p>
      <input
        v-model="shufflePattern"
        type="text"
        placeholder="如: [a-z]、[a-y]、[a-z;,./_]"
        style="width: 100%; font-family: monospace"
      />
      <div style="margin-top: 12px; font-size: 12px; color: var(--text2)">
        <p>示例：</p>
        <ul style="margin: 4px 0; padding-left: 20px">
          <li><code>[a-z]</code> - 所有字母键（26键）</li>
          <li><code>[asdfjkl;]</code> - 左右手基准键（8键）</li>
          <li><code>[a-z;,./_]</code> - 全部31键</li>
        </ul>
        <p style="margin-top: 8px">
          目标键位: <strong>{{ parseKeyPattern(shufflePattern).join(' ').toUpperCase() || '无' }}</strong>
          （{{ parseKeyPattern(shufflePattern).length }} 个）
        </p>
        <p style="margin-top: 4px">
          当前字根: <strong>{{ rootsCount }}</strong> 个
        </p>
      </div>
    </div>
    <template #actions>
      <button class="btn btn-outline" @click="showShuffleModal = false">取消</button>
      <button class="btn btn-purple" @click="shuffleRoots">打乱</button>
    </template>
  </ModalDialog>

  <!-- 添加字根弹窗 -->
  <ModalDialog :visible="showAddRoot" title="添加字根" @close="showAddRoot = false">
    <div class="add-form">
      <div class="form-row">
        <label>字根</label>
        <input v-model="addForm.root" type="text" placeholder="输入字根字符" />
      </div>
      <div class="form-row">
        <label>编码</label>
        <input v-model="addForm.code" type="text" maxlength="10" placeholder="默认: d" />
      </div>
      <div v-if="addForm.code" class="code-preview">
        预览：
        <span class="main">{{ addForm.code[0]?.toUpperCase() || 'D' }}</span>
        <span v-if="addForm.code.length > 1" class="sub">{{ addForm.code[1] }}</span>
        <span v-if="addForm.code.length > 2" class="supplement">{{ addForm.code.slice(2) }}</span>
      </div>
    </div>
    <template #actions>
      <button class="btn btn-outline" @click="showAddRoot = false">取消</button>
      <button class="btn btn-success" @click="addRoot">添加</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.roots-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px - 48px);
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 16px;
  font-weight: 600;
}

.count {
  font-size: 13px;
  color: var(--text2);
  background: var(--bg3);
  padding: 4px 10px;
  border-radius: 4px;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.add-form {
  min-width: 280px;
}

.form-row {
  margin-bottom: 16px;
}

.form-row label {
  display: block;
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 6px;
  font-weight: 500;
}

.form-row input {
  width: 100%;
  padding: 10px 12px;
  font-size: 15px;
}

.code-preview {
  margin-bottom: 16px;
  font-family: monospace;
  font-size: 16px;
  padding: 12px;
  background: var(--bg3);
  border-radius: 6px;
}

.code-preview .main { 
  font-weight: 600; 
  color: var(--primary);
}
.code-preview .sub { 
  color: var(--primary); 
  opacity: 0.7;
}
.code-preview .supplement { 
  color: var(--success); 
}

.shuffle-form {
  min-width: 360px;
}

.shuffle-form code {
  background: var(--primary-bg);
  color: var(--primary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}
</style>
