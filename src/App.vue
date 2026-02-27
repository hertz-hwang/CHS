<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import HeaderBar from './components/HeaderBar.vue'
import SideNav from './components/SideNav.vue'
import DetailPanel from './components/DetailPanel.vue'
import ToastNotify from './components/ToastNotify.vue'
import LoadDataPage from './components/pages/LoadDataPage.vue'
import DecomposePage from './components/pages/DecomposePage.vue'
import TreePage from './components/pages/TreePage.vue'
import StepsPage from './components/pages/StepsPage.vue'
import BatchPage from './components/pages/BatchPage.vue'
import RootsPage from './components/pages/RootsPage.vue'
import KeyboardPage from './components/pages/KeyboardPage.vue'
import SuggestPage from './components/pages/SuggestPage.vue'
import CoveragePage from './components/pages/CoveragePage.vue'
import FindPage from './components/pages/FindPage.vue'
import ExportPage from './components/pages/ExportPage.vue'
import { useEngine } from './composables/useEngine'

const { engine, currentPage, refreshStats, toast, switchPage, loadDefaultData } = useEngine()

const isLoading = ref(true)

// 不显示右侧详情栏的页面
const hideDetailPages = ['load', 'roots', 'keyboard', 'suggest', 'export']
const showDetailPanel = computed(() => !hideDetailPages.includes(currentPage.value))

onMounted(async () => {
  // 自动加载默认数据
  const { loaded, failed } = await loadDefaultData()
  if (loaded.length > 0) {
    toast(`已加载: ${loaded.join(', ')}`)
  }
  if (failed.length > 0) {
    toast(`加载失败: ${failed.join(', ')}`, 4000)
  }

  // 恢复保存的字根
  if (engine.loadSavedRoots()) {
    refreshStats()
  }
  isLoading.value = false
})

function onKeyDown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  const map: Record<string, string> = {
    '1': 'decompose', '2': 'tree', '3': 'steps', '4': 'roots',
    '5': 'suggest', '6': 'coverage', '7': 'batch', '8': 'export',
    '9': 'keyboard',
    'f': 'find', 'F': 'find',
  }
  if (map[e.key]) switchPage(map[e.key])
}
</script>

<template>
  <div @keydown="onKeyDown" tabindex="-1" style="outline:none">
    <HeaderBar />
    <div class="main-layout" :class="{ 'no-detail': !showDetailPanel }">
      <SideNav />
      <main class="center">
        <LoadDataPage v-if="currentPage === 'load'" />
        <DecomposePage v-else-if="currentPage === 'decompose'" />
        <TreePage v-else-if="currentPage === 'tree'" />
        <StepsPage v-else-if="currentPage === 'steps'" />
        <BatchPage v-else-if="currentPage === 'batch'" />
        <RootsPage v-else-if="currentPage === 'roots'" />
        <KeyboardPage v-else-if="currentPage === 'keyboard'" />
        <SuggestPage v-else-if="currentPage === 'suggest'" />
        <CoveragePage v-else-if="currentPage === 'coverage'" />
        <FindPage v-else-if="currentPage === 'find'" />
        <ExportPage v-else-if="currentPage === 'export'" />
      </main>
      <DetailPanel v-if="showDetailPanel" />
    </div>
    <ToastNotify />
  </div>
</template>

<style scoped>
.main-layout {
  display: grid;
  grid-template-columns: 220px 1fr 300px;
  gap: 0;
  height: calc(100vh - 56px);
}
.main-layout.no-detail {
  grid-template-columns: 220px 1fr;
}
.center {
  overflow-y: auto;
  padding: 24px;
  background: var(--bg);
}
@media (max-width: 900px) {
  .main-layout { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
}
</style>
