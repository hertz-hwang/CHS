<script setup lang="ts">
import { useEngine } from "../composables/useEngine";
const { stats } = useEngine();
</script>
<template>
    <header class="header">
        <div class="title">
            <h1>字 劫</h1>
            <span class="ver">v1.3</span>
            <span class="sub">拆分系统</span>
        </div>
        <div class="stats">
            <span
                >拆分 <b>{{ stats.decomp }}</b></span
            >
            <span
                >字根 <b>{{ stats.roots }}</b></span
            >
            <span
                >笔画 <b>{{ stats.strokes }}</b></span
            >
            <span
                >字频 <b>{{ stats.freq }}</b></span
            >
        </div>
    </header>
</template>
<style scoped>
.header {
    background: linear-gradient(135deg, #0d1b2a 0%, #1b2838 50%, #0d1b2a 100%);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(10px);
}
.title {
    display: flex;
    align-items: center;
    gap: 12px;
}
h1 {
    font-size: 24px;
    background: linear-gradient(135deg, var(--accent), var(--cyan));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
.ver {
    font-size: 12px;
    color: var(--text2);
    background: var(--bg3);
    padding: 2px 8px;
    border-radius: 10px;
}
.sub {
    color: var(--text2);
    font-size: 13px;
}
.stats {
    display: flex;
    gap: 20px;
    font-size: 13px;
    color: var(--text2);
}
.stats span {
    display: flex;
    align-items: center;
    gap: 4px;
}
.stats b {
    color: var(--accent);
    font-weight: 600;
}
</style>
