# API 参考

> xlxz-markdown-editor v1.0.0

## 安装

```bash
bun add xlxz-markdown-editor
# 或
npm install xlxz-markdown-editor
```

## 快速开始

```typescript
import { createEditor } from 'xlxz-markdown-editor';

const editor = createEditor(document.getElementById('editor')!, {
  doc: '# Hello World\n\nStart writing...',
  onChange(doc) {
    console.log('Document changed:', doc.length, 'chars');
  },
});
```

**前置条件**：页面需加载 Obsidian 运行时脚本（vendor）。参考 `apps/web/index.html` 中的 `<script>` 标签加载顺序。

---

## 核心 API

### `createEditor(container, options?, backend?): EditorInstance`

创建编辑器实例。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `container` | `HTMLElement` | 是 | 编辑器挂载的 DOM 容器 |
| `options` | `EditorOptions` | 否 | 编辑器配置，所有字段均可选 |
| `backend` | `EditorBackend` | 否 | 后端能力实现，所有方法均可选 |

**异常**：若 Obsidian 运行时未加载，抛出 `Error`。

**示例**：

```typescript
const editor = createEditor(container, {
  doc: '# Hello',
  filePath: 'notes/hello.md',
  theme: 'dark',
  onChange(doc) { saveToServer(doc); },
});
```

---

### `EditorInstance`

| 成员 | 类型 | 说明 |
|------|------|------|
| `view` | `EditorView` | CM6 EditorView 实例（高级用途） |
| `getDoc()` | `() => string` | 获取当前文档的 Markdown 文本 |
| `setDoc(content)` | `(content: string) => void` | 替换整个文档内容 |
| `getSelection()` | `() => string` | 获取当前选中的文本 |
| `focus()` | `() => void` | 聚焦编辑器 |
| `destroy()` | `() => void` | 销毁编辑器，释放 DOM 和事件 |
| `use(plugin)` | `(plugin: EditorPlugin) => void` | 注册插件 |
| `unuse(pluginId)` | `(pluginId: string) => void` | 注销插件 |
| `registerSuggest(config)` | `(config: SuggestConfig) => () => void` | 注册自动补全，返回取消注册函数 |

---

## 配置类型

### `EditorOptions`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `doc` | `string` | `''` | 初始文档内容 |
| `filePath` | `string` | `'untitled.md'` | 当前文件路径（链接解析上下文） |
| `tabSize` | `number` | `4` | Tab 宽度 |
| `useTab` | `boolean` | `true` | 是否使用 Tab 缩进（否则空格） |
| `readableLineWidth` | `boolean` | `true` | 限制可读行宽 |
| `showLineNumber` | `boolean` | `true` | 显示行号 |
| `showIndentGuide` | `boolean` | `true` | 显示缩进指引 |
| `foldHeading` | `boolean` | `true` | 启用标题折叠 |
| `foldIndent` | `boolean` | `true` | 启用缩进折叠 |
| `autoPairBrackets` | `boolean` | `true` | 自动配对括号 |
| `autoPairMarkdown` | `boolean` | `true` | 自动配对 Markdown 标记 |
| `spellcheck` | `boolean` | `false` | 拼写检查 |
| `theme` | `'dark' \| 'light'` | `'dark'` | 主题 |
| `cssVariables` | `Record<string, string>` | `{}` | CSS 变量覆写 |
| `onChange` | `(doc: string) => void` | — | 文档变更回调 |
| `onSave` | `(doc: string) => void` | — | Ctrl+S 保存回调 |
| `onLinkClick` | `(linktext: string, sourcePath: string) => void` | — | 内部链接点击回调 |
| `onExternalLinkClick` | `(url: string) => void` | — | 外部链接点击回调 |

### `EditorBackend`

所有方法均可选。未提供的方法使用无操作默认实现。

| 方法 | 签名 | 说明 |
|------|------|------|
| `listLinkTargets` | `() => Promise<LinkTarget[]>` | 返回 `[[` 自动补全的候选列表 |
| `resolveLinkPath` | `(linktext, sourcePath) => string \| null` | 检查链接目标是否存在 |
| `getResourceUrl` | `(path) => string` | vault 路径 → 可加载 URL |
| `readFile` | `(path) => Promise<string>` | 读取文件内容（笔记嵌入） |
| `openFile` | `(path) => void` | 打开/导航到文件 |
| `saveAttachment` | `(name, data) => Promise<string>` | 保存附件，返回最终路径 |

### `LinkTarget`

```typescript
interface LinkTarget {
  path: string;       // 文件路径
  name: string;       // 显示名称
  aliases?: string[]; // 别名列表
}
```

---

## 插件系统

### `EditorPlugin`

```typescript
interface EditorPlugin {
  id: string;                        // 唯一标识
  deps?: string[];                   // 依赖的插件 ID
  install(ctx: PluginContext): any;  // 返回 CM6 Extension
  uninstall?(ctx: PluginContext): void;
}
```

### `PluginContext`

```typescript
interface PluginContext {
  view: EditorView;
  options: EditorOptions;
  backend: Required<EditorBackend>;
  getState<T>(pluginId: string): T | undefined;
  setState<T>(pluginId: string, state: T): void;
}
```

### 插件示例

```typescript
const myPlugin: EditorPlugin = {
  id: 'my-logger',
  install(ctx) {
    const { EditorView } = window.__cm6;
    return EditorView.updateListener.of((update: any) => {
      if (update.docChanged) {
        console.log('Doc changed!');
      }
    });
  },
};

editor.use(myPlugin);
editor.unuse('my-logger');
```

---

## 自动补全

### `registerSuggest(config): () => void`

```typescript
const cleanup = editor.registerSuggest({
  // 触发正则（匹配光标前文本）
  trigger: /\[\[([^\]]*)$/,
  // 返回建议列表
  getSuggestions(query: string) {
    return [
      { label: 'Note A', insertText: 'Note A' },
      { label: 'Note B', insertText: 'Note B' },
    ].filter(n => n.label.toLowerCase().includes(query.toLowerCase()));
  },
  // 插入后追加后缀
  suffix: ']]',
  // 选中回调（可选）
  onAccept(item) {
    console.log('Accepted:', item.label);
  },
});

// 取消注册
cleanup();
```

### `SuggestConfig`

| 字段 | 类型 | 说明 |
|------|------|------|
| `trigger` | `RegExp` | 触发正则，第一个捕获组为 query |
| `getSuggestions` | `(query: string) => SuggestItem[] \| Promise<SuggestItem[]>` | 获取建议列表 |
| `suffix` | `string` | 插入后追加的后缀 |
| `onAccept` | `(item: SuggestItem) => void` | 选中回调（可选） |

### `SuggestItem`

```typescript
interface SuggestItem {
  label: string;       // 显示文本
  insertText: string;  // 插入文本
}
```

---

## CSS 自定义

编辑器样式基于 CSS 变量。通过 `cssVariables` 选项覆写：

```typescript
createEditor(container, {
  cssVariables: {
    '--font-text': '"Noto Serif SC", serif',
    '--font-text-size': '18px',
    '--font-monospace': '"Fira Code", monospace',
  },
});
```

常用 CSS 变量：

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `--font-text` | 正文字体 | 系统默认 |
| `--font-interface` | UI 字体（行号等） | 系统默认 |
| `--font-monospace` | 代码字体 | ui-monospace |
| `--font-text-size` | 正文字号 | 16px |
| `--line-height` | 行高 | 1.5 |
