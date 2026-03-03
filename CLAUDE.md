# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在处理本仓库代码时提供指导。

## 项目概述

**字劫 (Chars Hijack)** 是一个基于 Vue 3 + TypeScript 的 Web 应用，专注于汉字拆分分析和输入法编码设计。项目通过解析 IDS（表意文字描述序列）数据，将汉字拆分为基本部件（字根），支持字根编码管理、转换规则配置、字集覆盖率分析等功能。

### 主要功能

- **汉字拆分**：基于天码 IDS 数据递归拆解汉字为字根
- **字根管理**：定义字根集、设置字根编码
- **转换规则**：支持可视化模式和正则模式的 IDS 转换规则
- **覆盖率分析**：统计字集内汉字的字根覆盖情况
- **编码设计**：设计输入法编码方案，支持等效字根、归并字根、字根半归并

## 开发命令

```bash
npm run dev      # 启动开发服务器 (Vite)
npm run build    # 类型检查 (vue-tsc) 并构建生产版本
npm run preview  # 本地预览生产构建
```

## 架构说明

### 核心引擎 (`src/engine/`)

业务逻辑独立于 Vue 框架，可单独测试：

| 文件 | 说明 |
|------|------|
| **engine.ts** | `CharsHijack` 主引擎类，处理汉字拆分、字根管理、覆盖率分析、编码配置 |
| **config.ts** | TOML 配置解析/导出、`UserConfig` 类型定义、localStorage 持久化 |
| **ids.ts** | IDS 解析器，`IDSNode` 树结构定义，结构操作符映射 |
| **transformer.ts** | IDS 转换规则引擎，支持可视化模式和正则模式 |
| **unicode.ts** | Unicode 区块检测、十六进制工具函数 |

### 状态管理 (`src/composables/`)

| 文件 | 说明 |
|------|------|
| **useEngine.ts** | Vue composables 模式实现的全局单例状态，提供响应式引擎访问、配置管理、字集切换、导航控制等 |

### 数据文件 (`data/`)

| 文件 | 说明 |
|------|------|
| `sky_ids.txt` | 天码 IDS 拆分数据 |
| `custom_ids.txt` | 自定义 IDS 覆盖数据 |
| `stroke.txt` | 笔画编码数据（支持多标准） |
| `dictionary.txt` | 拼音和词频数据 |
| `gb2312.txt` | GB2312 字集定义 |
| `tg8105.txt` | 通用规范汉字表 8105 字 |
| `kc6000.txt` | 科测 6000 字 |
| `cjk.txt` | CJK 基本区汉字 |
| `all.txt` | 全部汉字集 |

### 页面组件 (`src/components/pages/`)

| 组件 | 功能 |
|------|------|
| `DataPage.vue` | 数据总览，显示统计信息 |
| `ElementPage.vue` | 字根元素管理 |
| `SplitPage.vue` | 汉字拆分展示 |
| `RulePage.vue` | IDS 转换规则配置 |
| `CodePage.vue` | 字根编码管理 |
| `CoveragePage.vue` | 字集覆盖率分析 |
| `SuggestPage.vue` | 字根建议（基于使用频率） |
| `LoadDataPage.vue` | 数据加载管理 |
| `FindPage.vue` | 汉字查找 |
| `TreePage.vue` | 拆分树可视化 |
| `StepsPage.vue` | 拆分步骤展示 |
| `DecomposePage.vue` | 拆分详情 |
| `RootsPage.vue` | 字根集管理 |
| `BatchPage.vue` | 批量操作 |
| `ExportPage.vue` | 数据导出 |
| `KeyboardPage.vue` | 键盘布局配置 |

### 共享组件 (`src/components/shared/`)

| 组件 | 功能 |
|------|------|
| `CharCard.vue` | 汉字卡片展示 |
| `FileDropZone.vue` | 文件拖放区域 |
| `IdsTransformer.vue` | IDS 转换器界面 |
| `KeyboardLayout.vue` | 键盘布局显示 |
| `NamedRootEditor.vue` | 命名字根编辑器 |
| `RootCodeEditor.vue` | 字根编码编辑器 |
| `TreeNodeView.vue` | 树节点可视化（使用 @vue-flow） |

### 主应用结构

- `src/App.vue` - 主布局，包含 HeaderBar、SideNav 和 DetailPanel
- `src/main.ts` - 应用入口
- `src/style.css` - 全局样式

## 核心概念

### IDS（表意文字描述序列）

Unicode 标准定义的汉字结构描述方式，使用结构操作符描述汉字组成：

| 操作符 | 名称 | 示例 |
|--------|------|------|
| ⿰ | 左右 | ⿰木目 → 相 |
| ⿱ | 上下 | ⿱艹田 → 苗 |
| ⿲ | 左中右 | ⿲彡？ |
| ⿳ | 上中下 | ⿳？ |
| ⿴ | 全包围 | ⿴囗玉 → 国 |
| ⿵ | 上三包 | ⿵？ |
| ⿶ | 下三包 | ⿶？ |
| ⿷ | 左三包 | ⿷？ |
| ⿸ | 左上包 | ⿸厂白 → 原 |
| ⿹ | 右上包 | ⿹？ |
| ⿺ | 左下包 | ⿺？ |
| ⿻ | 重叠 | ⿻？ |

### 字根

汉字拆分的基本单位，存储在 `engine.roots`（Set 类型）中。拆分过程会递归进行，直到所有部件都在字根集中。

### 命名字根

用花括号标识的特殊字根，如 `{落字框}`，可在转换规则中定义其 IDS 表达式。存储在 `engine.namedRoots`（Map 类型）中。

### 字根编码

每个字根可配置：
- **第1码（main）**：主码，通常用于定位字根
- **第2码（sub）**：小码，可选，用于区分同位字根
- **补码（supplement）**：补充编码，可选

存储在 `engine.rootCodes`（Map<string, RootCode>）中。

### 等效字根

与主字根共享相同编码的字根集合。存储在 `engine.equivalentRoots`（Map<string, string[]>）中。

### 归并字根

编码完全复制自另一个字根的字根。存储在 `engine.mergedRoots`（Map<string, string>）中，键为归并字根，值为来源字根。

### 字根半归并

设置某一字根的某个码位等于另一字根的码位，如 `"目.1" = "日.1"` 表示「目」的第2码等于「日」的第2码。存储在 `engine.codeEquivalences`（Map<string, string>）中。

### 覆盖率

统计指定字集中，能够完全拆分为已定义字根的汉字比例。用于评估输入法方案的覆盖程度。

## 配置持久化

用户配置（字根集、命名字根、转换规则、编码规则等）通过 localStorage 以 JSON 格式持久化。同时支持 TOML 格式的导入导出：

- `exportConfigToToml()` - 导出配置为 TOML 字符串
- `importConfigFromToml()` - 从 TOML 字符串导入配置
- `saveConfigToStorage()` - 保存配置到 localStorage
- `loadConfigFromStorage()` - 从 localStorage 加载配置

### 配置结构 (UserConfig)

```typescript
interface UserConfig {
  meta: {
    version: string
    name?: string
    author?: string
    created?: string
    description?: string
  }
  charset?: string                    // 当前字集 ID
  roots: Record<string, string>       // 字根编码 { "一": "fk" }
  named_roots: Record<string, string> // 命名字根 { "{落字框}": "⿱艹氵" }
  equivalent_roots: Record<string, string[]>  // 等效字根
  merged_roots: Record<string, string>         // 归并字根
  code_equivalences: Record<string, string>    // 字根半归并
  rules: TransformRuleConfig[]        // IDS 转换规则
  code_rules: CodeRuleNode[]          // 取码规则
}
```

## 路径别名

在 `vite.config.ts` 中配置 `@` 别名指向 `src/` 目录。导入示例：

```typescript
import { CharsHijack } from '@/engine/engine'
import { useEngine } from '@/composables/useEngine'
```

## 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **@vue-flow** - 图形化节点编辑（用于取码规则配置）
- **smol-toml** - TOML 解析库

## 开发注意事项

1. **缓存机制**：引擎内部使用 `_cache` 缓存拆分结果。当字根集或规则变更时，需调用 `clearCache()` 或 `refreshStats()` 清除缓存。

2. **响应式更新**：`useEngine.ts` 中使用 `rootsVersion`、`configVersion`、`charsetVersion` 等版本号触发 Vue 计算属性更新。

3. **URL Hash 导航**：页面切换通过 URL hash 实现，支持浏览器前进/后退。

4. **数据加载顺序**：默认数据加载顺序为 IDS → 自定义 IDS → 笔画 → 字典 → 字集文件。

5. **命名字根格式**：使用花括号包裹，如 `{落字框}`，在转换规则中可替换为实际的 IDS 序列。