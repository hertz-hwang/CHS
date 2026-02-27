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
  <aside class="rp">
    <h3>字详情</h3>
    <div v-if="!detail" class="empty">点击任意汉字查看详情</div>
    <template v-else>
      <div class="big">{{ detail.char }}</div>
      <div class="f"><div class="l">拆分结果</div><div class="v accent">{{ detail.leaves.join(' + ') }}</div></div>
      <div class="f"><div class="l">结构式</div><div class="v mono">{{ detail.ids }}</div></div>
      <div class="f"><div class="l">原始 IDS</div><div class="v mono sm">{{ detail.origIDS }}</div></div>
      <div class="g2">
        <div class="f"><div class="l">笔画数</div><div class="v">{{ detail.sc || '—' }}</div></div>
        <div class="f"><div class="l">笔画编码</div><div class="v mono sm">{{ detail.strokeData }}</div></div>
        <div class="f"><div class="l">拼音</div><div class="v">{{ detail.py }}</div></div>
        <div class="f"><div class="l">词频</div><div class="v">{{ detail.fq }}</div></div>
        <div class="f"><div class="l">Unicode</div><div class="v mono">{{ detail.code }}</div></div>
        <div class="f"><div class="l">区段</div><div class="v"><span class="tag tag-blue">{{ detail.block }}</span></div></div>
      </div>
      <div class="f"><div class="l">状态</div><div class="v">
        <span v-if="detail.isRoot" class="tag tag-green">是字根</span>
        <span v-else class="tag tag-orange">非字根</span>
      </div></div>
      <div class="acts">
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
.rp { background: var(--bg2); border-left: 1px solid var(--border); overflow-y: auto; padding: 16px; }
h3 { font-size: 13px; color: var(--text2); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
.empty { color: var(--text2); font-size: 13px; }
.big { font-size: 72px; text-align: center; padding: 20px; background: var(--bg3); border-radius: 12px; margin-bottom: 16px; line-height: 1.2; }
.f { margin-bottom: 12px; }
.l { font-size: 11px; color: var(--text2); margin-bottom: 2px; }
.v { font-size: 14px; }
.accent { color: var(--accent); font-size: 16px; }
.mono { font-family: monospace; }
.sm { font-size: 12px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.acts { margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; }
</style>
