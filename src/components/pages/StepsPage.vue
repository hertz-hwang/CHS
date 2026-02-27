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
function cls(x: string) { if (engine.roots.has(x)) return 'is-root'; if (engine.decomp.has(x)) return 'has-decomp'; return 'no-data' }
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
      <div v-if="noData" class="no-data">
        {{ char }}: {{ engine.roots.has(char) ? '是字根' : '无拆分数据' }}
      </div>
      <template v-if="steps.length > 0">
        <h4 class="section-title">{{ char }} 逐步拆分</h4>
        <div v-for="(s, i) in steps" :key="i" class="step-line" :style="{ marginLeft: s.lv * 24 + 'px' }">
          <span class="step-char">{{ s.char }}</span> = 
          <span class="step-ids">{{ s.ids }}</span>
          <span class="step-leaves">
            (<span v-for="(x, j) in s.leaves" :key="j" :class="cls(x)">{{ x }}{{ mk(x) }}{{ j < s.leaves.length - 1 ? ' ' : '' }}</span>)
          </span>
        </div>
        <div class="final-result">
          最终: <b>{{ char }}</b> → <span class="result">{{ finalLeaves.join(' + ') }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.no-data {
  color: var(--text2);
  font-size: 14px;
}
.section-title {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}
.step-line {
  padding: 8px 12px;
  font-size: 14px;
  border-left: 2px solid var(--border);
  margin: 4px 0;
  transition: background 0.15s ease;
}
.step-line:hover {
  background: var(--bg3);
}
.step-char {
  color: var(--primary);
  font-weight: 600;
  font-size: 16px;
}
.step-ids {
  color: var(--text2);
  font-family: monospace;
}
.step-leaves {
  margin-left: 12px;
}
.is-root { color: var(--success); }
.has-decomp { color: var(--warning); }
.no-data { color: var(--danger); }
.final-result {
  margin-top: 16px;
  padding: 12px 16px;
  background: var(--bg3);
  border-radius: 6px;
  font-size: 14px;
}
.final-result b {
  font-size: 16px;
}
.final-result .result {
  color: var(--primary);
  font-weight: 500;
}
</style>