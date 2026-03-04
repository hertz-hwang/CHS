<script setup lang="ts">
import { ref } from 'vue'
import { useEngine } from '../../composables/useEngine'
import { codeToString, RootCode } from '../../engine/config'

const { 
  engine, toast, rootsVersion, bracedRootToPua, isBracedRoot 
} = useEngine()

// PUA 字体是否已加载
let puaFontLoaded = false

// 加载 PUA 字体（用于 Canvas 导出）
async function loadPuaFont(): Promise<boolean> {
  if (puaFontLoaded) return true
  
  try {
    const font = new FontFace('CHS-PUA', 'url(/data/CHS_PUA-Regular.woff2)')
    await font.load()
    document.fonts.add(font)
    puaFontLoaded = true
    return true
  } catch (error) {
    console.warn('Failed to load PUA font for export:', error)
    return false
  }
}

// 按真实 QWERTY 键盘斜列布局导出字根图（超高清）
async function exportKeyboardPng() {
  rootsVersion.value
  
  // 先加载 PUA 字体
  await loadPuaFont()
  
  // 获取配置名和作者名
  const config = engine.getConfig()
  const configName = config.meta.name || '未命名'
  const authorName = config.meta.author || '未知作者'
  
  // 高清缩放比例（8x 超高清）
  const scale = 8
  
  // 获取每个键位的字根（包含归并字根信息）
  // 保持 rootCodes Map 中的顺序（用户可通过拖拽调整）
  const getRootsOnKey = (key: string) => {
    const roots: { root: string; code: RootCode; mergedRoots: string[] }[] = []
    // 按照 rootCodes Map 的顺序遍历，保持用户定义的排序
    for (const [root, code] of engine.rootCodes) {
      if (engine.isMergedRoot(root)) continue
      if (code && code.main && code.main.toLowerCase() === key) {
        // 获取归并到该字根的所有归并字根
        const mergedRoots = engine.getMergedToRoots(root)
        roots.push({ root, code, mergedRoots })
      }
    }
    // 不再按字母排序，保持 rootCodes Map 中的顺序
    return roots
  }
  
  // 三行键位
  const rows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ]
  
  // 绘制参数
  const keyCodeFontSize = 14
  const lineGap = 6  // 行间距
  const keyHeaderHeight = 26
  const keyWidth = 130
  const keyHeight = 130  // 统一键位高度
  const keyGap = 8
  const rowOffset = 35
  const padding = 40
  const rootGap = 8  // 字根之间的间距
  
  // 根据字根数量计算字号（字根多时缩小，少时放大）
  const calculateFontSizes = (rootCount: number) => {
    // 字根字号范围：9-18
    // 根据字根数量动态调整：1-4个用大字，5-8个用中字，9+个用小字
    let fontSize: number
    if (rootCount <= 4) {
      fontSize = 22
    } else if (rootCount <= 8) {
      fontSize = 18
    } else if (rootCount <= 15) {
      fontSize = 12
    } else if (rootCount <= 25) {
      fontSize = 9
    } else {
      fontSize = 6
    }
    // 编码字号比字根小2号，但最小为7
    const codeFontSize = Math.max(4, fontSize - 2)
    return { fontSize, codeFontSize }
  }
  
  // 计算画布尺寸
  const canvasWidth = (padding * 2 + rowOffset * 2 + keyWidth * 10 + keyGap * 9) * scale
  const canvasHeight = (padding * 2 + keyHeight * 3 + keyGap * 2 + 80 + 50) * scale  // 80给空格键，50给标题和底部
  
  // 创建 Canvas
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = canvasHeight
  const ctx = canvas.getContext('2d')!
  
  // 应用缩放
  ctx.scale(scale, scale)
  
  // 绘制背景（纯白）
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvasWidth / scale, canvasHeight / scale)
  
  // 绘制标题
  ctx.fillStyle = '#333333'
  ctx.font = 'bold 20px "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${configName}`, (canvasWidth / scale) / 2, 26)
  
  // 绘制单个键位（统一高度）
  const drawKey = (x: number, y: number, key: string, keyLabel: string) => {
    const roots = getRootsOnKey(key)
    
    // 绘制键位背景（简洁白色）
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = roots.length > 0 ? '#2e2e2e' : '#d1d5db'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(x, y, keyWidth, keyHeight, 6)
    ctx.fill()
    ctx.stroke()
    
    // 绘制键位标签（左上角）
    ctx.fillStyle = '#6b7280'
    ctx.font = `bold ${keyCodeFontSize}px "SF Mono", "Consolas", monospace`
    ctx.textAlign = 'left'
    ctx.fillText(keyLabel.toUpperCase(), x + 8, y + 18)
    
    // 绘制字根（全部显示，带间距，字号根据字根数量动态调整）
    if (roots.length > 0) {
      const startX = x + 8
      const startY = y + keyHeaderHeight
      
      // 根据字根数量计算字号
      const { fontSize, codeFontSize } = calculateFontSizes(roots.length)
      const lineHeight = fontSize + lineGap
      
      // 计算布局：先测量每个字根+编码的宽度
      const items: { root: string; subCode: string; mergedRoots: string[]; width: number }[] = roots.map(item => {
        const subCode = (item.code.sub || '') + (item.code.supplement || '')
        
        // 计算字根宽度
        const displayRootText = bracedRootToPua(item.root)
        const isPuaChar = isBracedRoot(item.root)
        if (isPuaChar) {
          ctx.font = `${fontSize}px "CHS-PUA", "Microsoft YaHei", "PingFang SC", sans-serif`
        } else {
          ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`
        }
        const rootW = ctx.measureText(displayRootText).width
        
        // 计算归并字根宽度（每个归并字根单独测量，因为可能有不同的字体）
        let mergedW = 0
        if (item.mergedRoots.length > 0) {
          ctx.font = `${fontSize * 0.6}px "Microsoft YaHei", "PingFang SC", sans-serif`
          mergedW += ctx.measureText('(').width + ctx.measureText(')').width
          for (const r of item.mergedRoots) {
            const isMergedPua = isBracedRoot(r)
            if (isMergedPua) {
              ctx.font = `${fontSize * 0.6}px "CHS-PUA", "Microsoft YaHei", "PingFang SC", sans-serif`
            } else {
              ctx.font = `${fontSize * 0.6}px "Microsoft YaHei", "PingFang SC", sans-serif`
            }
            mergedW += ctx.measureText(bracedRootToPua(r)).width
          }
        }
        
        ctx.font = `${codeFontSize}px "SF Mono", "Consolas", monospace`
        const codeW = subCode ? ctx.measureText(subCode).width + 3 : 0
        return { root: item.root, subCode, mergedRoots: item.mergedRoots, width: rootW + mergedW + codeW + rootGap }
      })
      
      // 按行排列，每行放得下多少就放多少
      let currentX = startX
      let currentRow = 0
      
      items.forEach((item, index) => {
        // 检查是否需要换行
        if (currentX + item.width > x + keyWidth - 8) {
          currentX = startX
          currentRow++
        }
        
        const ty = startY + currentRow * lineHeight
        
        // 只绘制在键位范围内的字根
        if (ty + fontSize > y + keyHeight - 4) return
        
        // 获取显示用的字根文本（花括号字根转 PUA）
        const displayRootText = bracedRootToPua(item.root)
        const isPuaChar = isBracedRoot(item.root)
        
        // 绘制字根
        ctx.fillStyle = '#1f2937'
        // 如果是花括号字根，使用 PUA 字体
        if (isPuaChar) {
          ctx.font = `${fontSize}px "CHS-PUA", "Microsoft YaHei", "PingFang SC", sans-serif`
        } else {
          ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`
        }
        ctx.textAlign = 'left'
        ctx.fillText(displayRootText, currentX, ty + fontSize - 2)
        
        // 测量字根宽度
        const rootWidth = ctx.measureText(displayRootText).width
        
        // 绘制归并字根（在字根后面，小号字体，深灰色）
        let offsetX = currentX + rootWidth
        let mergedWidth = 0
        if (item.mergedRoots.length > 0) {
          for (const r of item.mergedRoots) {
            const isMergedPua = isBracedRoot(r)
            if (isMergedPua) {
              ctx.font = `${fontSize * 0.6}px "CHS-PUA", "Microsoft YaHei", "PingFang SC", sans-serif`
            } else {
              ctx.font = `${fontSize * 0.6}px "Microsoft YaHei", "PingFang SC", sans-serif`
            }
            const mergedChar = bracedRootToPua(r)
            ctx.fillStyle = '#6b7280'  // 更深的灰色
            ctx.fillText(mergedChar, offsetX + 2, ty + fontSize - 2)
            offsetX += ctx.measureText(mergedChar).width + 2
          }
          mergedWidth = offsetX - (currentX + rootWidth)
        }
        
        // 绘制编码在字根右侧（保持一定间距）
        if (item.subCode) {
          ctx.fillStyle = '#059669'
          ctx.font = `${codeFontSize}px "SF Mono", "Consolas", monospace`
          ctx.fillText(item.subCode, offsetX + 4, ty + fontSize - 2)
        }
        
        // 移动到下一个位置
        const codeWidth = item.subCode ? ctx.measureText(item.subCode).width + 3 : 0
        currentX += rootWidth + mergedWidth + codeWidth + rootGap
      })
    }
  }
  
  // 绘制三行键位（斜列布局，统一高度）
  let currentY = padding
  rows.forEach((row, rowIndex) => {
    const xOffset = padding + rowIndex * rowOffset
    
    row.forEach((key, colIndex) => {
      const x = xOffset + colIndex * (keyWidth + keyGap)
      drawKey(x, currentY, key, key)
    })
    
    currentY += keyHeight + keyGap
  })
  
  // 绘制空格键
  const spaceWidth = keyWidth * 5 + keyGap * 4
  const spaceX = ((canvasWidth / scale) - spaceWidth) / 2
  const spaceRoots = getRootsOnKey('_')
  const spaceHeight = 70
  
  // 空格键背景
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = spaceRoots.length > 0 ? '#2563eb' : '#d1d5db'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(spaceX, currentY, spaceWidth, spaceHeight, 6)
  ctx.fill()
  ctx.stroke()
  
  // 空格键标签
  ctx.fillStyle = '#6b7280'
  ctx.font = `bold ${keyCodeFontSize}px "SF Mono", "Consolas", monospace`
  ctx.textAlign = 'left'
  ctx.fillText('空格', spaceX + 10, currentY + 18)
  
  // 空格键字根（全部显示，带间距，字号根据字根数量动态调整）
  if (spaceRoots.length > 0) {
    const startX = spaceX + 10
    const startY = currentY + keyHeaderHeight
    
    // 根据字根数量计算字号
    const { fontSize, codeFontSize } = calculateFontSizes(spaceRoots.length)
    const lineHeight = fontSize + lineGap
    
    // 计算布局
    let currentX = startX
    let currentRow = 0
    
    spaceRoots.forEach((item) => {
      const subCode = (item.code.sub || '') + (item.code.supplement || '')
      
      // 获取显示用的字根文本（花括号字根转 PUA）
      const displayRootText = bracedRootToPua(item.root)
      const isPuaChar = isBracedRoot(item.root)
      
      // 测量宽度
      if (isPuaChar) {
        ctx.font = `${fontSize}px "CHS-PUA", "Microsoft YaHei", "PingFang SC", sans-serif`
      } else {
        ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`
      }
      const rootW = ctx.measureText(displayRootText).width
      ctx.font = `${codeFontSize}px "SF Mono", "Consolas", monospace`
      const codeW = subCode ? ctx.measureText(subCode).width + 3 : 0
      const totalW = rootW + codeW + rootGap
      
      // 检查是否需要换行
      if (currentX + totalW > spaceX + spaceWidth - 10) {
        currentX = startX
        currentRow++
      }
      
      const ty = startY + currentRow * lineHeight
      if (ty + fontSize > currentY + spaceHeight - 4) return
      
      // 绘制字根
      ctx.fillStyle = '#1f2937'
      if (isPuaChar) {
        ctx.font = `${fontSize}px "CHS-PUA", "Microsoft YaHei", "PingFang SC", sans-serif`
      } else {
        ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`
      }
      ctx.textAlign = 'left'
      ctx.fillText(displayRootText, currentX, ty + fontSize - 2)
      
      // 绘制编码
      if (subCode) {
        const rW = ctx.measureText(displayRootText).width
        ctx.fillStyle = '#059669'
        ctx.font = `${codeFontSize}px "SF Mono", "Consolas", monospace`
        ctx.fillText(subCode, currentX + rW + 3, ty + fontSize - 2)
      }
      
      currentX += totalW
    })
  }
  
  // 绘制底部信息
  ctx.fillStyle = '#9ca3af'
  ctx.font = '12px "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${authorName}`, (canvasWidth / scale) / 2, (canvasHeight / scale) - 10)
  
  // 导出 PNG
  const fileName = `${configName}_${authorName}_字根图.png`
  const link = document.createElement('a')
  link.download = fileName
  link.href = canvas.toDataURL('image/png')
  link.click()
  
  toast(`已导出: ${fileName}`)
}
</script>

<template>
  <button class="btn btn-sm btn-outline" @click="exportKeyboardPng">导出字根图PNG</button>
</template>