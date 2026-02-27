<script setup lang="ts">
import { useEngine } from '../../composables/useEngine'
import { IDSNode, STRUCT_NAMES } from '../../engine/ids'
defineProps<{ node: IDSNode }>()
const { engine, selectChar } = useEngine()
</script>
<template>
  <div class="tree-node">
    <template v-if="node.isLeaf()">
      <span 
        class="item leaf" 
        :class="engine.roots.has(node.char!) ? 'is-root' : 'not-root'" 
        @click="selectChar(node.char!)"
      >
        <span class="char">{{ node.char }}</span>
        <span class="mark" :class="engine.roots.has(node.char!) ? 'ok' : 'no'">
          {{ engine.roots.has(node.char!) ? '✓' : '✗' }}
        </span>
        <span v-if="engine.strokeCount(node.char!)" class="sc">
          {{ engine.strokeCount(node.char!) }}画
        </span>
      </span>
    </template>
    <template v-else>
      <span class="item op">{{ node.op }} ({{ STRUCT_NAMES[node.op!] || node.op }})</span>
      <TreeNodeView v-for="(child, i) in node.children" :key="i" :node="child" />
    </template>
  </div>
</template>
<style scoped>
.tree-node {
  margin-left: 24px;
  position: relative;
}
.tree-node::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 0;
  height: 100%;
  border-left: 1px dashed var(--border);
}
.tree-node:last-child::before {
  height: 14px;
}
.tree-node::after {
  content: '';
  position: absolute;
  left: -16px;
  top: 14px;
  width: 12px;
  border-top: 1px dashed var(--border);
}
.item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  margin: 2px 0;
  font-size: 14px;
  transition: all 0.15s ease;
}
.item:hover {
  background: var(--bg3);
}
.leaf {
  background: var(--bg2);
  border: 1px solid var(--border);
  cursor: pointer;
}
.leaf.is-root {
  border-color: var(--success);
}
.leaf.not-root {
  border-color: var(--danger);
}
.char {
  font-size: 18px;
}
.op {
  color: var(--warning);
  font-weight: 600;
}
.mark {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
.mark.ok {
  background: #E8FFEA;
  color: var(--success);
}
.mark.no {
  background: #FFECE8;
  color: var(--danger);
}
.sc {
  font-size: 11px;
  color: var(--text2);
}
</style>