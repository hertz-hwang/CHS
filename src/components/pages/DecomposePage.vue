<script setup lang="ts">
import { ref } from 'vue'
import CharCard from '../shared/CharCard.vue'
import { useEngine } from '../../composables/useEngine'
const { engine } = useEngine()
const input = ref(''); const chars = ref<string[]>([])
function run() { chars.value = [...input.value.trim()].filter(ch => !/\s/.test(ch) && (engine.decomp.has(ch) || engine.roots.has(ch))) }
</script>
<template>
  <div class="panel">
    <div class="panel-head">🔍 拆分汉字</div>
    <div class="panel-body">
      <div class="input-row">
        <input v-model="input" type="text" placeholder="输入汉字 (可多个)..." @keydown.enter="run" />
        <button class="btn" @click="run">拆分</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <CharCard v-for="ch in chars" :key="ch" :char="ch" />
        <p v-if="chars.length === 0 && input.trim()" style="color:var(--text2)">未找到拆分数据</p>
      </div>
    </div>
  </div>
</template>
