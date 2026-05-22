# @xlxz/markdown-editor

基于 Obsidian CM6 引擎的 Markdown Live Preview 编辑器组件。

**在线预览**：<https://xiaolinxiaozhu.github.io/markdown-editor/>

---

## 相较上游的修改

### 逻辑修改（不涉及功能修改）

**插件化重写**

将原本耦合在一起的编辑器功能拆分为独立插件，通过微内核（`createEditor`）统一管理。每个插件实现 `EditorPlugin` 接口，声明 `id`、`deps`、`install`，内核按依赖顺序加载并通过 `StateEffect.appendConfig` 注入 CM6 扩展。

重写后的效果：
- 所有功能（live-preview、折叠、行号、补全、表格、callout 等）均为可插拔插件
- 支持运行时动态注册 / 注销（`editor.use()` / `editor.unuse()`）
- 用户可按需组合插件子集，减小打包体积

相关文件：`packages/core/src/kernel.ts`、`packages/core/src/plugins/`、`packages/core/src/types.ts`

### 样式 / 逻辑修改（涉及功能优化）

#### 自定义 Table 渲染

在 Live Preview 模式下对纯文本表格提供增强渲染：

- 自动检测表格区域，按行类型（header / separator / body odd / even）添加行级 CSS 类
- 光标离开表格后自动对齐格式化（列宽自适应）
- 非编辑态显示复制按钮（一键复制整张表格）
- 光标进入表格时切换为"激活"样式，保留原始文本可编辑

相关文件：`packages/core/src/table/`（detect / format / copy-widget / theme）

#### 自定义 Callout 渲染

对 Obsidian 风格 Callout（`> [!TYPE] title`）提供 Live Preview 增强：

- 非激活态：首行替换为图标 + 标题文字，正文隐藏 `> ` 前缀但保留占位
- 激活态：显示原始 Markdown，方便编辑
- 支持全部 Obsidian 内置 Callout 类型（note / info / tip / warning / danger 等）及别名
- 各类型通过 CSS 变量控制配色，可自定义主题

相关文件：`packages/core/src/callout/`（detect / theme）

---

## 快速开始

```bash
cd packages/core && bun install && bun run build
```

```typescript
import { createEditor } from '@xlxz/markdown-editor';

const editor = createEditor(container, {
  doc: '# Hello World',
  onChange(doc) { console.log(doc); },
});
```

详细文档见 [ROADMAP.md](ROADMAP.md) 和 [docs/](docs/)。

## SSOT（单一真相源）原则

- **当前基线**：`packages/core/` 是唯一活跃的代码库
- **架构策略**：依赖恢复（识别 vendor 内嵌 npm 包 → 同版本 import 替代），见 [docs/strategy-pivot.md](docs/strategy-pivot.md)
- **失败实验归档**：见 [docs/decisions/negative/](docs/decisions/negative/)（负向 ADR）
- **历史原型**：`ref/`（md-live-preview v1.0.0）仅作参考，不活跃维护

如有分歧，`packages/core/src/` 中的代码为唯一权威定义。

## 项目结构

```
├── ROADMAP.md              # 项目路线图
├── packages/core/          # npm 包（@xlxz/markdown-editor）
│   ├── src/                # 源码
│   │   ├── kernel.ts       # 微内核
│   │   ├── plugins/        # 内置插件集
│   │   ├── table/          # 表格渲染模块
│   │   └── callout/        # Callout 渲染模块
│   ├── vendor/             # Obsidian 运行时
│   └── e2e/                # E2E 测试
├── apps/web/               # 验证应用
├── docs/                   # 文档
│   ├── decisions/negative/ # 负向决策记录
│   └── inspection/         # 验收检查清单
└── ref/                    # 历史原型（已归档，gitignored）
```

## 许可证

UNLICENSED（远期依赖恢复完成后 MIT）
