# 架构文档

> xlxz-markdown-editor 微内核架构

## 概述

xlxz-markdown-editor 采用**微内核 + 插件**架构。内核（`createEditor()`）只负责生命周期、文档状态和插件注册表，所有编辑功能——Live Preview 渲染、语法高亮、自动补全、图片处理——通过插件实现。

```
┌──────────────────────────────────────────────┐
│                   Kernel                      │
│                                               │
│  createEditor(container, options?, backend?)  │
│                                               │
│  EditorInstance:                              │
│    .view        → CM6 EditorView              │
│    .getDoc()    → markdown 文本               │
│    .setDoc()    → 替换内容                    │
│    .focus() / .destroy()                      │
│    .use(plugin) / .unuse(pluginId)            │
│    .registerSuggest(config)                   │
└──────────────┬───────────────────────────────┘
               │
   ┌───────────┼───────────┐
   ▼           ▼           ▼
 Plugin A   Plugin B   Plugin C
```

## 内核（~800 行，计划阶段 5 插件拆分后缩减至 ~300 行）

内核位于 `packages/core/src/kernel.ts`，职责：

1. **创建 CM6 EditorView**：调用 Obsidian 运行时创建编辑器
2. **插件注册表**：`use(plugin)` / `unuse(pluginId)` 管理插件生命周期
3. **文档读写**：`getDoc()` / `setDoc()` / `getSelection()`
4. **依赖注入**：通过 `EditorBackend` 接口注入外部能力

内核不关心具体的编辑功能——Live Preview、语法高亮、自动补全等全部通过插件或直接挂在 CM6 扩展上。

## 插件系统

### 插件接口

```typescript
interface EditorPlugin {
  id: string;
  deps?: string[];
  install(ctx: PluginContext): Extension | Extension[];
  uninstall?(ctx: PluginContext): void;
}
```

- `id`：唯一标识，作为插件注册/注销的 key
- `deps`：依赖的其他插件 ID，内核不强制校验，仅警告
- `install(ctx)`：返回 CM6 Extension（或扩展数组），内核通过 `StateEffect.appendConfig` 动态挂载
- `uninstall(ctx)`：清理逻辑（可选）

### 插件上下文

```typescript
interface PluginContext {
  view: EditorView;
  options: EditorOptions;
  backend: Required<EditorBackend>;
  getState<T>(pluginId: string): T | undefined;
  setState<T>(pluginId: string, state: T): void;
}
```

- `getState/setState`：插件间共享状态的轻量机制（基于内存 Map）
- 插件不应直接互相依赖——通过内核的 state 机制通信

### 编写插件

```typescript
const myPlugin: EditorPlugin = {
  id: 'word-counter',
  install(ctx) {
    const { EditorView } = window.__cm6;
    return EditorView.updateListener.of((update: any) => {
      if (update.docChanged) {
        const words = update.state.doc.toString().split(/\s+/).length;
        ctx.setState('word-counter', { words });
      }
    });
  },
};

editor.use(myPlugin);
```

## 依赖注入

所有外部依赖通过接口注入，内核不依赖任何具体实现：

```
EditorBackend (文件系统)
  ├── listLinkTargets()  → [[ 补全
  ├── resolveLinkPath()  → 链接解析状态
  ├── getResourceUrl()   → 图片/附件 URL
  ├── readFile()         → 笔记嵌入
  ├── openFile()         → 导航
  └── saveAttachment()   → 附件保存

I18nProvider (国际化)
  └── t(key, params)     → 翻译

AssetLoader (资源加载)
  ├── loadFont(url)      → 字体加载
  └── loadScript(url)    → 脚本加载
```

## 插件目录（概念）

内核不强制定义扩展点——插件 ID 即契约。以下是当前实现的插件概念：

| 类别 | 插件 ID | 功能 |
|------|---------|------|
| 核心渲染 | `live-preview` | WYSIWYG 渲染 |
| 核心渲染 | `markdown-language` | Markdown 语法解析 |
| 核心渲染 | `hanging-indent` | 列表悬挂缩进 |
| 输入 | `list-continuation` | 智能列表续行 |
| 输入 | `markdown-surround` | 选中文字包围 |
| 输入 | `close-brackets` | 自动配对 |
| 输入 | `expand-text` | 中文括号转换 |
| 渲染 | `wiki-link` | `[[link]]` 渲染和导航 |
| 渲染 | `callout` | `> [!NOTE]` 渲染 |
| 渲染 | `tag-render` | `#tag` 渲染 |
| 渲染 | `embed` | 笔记嵌入 |
| UI | `fold` | 标题/缩进折叠 |
| UI | `line-numbers` | 行号 |
| UI | `indent-guide` | 缩进指引 |
| 功能 | `suggest` | 自动补全 |
| 功能 | `attachment` | 粘贴/拖拽 |
| 可选 | `math` | MathJax 公式 |
| 可选 | `syntax-highlight` | 代码语法高亮 |
| 可选 | `i18n` | 国际化 |

> 注意：当前实现中，这些插件逻辑内聚在 `kernel.ts` 中。后续重构将逐个提取为独立插件模块。

## 构建

```
bun build src/index.ts --outfile dist/index.js  --format esm
bun build src/index.ts --outfile dist/index.cjs --format cjs
```

输出：
- `dist/index.js` — ESM（~25 KB）
- `dist/index.cjs` — CJS（~26 KB）
- `dist/*.d.ts` — TypeScript 类型声明

## 运行时依赖

编辑器需要 Obsidian 运行时脚本（vendor）预先加载到页面：

```
i18next.min.js → codemirror.js → meta.min.js → modes.min.js
→ markdown.js → turndown.js → enhance.js → mock.js
→ obsidian-app.patched.js
```

参见 `apps/web/index.html` 的完整加载顺序。
