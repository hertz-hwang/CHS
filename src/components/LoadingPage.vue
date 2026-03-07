<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface LoadingItem {
  id: string
  name: string
  status: 'pending' | 'loading' | 'done' | 'error'
}

const props = defineProps<{
  progress: number
  items: LoadingItem[]
  message?: string
}>()

const animatedProgress = ref(0)

// 平滑动画进度
const displayProgress = computed(() => {
  const target = props.progress
  // 逐渐接近目标值
  if (animatedProgress.value < target) {
    requestAnimationFrame(() => {
      const diff = target - animatedProgress.value
      animatedProgress.value += Math.max(1, diff * 0.1)
    })
  }
  return Math.min(100, Math.round(animatedProgress.value))
})

// 监听进度变化
onMounted(() => {
  animatedProgress.value = 0
})
</script>

<template>
  <div class="loading-container">
    <!-- 背景装饰 -->
    <div class="bg-decoration">
      <div class="bg-circle bg-circle-1"></div>
      <div class="bg-circle bg-circle-2"></div>
      <div class="bg-circle bg-circle-3"></div>
    </div>
    
    <!-- 主要内容 -->
    <div class="loading-content">
      <!-- Logo/图标区域 -->
      <div class="logo-area">
        <div class="logo-icon">
          <svg viewBox="0 0 48 48" fill="none" class="logo-svg">
            <rect x="6" y="6" width="36" height="36" rx="8" stroke="currentColor" stroke-width="2.5" fill="none" class="logo-rect"/>
            <text x="24" y="32" text-anchor="middle" font-size="20" font-weight="bold" fill="currentColor" class="logo-text">字</text>
          </svg>
        </div>
        <h1 class="logo-title">字劫</h1>
        <p class="logo-subtitle">汉字拆分与编码工具</p>
      </div>
      
      <!-- 进度区域 -->
      <div class="progress-area">
        <!-- 进度条 -->
        <div class="progress-track">
          <div class="progress-bar" :style="{ width: `${progress}%` }">
            <div class="progress-glow"></div>
          </div>
        </div>
        
        <!-- 进度百分比 -->
        <div class="progress-info">
          <span class="progress-percent">{{ progress }}%</span>
          <span class="progress-message" v-if="message">{{ message }}</span>
        </div>
        
        <!-- 加载项列表 -->
        <div class="loading-items">
          <div 
            v-for="item in items" 
            :key="item.id" 
            class="loading-item"
            :class="item.status"
          >
            <span class="item-icon">
              <svg v-if="item.status === 'pending'" class="icon-pending" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.3"/>
              </svg>
              <svg v-else-if="item.status === 'loading'" class="icon-loading" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" stroke-dasharray="50" stroke-dashoffset="20"/>
              </svg>
              <svg v-else-if="item.status === 'done'" class="icon-done" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <svg v-else-if="item.status === 'error'" class="icon-error" viewBox="0 0 24 24" fill="none">
                <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </span>
            <span class="item-name">{{ item.name }}</span>
          </div>
        </div>
      </div>
      
      <!-- 提示文字 -->
      <p class="loading-tip">首次加载需要下载数据，请耐心等待...</p>
    </div>
  </div>
</template>

<style scoped>
.loading-container {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  z-index: 9999;
  overflow: hidden;
}

/* 背景装饰 */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.03;
}

.bg-circle-1 {
  width: 600px;
  height: 600px;
  background: var(--primary);
  top: -200px;
  right: -100px;
  animation: float1 20s ease-in-out infinite;
}

.bg-circle-2 {
  width: 400px;
  height: 400px;
  background: var(--purple);
  bottom: -150px;
  left: -100px;
  animation: float2 15s ease-in-out infinite;
}

.bg-circle-3 {
  width: 300px;
  height: 300px;
  background: var(--primary);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: pulse 10s ease-in-out infinite;
}

@keyframes float1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-30px, 30px) scale(1.05); }
}

@keyframes float2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -30px) scale(1.1); }
}

@keyframes pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.03; }
  50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.05; }
}

/* 主要内容 */
.loading-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 400px;
  width: 90%;
  padding: 40px;
  background: var(--bg2);
  border-radius: 20px;
  box-shadow: var(--shadow2);
  border: 1px solid var(--border);
}

/* Logo区域 */
.logo-area {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  color: var(--primary);
  position: relative;
}

.logo-svg {
  width: 100%;
  height: 100%;
}

.logo-rect {
  animation: logo-rect-draw 2s ease-out forwards;
  stroke-dasharray: 144;
  stroke-dashoffset: 144;
}

.logo-text {
  animation: logo-text-fade 1s ease-out 0.5s forwards;
  opacity: 0;
}

@keyframes logo-rect-draw {
  to { stroke-dashoffset: 0; }
}

@keyframes logo-text-fade {
  to { opacity: 1; }
}

.logo-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
  letter-spacing: 2px;
}

.logo-subtitle {
  font-size: 14px;
  color: var(--text2);
}

/* 进度区域 */
.progress-area {
  width: 100%;
}

.progress-track {
  width: 100%;
  height: 8px;
  background: var(--bg3);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-light));
  border-radius: 4px;
  transition: width 0.3s ease;
  position: relative;
}

.progress-glow {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 20px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4));
  animation: glow-move 1.5s ease-in-out infinite;
}

@keyframes glow-move {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.progress-percent {
  font-size: 24px;
  font-weight: 700;
  color: var(--primary);
  font-variant-numeric: tabular-nums;
}

.progress-message {
  font-size: 13px;
  color: var(--text2);
}

/* 加载项列表 */
.loading-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 8px;
}

.loading-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: 8px;
  font-size: 13px;
  transition: all 0.3s ease;
}

.loading-item.done {
  background: rgba(0, 180, 42, 0.08);
}

.loading-item.error {
  background: rgba(245, 63, 63, 0.08);
}

.item-icon {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-icon svg {
  width: 100%;
  height: 100%;
}

.loading-item.pending .item-icon {
  color: var(--text3);
}

.loading-item.loading .item-icon {
  color: var(--primary);
}

.loading-item.loading .icon-loading {
  animation: spin 1s linear infinite;
}

.loading-item.done .item-icon {
  color: var(--success);
}

.loading-item.error .item-icon {
  color: var(--danger);
}

.item-name {
  color: var(--text);
  flex: 1;
}

.loading-item.pending .item-name {
  color: var(--text3);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 提示文字 */
.loading-tip {
  margin-top: 24px;
  font-size: 12px;
  color: var(--text3);
  text-align: center;
}

/* 滚动条样式 */
.loading-items::-webkit-scrollbar {
  width: 4px;
}

.loading-items::-webkit-scrollbar-track {
  background: transparent;
}

.loading-items::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 2px;
}

/* 响应式 */
@media (max-width: 480px) {
  .loading-content {
    padding: 24px;
  }
  
  .logo-icon {
    width: 56px;
    height: 56px;
  }
  
  .logo-title {
    font-size: 24px;
  }
  
  .progress-percent {
    font-size: 20px;
  }
}
</style>