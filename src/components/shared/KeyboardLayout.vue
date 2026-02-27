<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { RootCode, codeToString, parseCode } from '../../engine/config'

const { engine, toast, refreshStats, rootsVersion } = useEngine()

// 31键布局
const KEYBOARD_LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ['_'], // 空格键
]

// 当前选中的键位
const selectedKey = ref<string | null>(null)

// 获取某键位上的所有字根
const rootsOnKey = computed(() => {
  rootsVersion.value
  const result = new Map<string, { root: string; code: RootCode }[]>()

  // 初始化所有键位
  for (const row of KEYBOARD_LAYOUT) {
    for (const key of row) {
      result.set(key, [])
    }
  }

  // 遍历所有字根，按主键位分组
  for (const root of engine.roots) {
    let code = engine.rootCodes.get(root)
    // 如果没有编码，默认为 "d"
    if (!code) {
      code = { root, main: 'd' }
    }
    const mainKey = code.main.toLowerCase()
    if (result.has(mainKey)) {
      result.get(mainKey)!.push({ root, code })
    }
  }

  // 对每个键位内的字根排序
  for (const [key, roots] of result) {
    roots.sort((a, b) => a.root.localeCompare(b.root))
  }

  return result
})

// 当前选中键位的字根列表
const selectedRoots = computed(() => {
  if (!selectedKey.value) return []
  return rootsOnKey.value.get(selectedKey.value) || []
})

// 编辑相关
const editingRoot = ref<string | null>(null)
const editForm = ref({ root: '', code: '' })

function selectKey(key: string) {
  selectedKey.value = selectedKey.value === key ? null : key
}

function openEditModal(root: string) {
  editingRoot.value = root
  const code = engine.rootCodes.get(root)
  editForm.value = {
    root,
    code: code ? codeToString(code) : 'd',
  }
}

function closeEditModal() {
  editingRoot.value = null
}

function saveCode() {
  if (!editForm.value.root) {
    toast('请输入字根')
    return
  }
  if (!editForm.value.code || editForm.value.code.length < 1) {
    toast('请输入编码')
    return
  }

  const parsed = parseCode(editForm.value.code)
  engine.rootCodes.set(editForm.value.root, { root: editForm.value.root, ...parsed })

  // 确保字根在 roots 集合中
  engine.roots.add(editForm.value.root)

  closeEditModal()
  refreshStats()
  toast('编码已保存')
}

function removeRoot(root: string) {
  engine.rootCodes.delete(root)
  engine.roots.delete(root)
  refreshStats()
  toast(`已移除字根: ${root}`)
}

// 更新字根编码
function updateRootCode(root: string, newCode: string) {
  if (!newCode) return
  const parsed = parseCode(newCode)
  engine.rootCodes.set(root, { root, ...parsed })
  refreshStats()
}
</script>

<template>
  <div class="keyboard-container">
    <!-- 键盘区域 -->
    <div class="keyboard">
      <div v-for="(row, ri) in KEYBOARD_LAYOUT.slice(0, 3)" :key="ri" class="keyboard-row">
        <div
          v-for="key in row"
          :key="key"
          class="key"
          :class="{
            'key-populated': rootsOnKey.get(key)?.length,
            'key-selected': selectedKey === key
          }"
          @click="selectKey(key)"
        >
          <span class="key-label">{{ key.toUpperCase() }}</span>
          <span v-if="rootsOnKey.get(key)?.length" class="key-count">
            {{ rootsOnKey.get(key)?.length }}
          </span>
        </div>
      </div>
      <!-- 空格键 -->
      <div class="keyboard-row space-row">
        <div
          class="key key-space"
          :class="{
            'key-populated': rootsOnKey.get('_')?.length,
            'key-selected': selectedKey === '_'
          }"
          @click="selectKey('_')"
        >
          <span class="key-label">空格</span>
          <span v-if="rootsOnKey.get('_')?.length" class="key-count">
            {{ rootsOnKey.get('_')?.length }}
          </span>
        </div>
      </div>
    </div>

    <!-- 字根详情区域 -->
    <div v-if="selectedKey" class="roots-panel">
      <div class="roots-panel-header">
        <h3>键位 <strong>{{ selectedKey === '_' ? '空格' : selectedKey.toUpperCase() }}</strong> 的字根</h3>
        <span class="roots-count">{{ selectedRoots.length }} 个</span>
      </div>
      <div class="roots-list">
        <div
          v-for="item in selectedRoots"
          :key="item.root"
          class="root-item"
          :class="{ 'editing': editingRoot === item.root }"
        >
          <span class="root-char">{{ item.root }}</span>
          <input
            v-if="editingRoot === item.root"
            v-model="editForm.code"
            class="code-input"
            maxlength="10"
            placeholder="编码"
            @keyup.enter="saveCode"
            @keyup.esc="closeEditModal"
          />
          <span v-else class="root-code" @click="openEditModal(item.root)">
            <span class="main">{{ item.code.main.toUpperCase() }}</span>
            <span v-if="item.code.sub" class="sub">{{ item.code.sub }}</span>
            <span v-if="item.code.supplement" class="supplement">{{ item.code.supplement }}</span>
          </span>
          <div v-if="editingRoot === item.root" class="root-actions">
            <button class="btn btn-sm" @click="saveCode">保存</button>
            <button class="btn btn-sm btn-outline" @click="closeEditModal">取消</button>
          </div>
          <div v-else class="root-actions">
            <button class="btn btn-sm btn-outline" @click="openEditModal(item.root)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="removeRoot(item.root)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.keyboard-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.keyboard {
  background: var(--bg2);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.keyboard-row {
  display: flex;
  gap: 6px;
}

.key {
  flex: 1;
  height: 64px;
  background: var(--bg3);
  border: 2px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.key:hover {
  border-color: var(--accent);
  background: var(--bg);
}

.key-populated {
  background: var(--bg);
  border-color: var(--accent);
}

.key-selected {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.key-selected .key-count {
  background: rgba(255,255,255,0.2);
  color: white;
}

.key-label {
  font-size: 18px;
  font-weight: 600;
}

.key-count {
  font-size: 12px;
  background: var(--accent);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
}

/* 空格键 */
.space-row {
  margin-top: 4px;
}

.key-space {
  max-width: none;
  width: 100%;
  height: 48px;
  flex: none;
}

/* 字根面板 */
.roots-panel {
  flex: 1;
  background: var(--bg2);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.roots-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
}

.roots-panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.roots-panel-header strong {
  color: var(--accent);
}

.roots-count {
  font-size: 12px;
  color: var(--text2);
}

.roots-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
}

.root-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  transition: all 0.15s;
}

.root-item.editing {
  border-color: var(--accent);
  background: var(--bg2);
}

.root-char {
  font-size: 20px;
  min-width: 28px;
  text-align: center;
}

.root-code {
  font-family: monospace;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  background: var(--bg3);
  border-radius: 4px;
  min-width: 40px;
  text-align: center;
}

.root-code:hover {
  background: var(--bg4);
}

.root-code .sub { color: #2196F3; }
.root-code .supplement { color: #4CAF50; }

.code-input {
  width: 80px;
  padding: 4px 8px;
  font-family: monospace;
  font-size: 14px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--bg);
}

.root-actions {
  display: flex;
  gap: 4px;
}
</style>