<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import HeaderBar from './components/HeaderBar.vue'
import SideNav from './components/SideNav.vue'
import DetailPanel from './components/DetailPanel.vue'
import ToastNotify from './components/ToastNotify.vue'
import LoadingPage from './components/LoadingPage.vue'

// 新页面
import DataPage from './components/pages/DataPage.vue'
import ElementPage from './components/pages/ElementPage.vue'
import SplitPage from './components/pages/SplitPage.vue'
import RulePage from './components/pages/RulePage.vue'
import CodePage from './components/pages/CodePage.vue'
import EvaluatePage from './components/pages/EvaluatePage.vue'
import PracticePage from './components/pages/PracticePage.vue'

// 保留的页面
import CoveragePage from './components/pages/CoveragePage.vue'
import SuggestPage from './components/pages/SuggestPage.vue'

import { useEngine, type LoadingProgress } from './composables/useEngine'

const { engine, currentPage, navCollapsed, refreshStats, toast, loadDefaultDataWithProgress } = useEngine()

const isLoading = ref(true)
const loadingProgress = ref<LoadingProgress>({
  progress: 0,
  currentItem: '',
  loaded: [],
  failed: [],
  items: []
})

// 显示右侧详情栏的页面（保留旧页面的兼容）
const showDetailPages = ['data', 'split', 'code', 'coverage', 'suggest']
const showDetailPanel = computed(() => showDetailPages.includes(currentPage.value))

onMounted(async () => {
  // 使用带进度回调的加载函数
  const { loaded, failed, fromCache } = await loadDefaultDataWithProgress((progress) => {
    loadingProgress.value = progress
  })
  
  if (failed.length > 0) {
    toast(`加载失败: ${failed.join(', ')}`, 4000)
  }
  
  // 如果是从网络加载的，提示用户数据已缓存
  if (!fromCache && loaded.length > 0) {
    toast('数据已缓存，下次加载将更快', 3000)
  }

  refreshStats()
  isLoading.value = false
})

</script>

<template>
  <!-- 加载页面 -->
  <LoadingPage 
    v-if="isLoading" 
    :progress="loadingProgress.progress"
    :items="loadingProgress.items"
    :message="loadingProgress.currentItem"
  />
  
  <!-- 主应用 -->
  <div v-else>
    <HeaderBar />
    <div class="main-layout" :class="{ 'no-detail': !showDetailPanel, 'nav-collapsed': navCollapsed }">
      <SideNav />
      <main class="center">
        <!-- 新页面 -->
        <DataPage v-if="currentPage === 'data'" />
        <ElementPage v-else-if="currentPage === 'element'" />
        <SplitPage v-else-if="currentPage === 'split'" />
        <RulePage v-else-if="currentPage === 'rule'" />
        <CodePage v-else-if="currentPage === 'code'" />
        <EvaluatePage v-else-if="currentPage === 'evaluate'" />
        <PracticePage v-else-if="currentPage === 'practice'" />
        
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
.main-layout.nav-collapsed {
  grid-template-columns: var(--nav-collapsed-width) 1fr 300px;
}
.main-layout.nav-collapsed.no-detail {
  grid-template-columns: var(--nav-collapsed-width) 1fr;
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