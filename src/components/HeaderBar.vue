<script setup lang="ts">
import { useEngine } from "../composables/useEngine";
const { stats } = useEngine();
</script>
<template>
    <header class="header">
        <div class="title">
            <h1>字劫</h1>
            <span class="ver">v1.3</span>
            <span class="sub">拆分系统</span>
        </div>
        <div class="stats">
            <div class="stat-item">
                <span class="stat-label">拆分</span>
                <span class="stat-value">{{ stats.decomp }}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">字根</span>
                <span class="stat-value">{{ stats.roots }}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">笔画</span>
                <span class="stat-value">{{ stats.strokes }}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">字频</span>
                <span class="stat-value">{{ stats.freq }}</span>
            </div>
        </div>
    </header>
</template>
<style scoped>
.header {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
}
.title {
    display: flex;
    align-items: center;
    gap: 10px;
}
h1 {
    font-size: 20px;
    font-weight: 600;
    color: var(--primary);
    letter-spacing: 2px;
}
.ver {
    font-size: 11px;
    color: var(--text2);
    background: var(--bg3);
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
}
.sub {
    color: var(--text2);
    font-size: 13px;
    margin-left: 4px;
}
.stats {
    display: flex;
    gap: 24px;
}
.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}
.stat-label {
    font-size: 11px;
    color: var(--text2);
}
.stat-value {
    font-size: 15px;
    font-weight: 600;
    color: var(--primary);
}
</style>