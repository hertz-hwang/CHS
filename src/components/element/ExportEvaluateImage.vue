<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useEngine } from '../../composables/useEngine'
import html2canvas from 'html2canvas'

const props = withDefaults(defineProps<{
  mode?: 'single' | 'upload'
  switchTab?: (tab: 'char' | 'word' | 'mixed') => void
}>(), { mode: 'single' })

const { engine, toast } = useEngine()

const showModal = ref(false)

type ModuleKey =
  | 'charData' | 'charCandidates' | 'charHeatmap'
  | 'wordData' | 'wordCandidates' | 'wordHeatmap'
  | 'mixedData' | 'mixedCandidates' | 'mixedHeatmap'

interface ModuleConfig {
  key: ModuleKey
  label: string
  tab: 'char' | 'word' | 'mixed'
  singleSelector: string
  uploadSelector: string
}

const MODULES: ModuleConfig[] = [
  { key: 'charData',        label: '单字测评数据',   tab: 'char',  singleSelector: '.evaluate-main-content',          uploadSelector: '.uploaded-main-content' },
  { key: 'charCandidates',  label: '单字测评多候选', tab: 'char',  singleSelector: '.code-candidates-chart',           uploadSelector: '.uploaded-candidates-chart' },
  { key: 'charHeatmap',     label: '单字测评键位',   tab: 'char',  singleSelector: '.heatmap-wrapper',                 uploadSelector: '.uploaded-heatmap-wrapper' },
  { key: 'wordData',        label: '词组测评数据',   tab: 'word',  singleSelector: '.word-eval-table-wrapper',         uploadSelector: '.uploaded-word-eval-table-wrapper' },
  { key: 'wordCandidates',  label: '词组测评多候选', tab: 'word',  singleSelector: '.word-candidates-chart',           uploadSelector: '.uploaded-word-candidates-chart' },
  { key: 'wordHeatmap',     label: '词组测评键位',   tab: 'word',  singleSelector: '.word-heatmap-wrapper',            uploadSelector: '.uploaded-word-heatmap-wrapper' },
  { key: 'mixedData',       label: '字词测评数据',   tab: 'mixed', singleSelector: '.mixed-eval-table-wrapper',        uploadSelector: '.uploaded-mixed-eval-table-wrapper' },
  { key: 'mixedCandidates', label: '字词测评多候选', tab: 'mixed', singleSelector: '.mixed-candidates-chart',          uploadSelector: '.uploaded-mixed-candidates-chart' },
  { key: 'mixedHeatmap',    label: '字词测评键位',   tab: 'mixed', singleSelector: '.mixed-heatmap-wrapper',           uploadSelector: '.uploaded-mixed-heatmap-wrapper' },
]

const selected = ref<Set<ModuleKey>>(new Set(['charData', 'charCandidates', 'charHeatmap']))

function toggleModule(key: ModuleKey) {
  if (selected.value.has(key)) {
    selected.value.delete(key)
  } else {
    selected.value.add(key)
  }
}

function selectAll() {
  selected.value = new Set(MODULES.map(m => m.key))
}

function selectNone() {
  selected.value = new Set()
}

// html2canvas 1.4.1 在渲染 inset box-shadow 时会画成一个忽略 border-radius 的矩形，
// 导致 border-radius: 999px 的胶囊（如手指占比、键位百分比等）在截图里底部出现
// 直角斜切的色块。这里在克隆文档中剥离所有 box-shadow 的 inset 分量（保留外阴影），
// 让胶囊渲染成与网页一致的干净药丸形状。
function stripInsetShadow(doc: Document) {
  const view = doc.defaultView
  if (!view) return
  doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const boxShadow = view.getComputedStyle(el).boxShadow
    if (!boxShadow || boxShadow === 'none' || !boxShadow.includes('inset')) return

    // 按顶层逗号拆分多段阴影（避免拆到 rgba(...) 内部的逗号）
    const parts: string[] = []
    let depth = 0
    let current = ''
    for (const ch of boxShadow) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      if (ch === ',' && depth === 0) {
        parts.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    if (current.trim()) parts.push(current)

    const kept = parts.filter((p) => !p.includes('inset'))
    el.style.boxShadow = kept.length ? kept.join(',') : 'none'
  })
}

// 把克隆文档里所有 position: sticky 的元素降级为 static，避免父容器被
// position: absolute 移走后 sticky 的参考滚动容器发生变化，导致首列跑偏。
function disableStickyPositioning(doc: Document) {
  doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const view = doc.defaultView
    if (!view) return
    const position = view.getComputedStyle(el).position
    if (position === 'sticky' || position === '-webkit-sticky') {
      el.style.position = 'static'
      el.style.left = 'auto'
      el.style.right = 'auto'
      el.style.top = 'auto'
      el.style.bottom = 'auto'
    }
  })
}

// html2canvas 1.4.1 在克隆文档里重新解析样式时，对 `color: var(--primary)` 这类
// 依赖 CSS 自定义属性的颜色解析不稳定，导致测评表里本应是蓝色（var(--primary)）的
// 可点击列被渲染成了粉红色。这里在截图前，把实时 DOM 计算出的 color 以行内样式
// （优先级高于样式表规则，html2canvas 会直接读取）写回到每个元素上，截图结束后再
// 还原。因为写入的就是元素当前实际显示的颜色，页面本身不会有任何视觉变化。
function freezeComputedColors(root: HTMLElement): () => void {
  const restorers: Array<() => void> = []
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  elements.forEach((el) => {
    const color = window.getComputedStyle(el).color
    if (!color) return
    // 记录原始行内 color 的值与优先级，截图后精确还原
    const prevValue = el.style.getPropertyValue('color')
    const prevPriority = el.style.getPropertyPriority('color')
    restorers.push(() => {
      el.style.removeProperty('color')
      if (prevValue) el.style.setProperty('color', prevValue, prevPriority)
    })
    // 用 important 盖过样式表里带 !important 的规则（如重码列的红色）。
    // 写入的就是元素当前计算色，视觉上与还原前完全一致。
    el.style.setProperty('color', color, 'important')
  })
  return () => restorers.forEach((fn) => fn())
}

async function captureElement(selector: string): Promise<HTMLCanvasElement | null> {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return null

  // 父级 .center 设置了 overflow-y: auto，浏览器会自动把 overflow-x 也强制成 auto，
  // 导致测评表格、键盘热力图、多候选条形图等横向溢出的内容在截图时右半部分被裁掉。
  // 这里临时把元素脱离文档流、挪到屏幕外，并强制撑到 scrollWidth，
  // 让 html2canvas 能完整渲染所有列与右侧的候选计数/小指占比等。
  const origPosition = el.style.position
  const origLeft = el.style.left
  const origTop = el.style.top
  const origWidth = el.style.width
  const origMaxWidth = el.style.maxWidth
  const origOverflow = el.style.overflow
  const origOverflowX = el.style.overflowX

  const fullWidth = el.scrollWidth
  const fullHeight = el.scrollHeight

  el.style.position = 'absolute'
  el.style.left = '-99999px'
  el.style.top = '0'
  el.style.width = `${fullWidth}px`
  el.style.maxWidth = 'none'
  el.style.overflow = 'visible'
  el.style.overflowX = 'visible'

  const restoreColors = freezeComputedColors(el)

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: null,
      width: fullWidth,
      height: fullHeight,
      windowWidth: fullWidth + 200,
      onclone: (clonedDoc) => {
        stripInsetShadow(clonedDoc)
        disableStickyPositioning(clonedDoc)
      },
    })
  } finally {
    restoreColors()
    el.style.position = origPosition
    el.style.left = origLeft
    el.style.top = origTop
    el.style.width = origWidth
    el.style.maxWidth = origMaxWidth
    el.style.overflow = origOverflow
    el.style.overflowX = origOverflowX
  }
  return canvas
}

const isExporting = ref(false)

async function exportImage() {
  if (selected.value.size === 0) {
    toast('请至少勾选一个模块')
    return
  }

  isExporting.value = true
  const config = engine.getConfig()
  const schemeName = config.meta.name || '未命名'
  const authorName = config.meta.author || '未知作者'
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '')
  const isUpload = props.mode === 'upload'

  try {
    const orderedModules = MODULES.filter(m => selected.value.has(m.key))

    // 按 tab 分组，依次切换子标签截图，避免 v-if 导致 DOM 不存在
    const canvasMap = new Map<ModuleKey, HTMLCanvasElement>()
    const tabs: Array<'char' | 'word' | 'mixed'> = ['char', 'word', 'mixed']
    for (const tab of tabs) {
      const tabModules = orderedModules.filter(m => m.tab === tab)
      if (tabModules.length === 0) continue
      if (props.switchTab) {
        props.switchTab(tab)
        await nextTick()
        // 等待 DOM 渲染稳定
        await new Promise(r => setTimeout(r, 80))
      }
      for (const m of tabModules) {
        const selector = isUpload ? m.uploadSelector : m.singleSelector
        const canvas = await captureElement(selector)
        if (canvas) canvasMap.set(m.key, canvas)
      }
    }

    const canvases = orderedModules.map(m => canvasMap.get(m.key)).filter(Boolean) as HTMLCanvasElement[]

    if (canvases.length === 0) {
      toast('未找到所选模块内容，请先运行测评')
      isExporting.value = false
      return
    }

    const scale = 2
    const headerHeight = 48
    const footerHeight = 40
    const gap = 16
    const padding = 24

    const maxWidth = Math.max(...canvases.map(c => c.width))
    const totalHeight =
      (headerHeight + footerHeight + padding * 2) * scale +
      canvases.reduce((sum, c) => sum + c.height + gap * scale, 0)

    const merged = document.createElement('canvas')
    merged.width = maxWidth + padding * 2 * scale
    merged.height = totalHeight
    const ctx = merged.getContext('2d')!

    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg2').trim() || '#ffffff'
    ctx.fillStyle = bgColor || '#ffffff'
    ctx.fillRect(0, 0, merged.width, merged.height)

    ctx.fillStyle = '#1f2937'
    ctx.font = `bold ${32 * scale}px "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`${authorName} · ${new Date().toLocaleDateString()} 测评报告`, merged.width / 2, (padding + 30) * scale)

    let y = (headerHeight + padding) * scale
    for (const c of canvases) {
      const x = (merged.width - c.width) / 2
      ctx.drawImage(c, x, y)
      y += c.height + gap * scale
    }

    ctx.fillStyle = '#9ca3af'
    ctx.font = `${11 * scale}px "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`生成时间: ${new Date().toLocaleString()} | chars-hijack 测评系统`, merged.width / 2, merged.height - padding * scale)

    const link = document.createElement('a')
    link.download = `${schemeName}_${authorName}_测评截图_${timestamp}.png`
    link.href = merged.toDataURL('image/png')
    link.click()

    toast('测评截图已保存')
    showModal.value = false
  } catch (error) {
    console.error('导出测评截图失败:', error)
    toast('导出测评截图失败，请重试')
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <button class="btn btn-sm btn-outline" @click="showModal = true">
    📷 截图分享
  </button>

  <Teleport to="body">
    <div v-if="showModal" class="export-modal-overlay" @click.self="showModal = false">
      <div class="export-modal">
        <div class="export-modal-header">
          <span class="export-modal-title">选择截图模块</span>
          <button class="export-modal-close" @click="showModal = false">✕</button>
        </div>

        <div class="export-modal-body">
          <div class="module-grid">
            <label
              v-for="m in MODULES"
              :key="m.key"
              class="module-item"
              :class="{ selected: selected.has(m.key) }"
            >
              <input
                type="checkbox"
                :checked="selected.has(m.key)"
                @change="toggleModule(m.key)"
              />
              <span>{{ m.label }}</span>
            </label>
          </div>
        </div>

        <div class="export-modal-footer">
          <div class="footer-left">
            <button class="btn btn-sm btn-ghost" @click="selectAll">全选</button>
            <button class="btn btn-sm btn-ghost" @click="selectNone">清空</button>
          </div>
          <div class="footer-right">
            <span class="selected-count">已选 {{ selected.size }} 个模块</span>
            <button class="btn btn-sm btn-primary" :disabled="isExporting || selected.size === 0" @click="exportImage">
              {{ isExporting ? '生成中...' : '导出图片' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.export-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.export-modal {
  background: var(--bg2, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  width: 360px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.export-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.export-modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text1, #111827);
}

.export-modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text3, #9ca3af);
  font-size: 16px;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}

.export-modal-close:hover {
  background: var(--bg3, #f3f4f6);
  color: var(--text1, #111827);
}

.export-modal-body {
  padding: 14px 18px;
}

.module-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.module-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text2, #374151);
  transition: background 0.15s, border-color 0.15s;
  user-select: none;
}

.module-item:hover {
  background: var(--bg3, #f3f4f6);
}

.module-item.selected {
  background: var(--accent-light, #eff6ff);
  border-color: var(--accent, #3b82f6);
  color: var(--accent, #3b82f6);
}

.module-item input[type="checkbox"] {
  accent-color: var(--accent, #3b82f6);
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.export-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px 14px;
  border-top: 1px solid var(--border, #e5e7eb);
  gap: 8px;
}

.footer-left {
  display: flex;
  gap: 6px;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selected-count {
  font-size: 12px;
  color: var(--text3, #9ca3af);
}

.btn-ghost {
  background: none;
  border: 1px solid var(--border, #e5e7eb);
  color: var(--text2, #374151);
}

.btn-ghost:hover {
  background: var(--bg3, #f3f4f6);
}
</style>
