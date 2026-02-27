<script setup lang="ts">
import { ref } from 'vue'
import { useEngine } from '../../composables/useEngine'
import type { StepInfo } from '../../engine/engine'
const { engine, selectChar } = useEngine()
const input = ref(''); const steps = ref<StepInfo[]>([]); const finalLeaves = ref<string[]>([]); const char = ref(''); const noData = ref(false)
function run() {
  const ch = [...input.value.trim()][0]; if (!ch) return; char.value = ch
  steps.value = engine.decomposeSteps(ch); noData.value = steps.value.length === 0
  if (!noData.value) finalLeaves.value = engine.decompose(ch).leaves
  selectChar(ch)
}
function cls(x: string) { if (engine.roots.has(x)) return 'lr'; if (engine.decomp.has(x)) return 'le'; return 'ld' }
function mk(x: string) { if (engine.roots.has(x)) return '✓'; if (engine.decomp.has(x)) return '→'; return '■' }
</script>
<template>
  <div class="panel">
    <div class="panel-head">📋 逐步拆分</div>
    <div class="panel-body">
      <div class="input-row">
        <input v-model="input" type="text" placeholder="输入单字..." maxlength="2" @keydown.enter="run" />
        <button class="btn" @click="run">拆分</button>
      </div>
      <div v-if="noData" style="color:var(--text2)">{{ char }}: {{ engine.roots.has(char) ? '是字根' : '无拆分数据' }}</div>
      <template v-if="steps.length > 0">
        <h4 style="margin-bottom:8px">{{ char }} 逐步拆分</h4>
        <div v-for="(s, i) in steps" :key="i" class="sl" :style="{ marginLeft: s.lv * 24 + 'px' }">
          <span class="sc">{{ s.char }}</span> = <span class="si">{{ s.ids }}</span>
          <span style="margin-left:12px">(<span v-for="(x, j) in s.leaves" :key="j" :class="cls(x)">{{ x }}{{ mk(x) }}{{ j < s.leaves.length - 1 ? ' ' : '' }}</span>)</span>
        </div>
        <div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px">最终: <b>{{ char }}</b> → <span style="color:var(--accent)">{{ finalLeaves.join(' + ') }}</span></div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.sl { padding: 6px 12px; font-size: 14px; border-left: 2px solid var(--border); margin: 4px 0; transition: background 0.15s; }
.sl:hover { background: var(--bg3); }
.sc { color: var(--accent); font-weight: 600; font-size: 16px; }
.si { color: var(--text2); }
.lr { color: var(--green); }
.le { color: var(--orange); }
.ld { color: var(--red); }
</style>
