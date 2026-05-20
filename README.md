# xlxz-markdown-editor

基于 Obsidian CM6 引擎的 Markdown Live Preview 编辑器组件。

## 快速开始

```bash
cd packages/core && bun install && bun run build
```

```typescript
import { createEditor } from 'xlxz-markdown-editor';

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
├── packages/core/          # npm 包（xlxz-markdown-editor）
│   ├── src/                # 源码
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
