# 迁移指南：vditor → xlxz-markdown-editor

> 从 vditor（即时渲染模式）迁移到 xlxz-markdown-editor 的对照指南。

## 概述

| 维度 | vditor | xlxz-markdown-editor |
|------|--------|---------------------|
| 渲染引擎 | Lute（Go 编译的解析器） | Obsidian CM6 引擎 |
| 引入方式 | `npm install vditor` | `npm install xlxz-markdown-editor` |
| UI 风格 | 自带工具栏 | 无工具栏（Obsidian 风格，键盘优先） |
| HTML 输出 | `getHTML()` 内置 | 不支持——Markdown 是唯一真相源 |
| 包体积 | ~1.5 MB | 核心 ~26 KB + vendor ~10 MB |
| 自定义 | 选项配置 | 插件系统 + 回调 |

## 初始化对照

### vditor

```typescript
import Vditor from 'vditor';
import 'vditor/dist/index.css';

const vditor = new Vditor(container, {
  value: '# Hello',
  mode: 'ir',
  input(value) {
    console.log('changed:', value);
  },
  after() {
    vditor.focus();
  },
});
```

### xlxz-markdown-editor

```typescript
import { createEditor } from 'xlxz-markdown-editor';

const editor = createEditor(container, {
  doc: '# Hello',
  onChange(doc) {
    console.log('changed:', doc);
  },
});

editor.focus();
```

> ⚠️ 需要额外加载 vendor 脚本，参见 `apps/web/index.html`。

## API 对照表

| 功能 | vditor | xlxz-markdown-editor |
|------|--------|---------------------|
| 获取内容 | `vditor.getValue()` | `editor.getDoc()` |
| 设置内容 | `vditor.setValue(text)` | `editor.setDoc(text)` |
| 获取选中 | `vditor.getSelection()` | `editor.getSelection()` |
| 获取 HTML | `vditor.getHTML()` | ❌ 不支持。用第三方 Markdown parser 转换 |
| 插入文本 | `vditor.insertValue(text)` | `editor.setDoc(editor.getDoc() + text)` |
| 聚焦 | `vditor.focus()` | `editor.focus()` |
| 销毁 | `vditor.destroy()` | `editor.destroy()` |
| 内容变更 | `input(value)` 回调 | `onChange(doc)` 回调 |
| 保存 | ❌ | `onSave(doc)` 回调（Ctrl+S） |
| 主题 | 选项 `theme` | 选项 `theme: 'dark' \| 'light'` + `cssVariables` |
| 工具栏 | 内置 | ❌ 不提供（可在外层自行实现按钮调用 `setDoc`） |
| 链接点击 | `link.click` 回调 | `onLinkClick` / `onExternalLinkClick` 回调 |
| 上传 | `upload.handler` | `backend.saveAttachment` |
| 预览图片 | `image.preview` 回调 | 图片自动渲染为 `<img>`，点击行为由 `onLinkClick` 控制 |

## 图片处理迁移

### vditor

```typescript
new Vditor(container, {
  upload: {
    handler: async (files) => {
      const file = files[0];
      const url = await uploadToServer(file);
      vditor.insertValue(`![${file.name}](${url})`);
    },
  },
});
```

### xlxz-markdown-editor

```typescript
createEditor(container, {}, {
  async saveAttachment(name, data) {
    const blob = new Blob([data]);
    const url = await uploadToServer(blob, name);
    return url;
  },
});
// 粘贴/拖拽图片时自动调用 saveAttachment
```

## HTML 预览迁移

vditor 的 `getHTML()` 用于生成列表卡片的 HTML 预览。xlxz 不内置此功能——Markdown 是唯一数据源。

**替代方案**：使用第三方 Markdown 解析器：

```typescript
import { marked } from 'marked';

function getPreviewHtml(editor) {
  const md = editor.getDoc();
  // 取前 N 行作为预览
  const preview = md.split('\n').slice(0, 10).join('\n');
  return marked(preview);
}
```

## 已知差异

| 行为 | vditor | xlxz-markdown-editor |
|------|--------|---------------------|
| 光标离开渲染 | 整行隐藏语法符号 | 同 Obsidian：部分隐藏、保留结构 |
| 代码块语言自动检测 | 支持 | 依赖 CM5 modes（需声明语言） |
| 表格编辑 | 内置表格编辑器 | 纯文本编辑（Obsidian 风格） |
| 快捷键 | 自定义 | 与 Obsidian 一致 |
| 右键菜单 | 内置 | 不提供（可自行实现） |
| 拼写检查 | 浏览器原生 | 选项 `spellcheck: true` 启用 |
| 多语言 UI | 内置 i18n | 通过 `I18nProvider` 接口注入 |

## 迁移检查清单

- [ ] 替换 `import Vditor from 'vditor'` → `import { createEditor } from 'xlxz-markdown-editor'`
- [ ] 添加 vendor 脚本到 HTML
- [ ] `vditor.getValue()` → `editor.getDoc()`
- [ ] `vditor.setValue()` → `editor.setDoc()`
- [ ] `input` 回调 → `onChange` 回调
- [ ] `upload.handler` → `backend.saveAttachment`
- [ ] `vditor.getHTML()` → 第三方 Markdown parser
- [ ] 移除 `vditor/dist/index.css`
- [ ] 删除 `vditor` 依赖
