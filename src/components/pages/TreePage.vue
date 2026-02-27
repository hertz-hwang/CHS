<script setup lang="ts">
import { ref } from 'vue'
import TreeNodeView from '../shared/TreeNodeView.vue'
import { useEngine } from '../../composables/useEngine'
import type { IDSNode } from '../../engine/ids'
const { engine, selectChar } = useEngine()
const input = ref(''); const tree = ref<IDSNode | null>(null); const char = ref('')
function run() { const ch = [...input.value.trim()][0]; if (!ch) return; char.value = ch; tree.value = engine.buildTree(ch); selectChar(ch) }
</script>
<template>
  <div class="panel">
    <div class="panel-head">🌳 拆分树</div>
    <div class="panel-body">
      <div class="input-row">
        <input v-model="input" type="text" placeholder="输入单字..." maxlength="2" @keydown.enter="run" />
        <button class="btn" @click="run">生成</button>
      </div>
      <div v-if="tree" style="padding:16px;overflow-x:auto">
        <h4 style="margin-bottom:8px">{{ char }} 拆分树</h4>
        <TreeNodeView :node="tree" />
      </div>
    </div>
  </div>
</template>
