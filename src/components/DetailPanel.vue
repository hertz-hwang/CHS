<script setup lang="ts">
import { computed } from 'vue'
import { useEngine } from '../composables/useEngine'
import { unicodeBlock, unicodeHex } from '../engine/unicode'

const { engine, selectedChar, refreshStats, toast, switchPage } = useEngine()

const detail = computed(() => {
  const ch = selectedChar.value
  if (!ch) return null
  const { leaves, ids } = engine.decompose(ch)
  return {
    char: ch, leaves, ids,
    origIDS: engine.decomp.get(ch) || '—',
    sc: engine.strokeCount(ch),
    strokeData: engine.strokes.get(ch) || '—',
    py: engine.pinyin.get(ch) || '—',
    fq: engine.freq.has(ch) ? engine.freq.get(ch) : '—',
    isRoot: engine.roots.has(ch),
    block: unicodeBlock(ch),
    code: unicodeHex(ch),
  }
})

function toggleRoot() {
  if (!detail.value) return
  const ch = detail.value.char
  if (detail.value.isRoot) { engine.removeRoots(ch); toast(`已移除字根: ${ch}`) }
  else { engine.addRoots(ch); toast(`已添加字根: ${ch}`) }
  refreshStats()
  selectedChar.value = null
  setTimeout(() => { selectedChar.value = ch }, 0)
}
</script>
<template>
  <aside class="detail-panel">
    <h3>字详情</h3>
    <div v-if="!detail" class="empty">点击任意汉字查看详情</div>
    <template v-else>
      <div class="char-display">{{ detail.char }}</div>
      
      <div class="info-row">
        <div class="label">拆分结果</div>
        <div class="value primary">{{ detail.leaves.join(' + ') }}</div>
      </div>
      
      <div class="info-row">
        <div class="label">结构式</div>
        <div class="value mono">{{ detail.ids }}</div>
      </div>
      
      <div class="info-row">
        <div class="label">原始 IDS</div>
        <div class="value mono small">{{ detail.origIDS }}</div>
      </div>
      
      <div class="info-grid">
        <div class="info-item">
          <div class="label">笔画数</div>
          <div class="value">{{ detail.sc || '—' }}</div>
        </div>
        <div class="info-item">
          <div class="label">笔画编码</div>
          <div class="value mono small">{{ detail.strokeData }}</div>
        </div>
        <div class="info-item">
          <div class="label">拼音</div>
          <div class="value">{{ detail.py }}</div>
        </div>
        <div class="info-item">
          <div class="label">词频</div>
          <div class="value">{{ detail.fq }}</div>
        </div>
        <div class="info-item">
          <div class="label">Unicode</div>
          <div class="value mono">{{ detail.code }}</div>
        </div>
        <div class="info-item">
          <div class="label">区段</div>
          <div class="value">
            <span class="tag tag-primary">{{ detail.block }}</span>
          </div>
        </div>
      </div>
      
      <div class="info-row">
        <div class="label">状态</div>
        <div class="value">
          <span v-if="detail.isRoot" class="tag tag-success">是字根</span>
          <span v-else class="tag tag-warning">非字根</span>
        </div>
      </div>
      
      <div class="actions">
        <button class="btn btn-sm" :class="detail.isRoot ? 'btn-danger' : 'btn-success'" @click="toggleRoot">
          {{ detail.isRoot ? '移除字根' : '设为字根' }}
        </button>
        <button class="btn btn-sm btn-outline" @click="switchPage('tree')">查看树</button>
        <button class="btn btn-sm btn-outline" @click="switchPage('steps')">逐步拆</button>
        <button class="btn btn-sm btn-outline" @click="switchPage('find')">检索</button>
      </div>
    </template>
  </aside>
</template>
<style scoped>
.detail-panel {
  background: var(--bg2);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  padding: 20px;
}
h3 {
  font-size: 12px;
  color: var(--text2);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  letter-spacing: 0.5px;
}
.empty {
  color: var(--text2);
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
}
.char-display {
  font-size: 64px;
  text-align: center;
  padding: 24px;
  background: var(--bg3);
  border-radius: 8px;
  margin-bottom: 20px;
  line-height: 1.2;
  color: var(--text);
}
.info-row {
  margin-bottom: 14px;
}
.label {
  font-size: 11px;
  color: var(--text2);
  margin-bottom: 4px;
  font-weight: 500;
}
.value {
  font-size: 14px;
  color: var(--text);
}
.value.primary {
  color: var(--primary);
  font-weight: 500;
  font-size: 15px;
}
.value.mono {
  font-family: monospace;
}
.value.small {
  font-size: 12px;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}
.info-item {
  margin-bottom: 0;
}
.actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>