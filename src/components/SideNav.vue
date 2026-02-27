<script setup lang="ts">
import { useEngine } from '../composables/useEngine'
const { currentPage, switchPage } = useEngine()

interface NavItem {
  page: string
  icon: string
  label: string
  kbd?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const sections: NavSection[] = [
  { title: '数据', items: [{ page: 'load', icon: '📂', label: '加载数据' }] },
  { title: '拆分', items: [
    { page: 'decompose', icon: '🔍', label: '拆分汉字', kbd: '1' },
    { page: 'tree', icon: '🌳', label: '拆分树', kbd: '2' },
    { page: 'steps', icon: '📋', label: '逐步拆分', kbd: '3' },
    { page: 'batch', icon: '📝', label: '批量拆分', kbd: '7' },
  ]},
  { title: '字根', items: [
    { page: 'roots', icon: '⌨️', label: '设置字根', kbd: '4' },
    { page: 'keyboard', icon: '🗺️', label: '查看布局', kbd: '9' },
    { page: 'suggest', icon: '💡', label: '推荐字根', kbd: '5' },
  ]},
  { title: '分析', items: [
    { page: 'coverage', icon: '📊', label: '覆盖率', kbd: '6' },
    { page: 'find', icon: '🔎', label: '部件检索', kbd: 'F' },
    { page: 'export', icon: '💾', label: '导出结果', kbd: '8' },
  ]},
]
</script>
<template>
  <nav class="sidebar">
    <div v-for="s in sections" :key="s.title" class="section">
      <h3>{{ s.title }}</h3>
      <button 
        v-for="it in s.items" 
        :key="it.page" 
        class="nav-btn" 
        :class="{ active: currentPage === it.page }" 
        @click="switchPage(it.page)"
      >
        <span class="icon">{{ it.icon }}</span>
        <span class="label">{{ it.label }}</span>
        <span v-if="it.kbd" class="kbd">{{ it.kbd }}</span>
      </button>
    </div>
  </nav>
</template>
<style scoped>
.sidebar {
  background: var(--bg2);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 16px 0;
}
.section {
  padding: 0 12px;
  margin-bottom: 16px;
}
.section:last-child {
  margin-bottom: 0;
}
.section h3 {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text2);
  letter-spacing: 1px;
  margin-bottom: 8px;
  padding: 0 8px;
  font-weight: 600;
}
.nav-btn {
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.15s ease;
  margin-bottom: 2px;
  font-family: inherit;
}
.nav-btn:hover {
  background: var(--bg3);
}
.nav-btn.active {
  background: var(--primary-bg);
  color: var(--primary);
}
.nav-btn.active .icon {
  opacity: 1;
}
.icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
  opacity: 0.8;
}
.label {
  flex: 1;
}
.kbd {
  font-size: 11px;
  color: var(--text3);
  background: var(--bg3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-weight: 500;
}
.nav-btn.active .kbd {
  background: var(--primary);
  color: #fff;
}
</style>