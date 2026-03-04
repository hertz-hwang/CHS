<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { codeToString } from '../../engine/config'

const props = defineProps<{
  modelValue: string  // 键位字母，如 'd'；或元素引用，如 '一.0'
  allowEmpty?: boolean  // 是否允许选择空值
  placeholder?: string
  disabled?: boolean  // 是否禁用
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { engine, rootsVersion } = useEngine()

// 搜索关键词
const searchQuery = ref('')

// 字母表（31键）
const ALPHABET = 'qwertyuiopasdfghjkl;zxcvbnm,./_'

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

// 过滤后的选项
const filteredOptions = computed(() => {
  const query = searchQuery.value.toLowerCase().trim()
  const options: { value: string; label: string; group: string; code?: string }[] = []

  // 空值选项
  if (props.allowEmpty) {
    options.push({ value: '', label: '(空)', group: 'empty' })
  }

  // 字母键位
  for (const char of ALPHABET) {
    if (!query || char.includes(query)) {
      options.push({
        value: char,
        label: char === '_' ? '空格' : char.toUpperCase(),
        group: 'alphabet'
      })
    }
  }

  // 元素码位引用
  if (!query || query.length >= 1) {
    for (const { root, code } of encodedRoots.value) {
      // 搜索匹配
      const rootMatch = !query || root.includes(query)
      const codeMatch = !query || code.toLowerCase().includes(query)
      if (rootMatch || codeMatch) {
        // 为每个码位创建选项
        for (let i = 0; i < code.length; i++) {
          const value = `${root}.${i}`
          const label = `${root}.${i + 1}码 (${code[i].toUpperCase()})`
          options.push({ value, label, group: 'element', code })
        }
      }
    }
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

  // 元素引用格式：字根.索引
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

// 选择选项
function selectOption(value: string) {
  emit('update:modelValue', value)
  isOpen.value = false
  searchQuery.value = ''
}

// 切换下拉
function toggleDropdown() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (!isOpen.value) {
    searchQuery.value = ''
  } else {
    // 检测是否有足够的空间在下方显示下拉框
    checkDropdownPosition()
  }
}

// 检测下拉框位置
function checkDropdownPosition() {
  // 使用 nextTick 确保 DOM 已更新
  setTimeout(() => {
    const selectEl = document.querySelector('.key-select')
    if (!selectEl) return
    
    const rect = selectEl.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const dropdownHeight = 300  // 下拉框最大高度
    
    // 如果下方空间不足，改为向上展开
    if (rect.bottom + dropdownHeight > viewportHeight - 20) {
      dropdownPosition.value = 'above'
    } else {
      dropdownPosition.value = 'below'
    }
  }, 0)
}
</script>

<template>
  <div class="key-select" :class="{ disabled }" v-click-outside="() => isOpen = false">
    <div class="select-trigger" :class="{ disabled }" @click="toggleDropdown">
      <span class="select-value">{{ displayLabel }}</span>
      <span class="select-arrow" :class="{ open: isOpen }">▼</span>
    </div>
    <div v-if="isOpen" class="select-dropdown" :class="dropdownPosition">
      <input
        v-model="searchQuery"
        type="search"
        class="select-search"
        placeholder="搜索键位或字根..."
        @click.stop
      />
      <div class="select-options">
        <!-- 空值 -->
        <div v-if="allowEmpty" class="option-group">
          <div
            class="option-item"
            :class="{ selected: modelValue === '' }"
            @click="selectOption('')"
          >
            (空)
          </div>
        </div>

        <!-- 字母键位 -->
        <div class="option-group">
          <div class="group-label">键位</div>
          <div class="group-items">
            <div
              v-for="opt in filteredOptions.filter(o => o.group === 'alphabet')"
              :key="opt.value"
              class="option-item key-item"
              :class="{ selected: modelValue === opt.value }"
              @click="selectOption(opt.value)"
            >
              {{ opt.label }}
            </div>
          </div>
        </div>

        <!-- 元素引用 -->
        <div v-if="filteredOptions.some(o => o.group === 'element')" class="option-group">
          <div class="group-label">字根码位</div>
          <div class="group-items element-items">
            <div
              v-for="opt in filteredOptions.filter(o => o.group === 'element')"
              :key="opt.value"
              class="option-item element-item"
              :class="{ selected: modelValue === opt.value }"
              @click="selectOption(opt.value)"
            >
              <span class="element-label">{{ opt.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.key-select {
  position: relative;
  min-width: 80px;
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

.select-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  min-width: 200px;
  max-height: 300px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: var(--shadow2);
  z-index: 100;
  overflow: hidden;
  margin-top: 4px;
}

/* 默认在下方 */
.select-dropdown.below {
  top: 100%;
}

/* 上方空间不足时，显示在上方 */
.select-dropdown.above {
  bottom: 100%;
  top: auto;
  margin-top: 0;
  margin-bottom: 4px;
}

.select-search {
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  outline: none;
}

.select-options {
  max-height: 250px;
  overflow-y: auto;
  padding: 4px 0;
}

.option-group {
  padding: 4px 0;
}

.group-label {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text2);
  font-weight: 500;
  text-transform: uppercase;
}

.group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 6px;
}

.key-item {
  min-width: 28px;
  text-align: center;
}

.element-items {
  flex-direction: column;
  gap: 2px;
}

.element-item {
  padding: 6px 10px;
  text-align: left;
}

.element-label {
  font-size: 12px;
}

.option-item {
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.option-item:hover {
  background: var(--primary-bg);
}

.option-item.selected {
  background: var(--primary);
  color: white;
}
</style>