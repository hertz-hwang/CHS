<script setup lang="ts">
import { computed } from 'vue'
import { useEngine } from '../composables/useEngine'
import { useTheme } from '../composables/useTheme'
import Icon from './Icon.vue'

const { currentPage, switchPage, navCollapsed, toggleNavCollapsed } = useEngine()
const { toggleTheme, isDark } = useTheme()

// 使用共享的折叠状态
const isCollapsed = computed(() => navCollapsed.value)

// 主导航项（一级菜单，无二级）
const navItems = [
  { page: 'data', icon: 'database', label: '数据' },
  { page: 'element', icon: 'element', label: '元素' },
  { page: 'split', icon: 'split', label: '拆分' },
  { page: 'rule', icon: 'rule', label: '取码' },
  { page: 'code', icon: 'code', label: '编码' },
  { page: 'evaluate', icon: 'chart', label: '测评' },
]

// 辅助功能
const auxItems = [
  { page: 'coverage', icon: 'coverage', label: '覆盖率' },
  { page: 'suggest', icon: 'lightbulb', label: '推荐' },
]

function toggleCollapse() {
  toggleNavCollapsed()
}
</script>

<template>
  <nav class="sidebar" :class="{ 'sidebar-collapsed': isCollapsed }">
    <!-- 折叠按钮 -->
    <button class="collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开' : '折叠'">
      <span v-if="isCollapsed">»</span>
      <span v-else>«</span>
    </button>

    <!-- 主导航 -->
    <div class="nav-main">
      <button 
        v-for="item in navItems" 
        :key="item.page" 
        class="nav-item"
        :class="{ 'active': currentPage === item.page }"
        @click="switchPage(item.page)"
        :title="isCollapsed ? item.label : ''"
      >
        <span class="nav-icon"><Icon :name="item.icon" :size="18" /></span>
        <span v-if="!isCollapsed" class="nav-label">{{ item.label }}</span>
      </button>
    </div>

    <!-- 分隔线 -->
    <div class="nav-divider"></div>

    <!-- 辅助功能 -->
    <div class="nav-aux">
      <button 
        v-for="item in auxItems" 
        :key="item.page"
        class="nav-item nav-item-sm"
        :class="{ 'active': currentPage === item.page }"
        @click="switchPage(item.page)"
        :title="isCollapsed ? item.label : ''"
      >
        <span class="nav-icon"><Icon :name="item.icon" :size="18" /></span>
        <span v-if="!isCollapsed" class="nav-label">{{ item.label }}</span>
      </button>
    </div>

    <!-- 底部主题切换 -->
    <div class="nav-footer">
      <button class="theme-btn" @click="toggleTheme" :title="isDark() ? '切换亮色' : '切换暗色'">
        <Icon v-if="isDark()" name="sun" :size="18" />
        <Icon v-else name="moon" :size="18" />
        <span v-if="!isCollapsed" class="theme-label">{{ isDark() ? '亮色' : '暗色' }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  width: var(--nav-width);
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  transition: width 0.3s ease;
}

.sidebar-collapsed {
  width: var(--nav-collapsed-width);
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  margin: 8px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text2);
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.2s ease;
}

.collapse-btn:hover {
  background: var(--primary-bg);
  color: var(--primary);
  border-color: var(--primary);
  transform: scale(1.02);
}

.nav-main {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--text2);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  font-family: inherit;
}

.sidebar-collapsed .nav-item {
  justify-content: center;
  padding: 12px 8px;
}

.nav-item:hover {
  background: var(--bg3);
  color: var(--text);
  transform: scale(1.02);
}

.nav-item.active {
  background: var(--primary);
  color: white;
}

.nav-item.active:hover {
  background: var(--primary-light);
}

.nav-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.nav-item-sm {
  padding: 10px 14px;
  font-size: 13px;
}

.nav-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 16px;
}

.nav-aux {
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-footer {
  padding: 8px;
  border-top: 1px solid var(--border);
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.theme-btn:hover {
  background: var(--primary-bg);
  border-color: var(--primary);
  color: var(--primary);
  transform: scale(1.02);
}

.theme-label {
  flex: 1;
  text-align: left;
}

/* 折叠状态下的样式 */
.sidebar-collapsed .nav-label,
.sidebar-collapsed .theme-label {
  display: none;
}

.sidebar-collapsed .theme-btn {
  justify-content: center;
  padding: 10px 8px;
}
</style>