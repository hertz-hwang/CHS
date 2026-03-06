<script setup lang="ts">
import { computed, ref, nextTick, onUnmounted, watch } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { codeToString } from '../../engine/config'

const props = defineProps<{
  modelValue: string  // 键位字母，如 'd'；或元素引用，如 '一。0'
  allowEmpty?: boolean  // 是否允许选择空值
  placeholder?: string
  disabled?: boolean  // 是否禁用
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { engine, rootsVersion } = useEngine()

// 搜索关键词（用于字根码位搜索）
const searchQuery = ref('')

// 触发器元素引用
const triggerRef = ref<HTMLElement | null>(null)

// 下拉面板定位样式
const dropdownStyle = ref<Record<string, string>>({})

// 31 键键盘布局
const KEYBOARD_LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ['_'], // 空格键
]

// 获取已编码字根列表（用于元素引用）
const encodedRoots = computed(() => {
  rootsVersion.value  // 触发响应式更新
  const list: { root: string; code: string }[] = []
  for (const [root, code] of engine.rootCodes) {
    if (code && code.main) {
      list.push({ root, code: codeToString(code) })
    }
  }
  return list.sort((a, b) => a.code.localeCompare(b.code))
})

// 判断是否为笔画编码搜索
function isStrokeCodeQuery(query: string): boolean {
  return /^[1-5]+$/.test(query)
}

// 获取字的笔画编码（数字形式）
function getStrokeCode(root: string): string {
  const strokes = engine.getStrokes(root)
  return strokes.length > 0 ? strokes[0] : ''
}

// 过滤后的字根码位选项
const filteredCodeOptions = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  const options: { value: string; label: string; code?: string; strokeCode?: string }[] = []

  // 空值选项
  if (props.allowEmpty) {
    options.push({ value: '', label: '(空)' })
  }

  // 判断是否为笔画搜索
  const strokeSearch = isStrokeCodeQuery(query)

  // 元素码位引用
  if (!query || query.length >= 1) {
    for (const { root, code } of encodedRoots.value) {
      let match = false
      
      if (strokeSearch) {
        // 笔画编码搜索
        const strokeCode = getStrokeCode(root)
        match = strokeCode.includes(query)
      } else {
        // 普通搜索：字根或编码
        const rootMatch = !query || root.includes(query)
        const codeMatch = !query || code.toLowerCase().includes(query)
        match = rootMatch || codeMatch
      }
      
      if (match) {
        // 为每个码位创建选项
        for (let i = 0; i < code.length; i++) {
          const value = `${root}.${i}`
          const label = `${root}.${i + 1}码 (${code[i].toUpperCase()})`
          const strokeCode = getStrokeCode(root)
          options.push({ value, label, code, strokeCode })
        }
      }
    }
  }

  // 笔画搜索时，完全匹配的排在前面
  if (strokeSearch) {
    options.sort((a, b) => {
      const exactMatchA = a.strokeCode === query ? 0 : 1
      const exactMatchB = b.strokeCode === query ? 0 : 1
      return exactMatchA - exactMatchB
    })
  }

  return options.slice(0, 100)  // 限制选项数量
})

// 当前选中的显示文本
const displayLabel = computed(() => {
  if (!props.modelValue) return props.placeholder || '选择键位'

  // 字母键位
  if (props.modelValue.length === 1 || props.modelValue === '_') {
    return props.modelValue === '_' ? '空格' : props.modelValue.toUpperCase()
  }

  // 元素引用格式：字根。索引
  const parts = props.modelValue.split('.')
  if (parts.length === 2) {
    const [root, indexStr] = parts
    const idx = parseInt(indexStr, 10)
    const code = engine.rootCodes.get(root)
    if (code) {
      const codeStr = codeToString(code)
      const char = codeStr[idx] || '?'
      return `${root}.${idx + 1}码 (${char.toUpperCase()})`
    }
    return props.modelValue
  }

  return props.modelValue
})

// 下拉开关
const isOpen = ref(false)

// 下拉方向
const dropdownPosition = ref<'below' | 'above'>('below')

// 选择键盘键位
function selectKey(key: string) {
  emit('update:modelValue', key)
  closeDropdown()
}

// 选择字根码位
function selectCodeOption(value: string) {
  emit('update:modelValue', value)
  closeDropdown()
}

// 关闭下拉
function closeDropdown() {
  isOpen.value = false
  searchQuery.value = ''
}

// 计算下拉面板位置
function updateDropdownPosition() {
  if (!triggerRef.value) return
  
  const rect = triggerRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const dropdownHeight = 420  // 下拉框预估高度
  const dropdownWidth = 360    // 下拉框宽度
  
  // 判断是否有足够空间在下方显示
  const showBelow = rect.bottom + dropdownHeight <= viewportHeight - 20
  dropdownPosition.value = showBelow ? 'below' : 'above'
  
  // 计算水平位置，确保不超出视口
  let left = rect.left
  if (left + dropdownWidth > viewportWidth - 20) {
    left = Math.max(10, viewportWidth - dropdownWidth - 20)
  }
  
  // 计算垂直位置
  const top = showBelow ? rect.bottom + 4 : rect.top - dropdownHeight - 4
  
  dropdownStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: showBelow ? `${rect.bottom + 4}px` : 'auto',
    bottom: showBelow ? 'auto' : `${viewportHeight - rect.top + 4}px`,
    width: `${Math.min(dropdownWidth, viewportWidth - 20)}px`,
  }
}

// 切换下拉
function toggleDropdown() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    searchQuery.value = ''
  } else {
    // 打开时计算位置
    nextTick(() => {
      updateDropdownPosition()
    })
  }
}

// 监听滚动和窗口大小变化
function handleScroll() {
  if (isOpen.value) {
    updateDropdownPosition()
  }
}

function handleResize() {
  if (isOpen.value) {
    updateDropdownPosition()
  }
}

// 组件卸载时清理
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleResize)
})

// 打开时添加监听器
function onOpen() {
  window.addEventListener('scroll', handleScroll, true)
  window.addEventListener('resize', handleResize)
}

// 关闭时移除监听器
function onClose() {
  window.removeEventListener('scroll', handleScroll, true)
  window.removeEventListener('resize', handleResize)
}

// 监听 isOpen 变化
watch(isOpen, (val) => {
  if (val) {
    onOpen()
  } else {
    onClose()
  }
})
</script>

<template>
  <div class="key-select" :class="{ disabled, 'is-open': isOpen }" v-click-outside="closeDropdown">
    <div ref="triggerRef" class="select-trigger" :class="{ disabled }" @click="toggleDropdown">
      <span class="select-value">{{ displayLabel }}</span>
      <span class="select-arrow" :class="{ open: isOpen }">▼</span>
    </div>
    
    <!-- 键盘布局下拉面板（Teleport 到 body，定位在触发器附近） -->
    <Teleport to="body">
      <Transition name="dropdown">
        <div v-if="isOpen" class="key-select-dropdown" :class="dropdownPosition" :style="dropdownStyle">
          <!-- 键盘布局区域 -->
          <div class="keyboard-section">
            <div class="section-label">键位</div>
            <div class="keyboard">
              <div v-for="(row, ri) in KEYBOARD_LAYOUT.slice(0, 3)" :key="ri" class="keyboard-row">
                <div
                  v-for="key in row"
                  :key="key"
                  class="key"
                  :class="{ 'key-selected': modelValue === key }"
                  @click="selectKey(key)"
                >
                  <span class="key-label">{{ key === '_' ? '空格' : key.toUpperCase() }}</span>
                </div>
              </div>
              <!-- 空格键 -->
              <div class="keyboard-row space-row">
                <div
                  class="key key-space"
                  :class="{ 'key-selected': modelValue === '_' }"
                  @click="selectKey('_')"
                >
                  <span class="key-label">空格</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 字根码位区域 -->
          <div class="code-section">
            <div class="section-header">
              <span class="section-label">字根码位</span>
              <input
                v-model="searchQuery"
                type="search"
                class="code-search"
                placeholder="搜索字根或编码..."
                @click.stop
              />
            </div>
            <div class="code-options">
              <!-- 空值 -->
              <div
                v-if="allowEmpty"
                class="code-option"
                :class="{ selected: modelValue === '' }"
                @click="selectCodeOption('')"
              >
                (空)
              </div>
              <!-- 字根码位列表 -->
              <div
                v-for="opt in filteredCodeOptions.filter(o => o.value !== '')"
                :key="opt.value"
                class="code-option"
                :class="{ selected: modelValue === opt.value }"
                @click="selectCodeOption(opt.value)"
              >
                <span class="code-label">{{ opt.label }}</span>
                <span v-if="opt.strokeCode" class="stroke-code">{{ opt.strokeCode }}</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.key-select {
  position: relative;
  min-width: 80px;
}

.key-select.is-open .select-trigger {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-bg);
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.select-trigger:hover {
  border-color: var(--primary);
}

.select-trigger.disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background: var(--bg3);
}

.select-trigger.disabled:hover {
  border-color: var(--border);
}

.key-select.disabled {
  pointer-events: none;
}

.select-value {
  color: var(--text);
}

.select-arrow {
  font-size: 10px;
  color: var(--text2);
  transition: transform 0.2s;
}

.select-arrow.open {
  transform: rotate(180deg);
}

/* 下拉面板（固定定位，定位在触发器附近） */
.key-select-dropdown {
  position: fixed;
  z-index: 1000;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-height: 420px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 下拉方向 */
.key-select-dropdown.below {
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

.key-select-dropdown.above {
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
}

/* 下拉动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.dropdown-enter-to,
.dropdown-leave-from {
  opacity: 1;
  transform: translateY(0);
}

/* 键盘区域 */
.keyboard-section {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.section-label {
  font-size: 11px;
  color: var(--text2);
  font-weight: 500;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.keyboard {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.keyboard-row {
  display: flex;
  gap: 4px;
}

.key {
  flex: 1;
  height: 40px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.key:hover {
  border-color: var(--primary);
  background: var(--bg);
}

.key-selected {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.key-label {
  font-size: 14px;
  font-weight: 600;
}

/* 空格键 */
.space-row {
  margin-top: 4px;
}

.key-space {
  height: 36px;
}

/* 字根码位区域 */
.code-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 120px;
  max-height: 200px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.section-header .section-label {
  font-size: 11px;
  color: var(--text2);
  font-weight: 500;
  white-space: nowrap;
  margin: 0;
}

.code-search {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  background: var(--bg);
  color: var(--text);
}

.code-search:focus {
  border-color: var(--primary);
}

.code-options {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.code-option {
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.code-option:hover {
  background: var(--primary-bg);
}

.code-option.selected {
  background: var(--primary);
  color: white;
}

.code-option.selected .stroke-code {
  color: rgba(255, 255, 255, 0.8);
}

.code-label {
  font-family: monospace;
}

.stroke-code {
  font-size: 11px;
  color: var(--text3);
  margin-left: 6px;
  font-family: monospace;
}
</style>
