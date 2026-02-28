<script setup lang="ts">
import { useEngine } from "../composables/useEngine";
import { exportConfig, parseConfig, saveConfigToStorage, loadConfigFromStorage } from "../engine/config";

const { engine, refreshStats, toast, stats } = useEngine();

// 导入配置
function importConfig(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const config = parseConfig(reader.result as string);
      engine.applyConfig(config);
      refreshStats();
      toast(`配置已加载: ${Object.keys(config.roots).length} 字根, ${config.rules.length} 规则`);
    } catch (err) {
      toast('配置文件解析失败');
      console.error(err);
    }
  };
  reader.readAsText(file);
  (e.target as HTMLInputElement).value = '';
}

// 导出配置
function exportConfigFile() {
  const config = engine.getConfig();
  const toml = exportConfig(config);
  const blob = new Blob([toml], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chars_hijack_config.toml';
  a.click();
  toast('配置已导出');
}

// 保存/恢复配置到 localStorage
function saveConfig() {
  saveConfigToStorage(engine.getConfig());
  toast('配置已保存');
}

function loadSavedConfig() {
  const config = loadConfigFromStorage();
  if (config) {
    engine.applyConfig(config);
    refreshStats();
    toast('配置已恢复');
  } else {
    toast('未找到保存的配置');
  }
}
</script>
<template>
    <header class="header">
        <div class="title">
            <h1>字劫</h1>
            <span class="ver">v0.0.3</span>
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
        <div class="config-actions">
            <input ref="fileInput" type="file" accept=".toml" style="display:none" @change="importConfig" />
            <button class="btn-text" @click="($refs.fileInput as HTMLInputElement).click()">导入</button>
            <button class="btn-text" @click="exportConfigFile">导出</button>
            <button class="btn-text" @click="saveConfig">保存</button>
            <button class="btn-text" @click="loadSavedConfig">恢复</button>
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
.config-actions {
    display: flex;
    gap: 8px;
}
.btn-text {
    background: transparent;
    border: none;
    font-size: 13px;
    color: var(--text2);
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 4px;
    transition: color 0.2s, background 0.2s;
}
.btn-text:hover {
    color: var(--primary);
    background: var(--primary-bg);
}
</style>
