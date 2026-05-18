<script setup lang="ts">
import { computed } from 'vue'
import type { CodeCandidate } from '../../utils/evaluate'

const props = withDefaults(defineProps<{
  data: CodeCandidate[]   // 完整列表（全量，用于导出）
  topN?: number           // 图表显示条数，默认 10
  title?: string
  subtitle?: string
  exportFilename?: string
}>(), {
  topN: 10,
  title: '编码候选数 Top 10',
  subtitle: '当前数据范围下候选数最多的前 10 个编码',
  exportFilename: '编码候选数.tsv',
})

const displayData = computed(() => props.data.slice(0, props.topN ?? 10))

const maxCount = computed(() => {
  return displayData.value.reduce((m, r) => (r.count > m ? r.count : m), 0)
})

function barPct(row: CodeCandidate): number {
  if (maxCount.value <= 0) return 0
  return Math.max(4, (row.count / maxCount.value) * 100)
}

function exportTsv() {
  const rows: string[] = ['编码\t候选数\t候选条目']
  for (const row of props.data) {
    rows.push(`${row.code}\t${row.count}\t${row.entries.join(' ')}${row.hasMore ? ' …' : ''}`)
  }
  const content = '﻿' + rows.join('\n')
  const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = props.exportFilename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="cc-chart">
    <div class="cc-header">
      <div class="cc-header-left">
        <h3 class="cc-title">{{ title }}</h3>
        <span class="cc-subtitle">{{ subtitle }}</span>
      </div>
      <button v-if="data.length" class="cc-export-btn" @click="exportTsv" title="导出完整数据为 TSV">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        导出
      </button>
    </div>

    <div v-if="displayData.length" class="cc-bars">
      <div v-for="(row, idx) in displayData" :key="row.code" class="cc-row">
        <span class="cc-rank">{{ idx + 1 }}</span>
        <span class="cc-code">{{ row.code }}</span>
        <div class="cc-bar-track">
          <div class="cc-bar-fill" :style="{ width: barPct(row) + '%' }">
            <span class="cc-entries">
              <span v-for="(t, i) in row.entries" :key="i" class="cc-entry">{{ t }}</span>
              <span v-if="row.hasMore" class="cc-entry cc-entry-more">…</span>
            </span>
          </div>
        </div>
        <span class="cc-count">{{ row.count }}</span>
      </div>
    </div>
    <div v-else class="cc-empty">该范围下暂无重码编码</div>
  </div>
</template>

<style scoped>
.cc-chart {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.cc-header-left {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.cc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.cc-subtitle {
  font-size: 12px;
  color: var(--text3);
}

.cc-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.cc-export-btn:hover {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.cc-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cc-row {
  display: grid;
  grid-template-columns: 24px minmax(48px, auto) 1fr 56px;
  align-items: center;
  gap: 12px;
}

.cc-rank {
  font-size: 11px;
  font-weight: 700;
  color: var(--text3);
  font-family: 'SF Mono', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.cc-code {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
  font-family: 'SF Mono', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.cc-bar-track {
  position: relative;
  height: 28px;
  background: var(--bg3);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(99, 102, 241, 0.08);
}

.cc-bar-fill {
  position: relative;
  height: 100%;
  min-width: 4px;
  background: linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  padding-left: 10px;
  padding-right: 10px;
  box-shadow: 0 2px 6px -2px rgba(99, 102, 241, 0.45);
  transition: width 0.4s ease;
  overflow: hidden;
}

.cc-entries {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  overflow: hidden;
  white-space: nowrap;
}

.cc-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.96);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  flex-shrink: 0;
}

.cc-entry-more {
  background: transparent;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 2px 4px;
}

.cc-count {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  font-family: 'SF Mono', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.cc-empty {
  padding: 28px 12px;
  text-align: center;
  color: var(--text3);
  font-size: 13px;
}

@media (max-width: 720px) {
  .cc-row {
    grid-template-columns: 20px minmax(44px, auto) 1fr 44px;
    gap: 8px;
  }
  .cc-bar-track {
    height: 24px;
  }
  .cc-entry {
    font-size: 11px;
    padding: 1px 4px;
  }
}
</style>
