# 架构文档

> xlxz-markdown-editor 微内核架构

## 概述

xlxz-markdown-editor 采用**微内核 + 插件**架构。内核（`createEditor()`）只负责三件事：

1. 创建 CM6 EditorView
2. 管理插件注册表（use/unuse）
3. 暴露文档读写接口

所有编辑功能——Live Preview 渲染、语法高亮、自动补全、折叠、链接处理——通过独立插件实现。

```
┌──────────────────────────────────────────────┐
│                   Kernel                      │
│         (~120 lines, zero feature logic)      │
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
   ...       (17 built-in plugins)
```

## 内核（`src/kernel.ts`）

内核不包含任何具体功能逻辑。它的职责：

1. **验证运行时**：确认 Obsidian vendor 脚本已加载
2. **创建 EditorView**：空白 CM6 实例
3. **构造 Mock 对象**：供 vendor 扩展使用的 Obsidian App/Editor/Owner mock
4. **安装默认插件集**：根据 `EditorOptions` 决定加载哪些内置插件
5. **暴露实例 API**：getDoc/setDoc/use/unuse/registerSuggest/destroy

内核大小：约 120 行 TypeScript。

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
- `deps`：依赖的其他插件 ID（内核仅警告，不阻止安装）
- `install(ctx)`：返回 CM6 Extension（或扩展数组），内核批量组装或动态追加
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

- `getState/setState`：插件间通信的轻量机制（基于内存 Map）
- 插件不应直接互相依赖——通过 state 机制通信

### 编写插件

```typescript
import type { EditorPlugin } from 'xlxz-markdown-editor';

const wordCountPlugin: EditorPlugin = {
  id: 'word-counter',
  install(ctx) {
    const { EditorView } = window.__cm6;
    return EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const words = update.state.doc.toString().split(/\s+/).length;
        ctx.setState('word-counter', { words });
      }
    });
  },
};

editor.use(wordCountPlugin);
```

## Input Prompter（suggest 插件）

`suggest` 插件实现了通用的输入提示框架，类似 LSP CompletionProvider 模式：

```
┌─────────────────────────────────────────┐
│          Suggest Plugin (UI Owner)       │
│                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Provider A│ │Provider B│ │Provider C│   │
│  │ [[ link │ │ # tag   │ │ / cmd   │   │
│  └─────────┘ └─────────┘ └─────────┘   │
│                                          │
│  共享 UI：弹窗 + 键盘导航 + 位置计算     │
└─────────────────────────────────────────┘
```

### CompletionProvider 接口

```typescript
interface CompletionProvider {
  id: string;
  trigger: RegExp;       // 匹配光标前文本
  getSuggestions(query: string): SuggestItem[] | Promise<SuggestItem[]>;
  onAccept?(item: SuggestItem): void;
  suffix?: string;       // 如 "]]"
}
```

### 注册方式

```typescript
// 方式 1：通过 registerSuggest 语法糖（兼容旧 API）
editor.registerSuggest({
  trigger: /\[\[(.*)$/,
  async getSuggestions(query) {
    const targets = await backend.listLinkTargets();
    return targets.filter(t => t.name.includes(query)).map(t => ({
      label: t.name, insertText: t.name
    }));
  },
  suffix: ']]',
});

// 方式 2：直接操作 suggest 插件状态
import { suggestPlugin } from 'xlxz-markdown-editor';
// suggest 插件通过 ctx.setState('suggest', state) 暴露 addProvider/removeProvider
```

多个 provider 按注册顺序匹配，先匹配先响应。

## 内置插件目录

| 类别 | 插件 ID | 文件 | 功能 |
|------|---------|------|------|
| 基础设施 | `base-extensions` | `plugins/base-extensions.ts` | CM6 StateField 注入、Tab 设置 |
| 基础设施 | `theme` | `plugins/theme.ts` | CSS 类、变量、主题切换 |
| 核心渲染 | `markdown-language` | `plugins/markdown-language.ts` | Markdown 语法解析 |
| 核心渲染 | `hanging-indent` | `plugins/hanging-indent.ts` | 列表悬挂缩进 |
| 核心渲染 | `live-preview` | `plugins/live-preview.ts` | WYSIWYG 渲染 |
| 输入 | `list-continuation` | `plugins/list-continuation.ts` | 智能列表续行 |
| 输入 | `keymap` | `plugins/keymap.ts` | Tab 缩进、Ctrl+S |
| 输入 | `expand-text` | `plugins/expand-text.ts` | 中文括号转换 |
| 输入 | `close-brackets` | `plugins/close-brackets.ts` | 自动配对 |
| UI | `line-numbers` | `plugins/line-numbers.ts` | 行号显示 |
| UI | `indent-guide` | `plugins/indent-guide.ts` | 缩进指引线 |
| UI | `fold` | `plugins/fold.ts` | 标题/缩进折叠 |
| 功能 | `suggest` | `plugins/suggest.ts` | Input Prompter |
| 功能 | `link-handler` | `plugins/link-handler.ts` | 链接点击导航 |
| 功能 | `attachment` | `plugins/attachment.ts` | 粘贴/拖拽图片 |
| 功能 | `table` | `plugins/table.ts` | 纯文本表格 |
| 回调 | `on-change` | `plugins/on-change.ts` | 文档变更通知 |

### 默认加载逻辑

`plugin-defaults.ts` 根据 `EditorOptions` 决定加载哪些插件：

- **始终加载**：base-extensions, theme, markdown-language, hanging-indent, live-preview, list-continuation, keymap, expand-text, suggest, link-handler, attachment, table, on-change
- **条件加载**：
  - `autoPairBrackets/autoPairMarkdown !== false` → close-brackets
  - `showLineNumber !== false` → line-numbers
  - `showIndentGuide !== false` → indent-guide
  - `foldHeading/foldIndent !== false` → fold

## 依赖注入

```
EditorBackend (文件系统)
  ├── listLinkTargets()  → [[ 补全
  ├── resolveLinkPath()  → 链接解析
  ├── getResourceUrl()   → 图片 URL
  ├── readFile()         → 笔记嵌入
  ├── openFile()         → 导航
  └── saveAttachment()   → 附件保存

I18nProvider (国际化)
  └── t(key, params)

AssetLoader (资源加载)
  ├── loadFont(url)
  └── loadScript(url)
```

所有方法均可选——未提供的能力优雅降级。

## 构建

```bash
bun build src/index.ts --outfile dist/index.js  --format esm
bun build src/index.ts --outfile dist/index.cjs --format cjs
```

输出：
- `dist/index.js` — ESM (~57 KB)
- `dist/index.cjs` — CJS (~58 KB)
- `dist/*.d.ts` — TypeScript 类型声明

## 运行时依赖

编辑器需要 Obsidian 运行时脚本（vendor）预先加载到页面：

```
i18next.min.js → codemirror.js → meta.min.js → modes.min.js
→ markdown.js → turndown.js → enhance.js → mock.js
→ obsidian-app.patched.js
```

可通过 `autoLoad({ basePath: '/vendor/' })` 自动加载。

## 源码结构

```
packages/core/src/
├── index.ts            # 公开 API 入口
├── kernel.ts           # 微内核（~120 行）
├── types.ts            # 所有公开类型
├── defaults.ts         # 默认选项和后端
├── mocks.ts            # Obsidian mock 对象
├── auto-load.ts        # Vendor 脚本加载器
├── plugin-defaults.ts  # 默认插件集组装
├── plugins/            # 17 个内置插件
│   ├── index.ts        # 统一导出
│   ├── types.ts        # 插件内部类型（CompletionProvider）
│   ├── base-extensions.ts
│   ├── theme.ts
│   ├── markdown-language.ts
│   ├── hanging-indent.ts
│   ├── live-preview.ts
│   ├── list-continuation.ts
│   ├── keymap.ts
│   ├── expand-text.ts
│   ├── close-brackets.ts
│   ├── line-numbers.ts
│   ├── indent-guide.ts
│   ├── fold.ts
│   ├── suggest.ts
│   ├── link-handler.ts
│   ├── attachment.ts
│   ├── table.ts
│   └── on-change.ts
└── table/              # 表格扩展实现
    ├── index.ts
    ├── detect.ts
    ├── format.ts
    ├── copy-widget.ts
    └── theme.ts
```
