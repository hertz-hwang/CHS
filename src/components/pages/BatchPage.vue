<script setup lang="ts">
import { ref } from 'vue'
import { useEngine } from '../../composables/useEngine'
const { engine, selectChar } = useEngine()
const input = ref('')
interface Row { char: string; leaves: string[]; ids: string; sc: number }
const rows = ref<Row[]>([])
function run() {
  rows.value = [...input.value.trim()].filter(ch => !/\s/.test(ch) && (engine.decomp.has(ch) || engine.roots.has(ch)))
    .map(ch => { const { leaves, ids } = engine.decompose(ch); return { char: ch, leaves, ids, sc: engine.strokeCount(ch) } })
}
</script>
<template>
  <div class="panel">
    <div class="panel-head">📝 批量拆分</div>
    <div class="panel-body">
      <div class="input-row">
        <input v-model="input" type="text" placeholder="输入文本..." style="flex:3" @keydown.enter="run" />
        <button class="btn" @click="run">批量拆分</button>
      </div>
      <table v-if="rows.length" class="data-table">
        <thead><tr><th>字</th><th>拆分</th><th>结构</th><th>画</th></tr></thead>
        <tbody><tr v-for="r in rows" :key="r.char" style="cursor:pointer" @click="selectChar(r.char)">
          <td class="char-col">{{ r.char }}</td><td>{{ r.leaves.join(' ') }}</td>
          <td style="font-family:monospace;color:var(--text2)">{{ r.ids }}</td><td>{{ r.sc }}</td>
        </tr></tbody>
      </table>
    </div>
  </div>
</template>
