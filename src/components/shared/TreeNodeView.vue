<script setup lang="ts">
import { useEngine } from '../../composables/useEngine'
import { IDSNode, STRUCT_NAMES } from '../../engine/ids'
defineProps<{ node: IDSNode }>()
const { engine, selectChar } = useEngine()
</script>
<template>
  <div class="tn">
    <template v-if="node.isLeaf()">
      <span class="item leaf" :class="engine.roots.has(node.char!) ? 'is-root' : 'not-root'" @click="selectChar(node.char!)">
        <span style="font-size:18px">{{ node.char }}</span>
        <span class="mark" :class="engine.roots.has(node.char!) ? 'ok' : 'no'">{{ engine.roots.has(node.char!) ? '✓' : '✗' }}</span>
        <span v-if="engine.strokeCount(node.char!)" class="sc">{{ engine.strokeCount(node.char!) }}画</span>
      </span>
    </template>
    <template v-else>
      <span class="item op">{{ node.op }} ({{ STRUCT_NAMES[node.op!] || node.op }})</span>
      <TreeNodeView v-for="(child, i) in node.children" :key="i" :node="child" />
    </template>
  </div>
</template>
<style scoped>
.tn { margin-left: 24px; position: relative; }
.tn::before { content: ''; position: absolute; left: -16px; top: 0; height: 100%; border-left: 1px dashed var(--border); }
.tn:last-child::before { height: 14px; }
.tn::after { content: ''; position: absolute; left: -16px; top: 14px; width: 12px; border-top: 1px dashed var(--border); }
.item { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; margin: 2px 0; font-size: 14px; transition: background 0.15s; }
.item:hover { background: var(--bg4); }
.leaf { background: var(--bg3); border: 1px solid var(--border); cursor: pointer; }
.leaf.is-root { border-color: var(--green); }
.leaf.not-root { border-color: var(--red); }
.op { color: var(--orange); font-weight: 600; }
.mark { font-size: 12px; padding: 1px 5px; border-radius: 4px; }
.mark.ok { background: #1b5e20; color: var(--green); }
.mark.no { background: #b71c1c33; color: var(--red); }
.sc { font-size: 11px; color: var(--text2); }
</style>
