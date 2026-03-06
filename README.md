# 字劫 (Chars Hijack)

基于 Vue 3 + TypeScript 的汉字拆分分析与输入法编码设计工具。

## 功能特性

- **汉字拆分** - 基于 IDS（表意文字描述序列）递归拆解汉字为字根
- **字根管理** - 定义字根集、设置字根编码、命名字根
- **转换规则** - 支持可视化模式和正则模式的 IDS 转换
- **覆盖率分析** - 统计字集内汉字的字根覆盖情况
- **编码设计** - 支持等效字根、归并字根、字根半归并

## 快速开始

```bash
# 安装依赖
bun install

# 启动开发服务器
bun run dev

# 构建生产版本
bun run build

# 预览构建结果
bun run preview
```

## 技术栈

- Vue 3 + TypeScript
- Vite
- @vue-flow（图形化节点编辑）
- smol-toml（TOML 解析）

## 项目结构

```
src/
├── engine/          # 核心引擎（框架无关）
│   ├── engine.ts    # 主引擎类
│   ├── config.ts    # 配置管理
│   ├── ids.ts       # IDS 解析器
│   └── transformer.ts # 转换规则引擎
├── composables/     # Vue 状态管理
├── components/      # Vue 组件
│   ├── pages/       # 页面组件
│   └── shared/      # 共享组件
└── data/           # 数据文件
```

## 配置导入导出

支持 TOML 格式的配置导入导出，包含字根集、命名字根、转换规则、编码规则等。

## License

MIT