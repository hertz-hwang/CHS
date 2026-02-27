# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

字劫 (chars-hijack) 是一个汉字拆分系统，用于分析和拆解汉字结构。支持加载 IDS (Ideographic Description Sequence) 数据，将汉字拆分为字根，并分析字根覆盖率。

## 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 生产构建 (含 TypeScript 类型检查)
npm run preview  # 预览生产构建
```

## 架构

### 核心引擎 (`src/engine/`)

- [engine.ts](src/engine/engine.ts) - 主引擎类 `CharsHijack`，处理：
  - 数据加载 (IDS、笔画、字频、字集)
  - 字根管理 (添加/删除/保存到 localStorage)
  - 汉字拆分 (`decompose`, `buildTree`, `decomposeSteps`)
  - 覆盖率分析 (`coverage`)
  - 字根建议 (`suggestRoots`)
  - 数据导出 (`exportFull`, `exportCompact`, `exportDetail`)

- [ids.ts](src/engine/ids.ts) - IDS 解析器，处理 Unicode 结构描述符 (⿰⿱⿲⿳ 等)，`IDSNode` 类表示拆分树

- [unicode.ts](src/engine/unicode.ts) - Unicode 区块判断和十六进制转换

### Vue 状态管理

- [useEngine.ts](src/composables/useEngine.ts) - 全局单例 composable，提供 `engine` 实例和响应式状态 (`stats`, `currentPage`, `selectedChar`, `toast`)

### 数据文件 (`data/`)

- `sky_ids.txt` - IDS 拆分数据 (TSV: U+码点、汉字、IDS表达式)
- `custom_ids.txt` - 自定义 IDS，会覆盖 sky_ids 中的条目
- `stroke.txt` - 笔画数据
- `dictionary.txt` - 拼音和字频
- `tg8105.txt` / `cjk.txt` - 字集文件

### 页面组件 (`src/components/pages/`)

页面通过 `currentPage` 状态切换，支持快捷键 (1-9, f)。主要页面：
- LoadDataPage - 数据加载入口
- DecomposePage - 单字拆分
- TreePage / StepsPage - 可视化拆分树
- RootsPage / ViewRootsPage - 字根管理
- CoveragePage - 覆盖率分析
- ExportPage - 数据导出

## 关键概念

- **IDS**: Unicode 汉字结构描述序列，如 `⿰木木` 表示"林"
- **字根 (Roots)**: 拆分终点，遇到字根时停止递归拆分
- **原子字根**: 无法再拆分的部件集合 (`atomicComponents()`)
- **覆盖率**: 给定字集中能完全用当前字根表示的汉字比例

## 开发注意事项

- 路径别名 `@/` 映射到 `src/`
- 字根数据自动保存到 `localStorage` (key: `chars_hijack_roots`)
- IDS 数据加载时会优先选择带 `[G]` 标记的条目 (中国大陆标准)