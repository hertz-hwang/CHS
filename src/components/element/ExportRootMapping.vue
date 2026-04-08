<script setup lang="ts">
import { useEngine } from '../../composables/useEngine'

const { engine, toast, rootsVersion } = useEngine()

function exportRootMapping() {
  rootsVersion.value

  // 反向索引 codeEquivalences: source "一.1" → targets ["你.1", ...]
  // codeEquivalences: key=target(复制方), value=source(来源方)
  const incomingEquiv = new Map<string, string[]>()
  for (const [target, source] of engine.codeEquivalences) {
    if (!incomingEquiv.has(source)) {
      incomingEquiv.set(source, [])
    }
    incomingEquiv.get(source)!.push(target)
  }

  // 被半归并引用的码位，在本字根处理时跳过
  const claimed = new Set<string>()
  for (const [target] of engine.codeEquivalences) {
    claimed.add(target)
  }

  const lines: string[] = []

  for (const [root, code] of engine.rootCodes) {
    if (engine.isMergedRoot(root)) continue

    const fullCode = (code.main || '') + (code.sub || '') + (code.supplement || '')
    if (!fullCode) continue

    const equivRoots = engine.equivalentRoots.get(root) || []
    const mergedRoots = engine.getMergedToRoots(root)

    for (let i = 0; i < fullCode.length; i++) {
      const refStr = `${root}.${i}`
      if (claimed.has(refStr)) continue

      const key = fullCode[i]
      const group: string[] = [refStr]

      // 归并字根
      for (const mr of mergedRoots) {
        group.push(`${mr}.${i}`)
      }

      // 等效字根及其归并字根
      for (const eq of equivRoots) {
        group.push(`${eq}.${i}`)
        for (const em of engine.getMergedToRoots(eq)) {
          group.push(`${em}.${i}`)
        }
      }

      // 半归并：指向 root.i 的码位
      for (const inc of incomingEquiv.get(refStr) || []) {
        group.push(inc)
        const parsed = engine.parseCodeRef(inc)
        if (parsed) {
          for (const im of engine.getMergedToRoots(parsed.root)) {
            group.push(`${im}.${parsed.codeIndex}`)
          }
        }
      }

      // 半归并：指向等效字根的码位
      for (const eq of equivRoots) {
        for (const inc of incomingEquiv.get(`${eq}.${i}`) || []) {
          group.push(inc)
          const parsed = engine.parseCodeRef(inc)
          if (parsed) {
            for (const im of engine.getMergedToRoots(parsed.root)) {
              group.push(`${im}.${parsed.codeIndex}`)
            }
          }
        }
      }

      lines.push(`${group.join(' ')}\t${key}`)
    }
  }

  const content = lines.join('\n') + '\n'
  const config = engine.getConfig()
  const configName = config.meta.name || '未命名'
  const fileName = `${configName}_字根映射表.txt`

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const link = document.createElement('a')
  link.download = fileName
  link.href = URL.createObjectURL(blob)
  link.click()
  URL.revokeObjectURL(link.href)

  toast(`已导出: ${fileName}`)
}
</script>

<template>
  <button class="btn btn-sm btn-outline" @click="exportRootMapping">导出字根映射表</button>
</template>
