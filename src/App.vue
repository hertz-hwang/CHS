<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import HeaderBar from './components/HeaderBar.vue'
import SideNav from './components/SideNav.vue'
import DetailPanel from './components/DetailPanel.vue'
import ToastNotify from './components/ToastNotify.vue'

// 新页面
import DataPage from './components/pages/DataPage.vue'
import ElementPage from './components/pages/ElementPage.vue'
import SplitPage from './components/pages/SplitPage.vue'
import RulePage from './components/pages/RulePage.vue'
import CodePage from './components/pages/CodePage.vue'

// 保留的页面
import CoveragePage from './components/pages/CoveragePage.vue'
import SuggestPage from './components/pages/SuggestPage.vue'

import { useEngine } from './composables/useEngine'

const { engine, currentPage, refreshStats, toast, loadDefaultData } = useEngine()

const isLoading = ref(true)

// 显示右侧详情栏的页面（保留旧页面的兼容）
const showDetailPages = ['data', 'split', 'code', 'coverage', 'suggest']
const showDetailPanel = computed(() => showDetailPages.includes(currentPage.value))

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

</script>

<template>
  <div>
    <HeaderBar />
    <div class="main-layout" :class="{ 'no-detail': !showDetailPanel }">
      <SideNav />
      <main class="center">
        <!-- 新页面 -->
        <DataPage v-if="currentPage === 'data'" />
        <ElementPage v-else-if="currentPage === 'element'" />
        <SplitPage v-else-if="currentPage === 'split'" />
        <RulePage v-else-if="currentPage === 'rule'" />
        <CodePage v-else-if="currentPage === 'code'" />
        
        <!-- 保留页面 -->
        <CoveragePage v-else-if="currentPage === 'coverage'" />
        <SuggestPage v-else-if="currentPage === 'suggest'" />
        
        <!-- 占位 -->
        <div v-else class="placeholder-page">
          <p>页面开发中...</p>
        </div>
      </main>
      <DetailPanel v-if="showDetailPanel" />
    </div>
    <ToastNotify />
  </div>
</template>

<style scoped>
.main-layout {
  display: grid;
  grid-template-columns: var(--nav-width) 1fr 300px;
  gap: 0;
  height: calc(100vh - 56px);
  transition: grid-template-columns 0.3s ease;
}
.main-layout.no-detail {
  grid-template-columns: var(--nav-width) 1fr;
}
.center {
  overflow-y: auto;
  padding: 24px;
  background: var(--bg);
  transition: background-color 0.3s ease;
}

.placeholder-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text2);
  font-size: 16px;
}

@media (max-width: 900px) {
  .main-layout { 
    grid-template-columns: 1fr; 
    grid-template-rows: auto 1fr; 
  }
}
</style>