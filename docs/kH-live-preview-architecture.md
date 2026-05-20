# __kH (Live Preview) 架构分析

> 基于 obsidian-app.patched.js 逆向分析

## 概述

`window.__kH = kH` 是 Live Preview 渲染引擎。它接收 editor mock 和 EditorView，返回一组 CM6 扩展。

```
kH(mockEditor, view) → Extension[]
```

## 调用链

```
kernel.ts:
  const livePreviewExts = window.__kH(mockEditor, view);
  stateExtensions.push(livePreviewExts);
```

## 架构图

```
kH(editor, view)
├── mH(editor, view) → StateField<DecorationSet>  [核心: 425行]
│   └── update(state) → decorations
│       ├── syntaxTree(state) 遍历语法树节点
│       ├── 光标位置判断 → 是否显示原始 markdown
│       └── 生成 Decoration.replace/widget/mark
├── VR → ViewPlugin { mousedown: boolean }  [鼠标状态追踪]
├── bH → ViewPlugin(pH class)  [内联装饰: ~260行]
│   └── pH.decorations → DecorationSet
├── wH → ViewPlugin(fH class)  [附加装饰: ~40行]
│   └── fH.decorations → DecorationSet
├── gH → [ViewPlugin]  [点击/滚动处理: ~70行]
├── yH(editor) → ViewPlugin  [post-processor-change 监听]
├── ArrowUp/Down keymap  [跨 block decoration 导航]
├── QF(editor, stateField) → transactionFilter  [表格编辑过滤: ~100行]
└── $F table utilities  [表格 widget + 辅助方法]
    ├── $F.cellSanitizerPlugin(editor)
    └── $F.detectSurroundingClick(stateField)
```

## 核心组件详解

### mH — 主装饰 StateField (L102764-103189, 425行)

```javascript
function mH(editor, view) {
  // ... 初始化 ...
  
  var u = function(viewUpdate) {
    // 核心逻辑：
    // 1. 获取语法树: syntaxTree(state)
    // 2. 获取选区: state.selection.ranges
    // 3. 遍历可见范围内的语法节点
    // 4. 对每个节点决定：
    //    - 光标在节点内 → 显示原始 markdown（不装饰）
    //    - 光标不在 → 应用 Live Preview 装饰
    // 5. 返回 DecorationSet
  };
  
  return StateField.define({
    create: () => Decoration.none,
    update: (decorations, transaction) => {
      // 判断是否需要重新计算
      // 条件：语法树就绪、非 composing、非 mousedown
      // 如果需要：调用 u(viewUpdate) 重建装饰
      // 否则：map 现有装饰
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
```

### 关键内部变量

| 变量 | 位置 | 作用 |
|------|------|------|
| `zR` | L101686 | 需要 Live Preview 的内联元素集合 |
| `UR` | L101700 | `Decoration.replace({})` — 用于隐藏 markdown 标记 |
| `qR` | L101699 | 代码块围栏正则 `/^\s*(~~~+|\`\`\`+)[ \t]*([\w\/+#-]*)[^\n\`]*$/` |
| `VR` | L101683 | mousedown 状态追踪插件 |
| `HR` | — | StateEffect（触发装饰重建） |
| `If` | — | 搜索高亮 StateField |

### zR — Live Preview 内联元素列表

```javascript
zR = new Set([
  "em",                 // 斜体 *text*
  "strong",             // 粗体 **text**
  "inline-code",        // 行内代码 `code`
  "strikethrough",      // 删除线 ~~text~~
  "highlight",          // 高亮 ==text==
  "link",               // 链接 [text](url)
  "image",              // 图片 ![alt](url)
  "hmd-internal-link",  // Wiki链接 [[page]]
  "hmd-embed",          // 嵌入 ![[page]]
  "formatting-link",    // 链接格式化标记
  "footref",            // 脚注引用
]);
```

### pH — 内联装饰插件 (L102461, ~260行)

负责：
- 为斜体/粗体/代码/删除线等生成 mark decorations
- 处理链接和图片的 widget decorations
- 管理 embed 组件的生命周期

### $F — 表格 Widget (L88665)

完整的表格渲染系统：
- 将 markdown 表格渲染为 HTML table
- 支持单元格选择和编辑
- 列对齐、列宽计算

## 替换策略

### 优先级

1. **P0: mH (StateField)** — 核心逻辑，决定什么被隐藏/显示
2. **P1: pH (内联装饰)** — 具体的装饰样式
3. **P2: gH (交互)** — 点击处理
4. **P3: $F (表格)** — 复杂但独立
5. **P4: 其他** — VR, fH, yH, QF 都相对简单

### 实现路径

```
Phase A: 基础 Live Preview
  - 实现 mH 等价物：标题/粗体/斜体的隐藏/显示
  - 目标：通过 live-preview.test.ts 的前 5 个测试

Phase B: 完整内联
  - 链接、图片、代码块、Wiki-link
  - 目标：通过全部 23 个 live-preview 测试

Phase C: 交互 + 表格
  - 点击处理、导航、表格渲染
  - 目标：通过全部 48+ 测试
```

### 技术方案

使用 `window.__cm6_packages` 获取 vendor 的 CM6 实例：

```typescript
const { StateField, EditorState } = window.__cm6_packages["@codemirror/state"];
const { EditorView, Decoration, ViewPlugin } = window.__cm6_packages["@codemirror/view"];
const { syntaxTree } = window.__cm6_packages["@codemirror/language"];
```

这确保所有 Facet/StateField 使用同一实例，不会产生身份冲突。

## 依赖关系

kH 依赖的外部全局：
- `window.__stateFields.owner` (WB) — 获取文件信息
- `window.__stateFields.livePreview` (KB) — Live Preview 开关状态
- `window.__fields.searchHighlight` (If) — 搜索高亮状态
- 语法树节点类型名（来自 `__language` 的 markdown parser）

## 语法树节点类型

mH 通过检查语法树节点的 `type.name` 来决定装饰方式。
这些名称由 `__language`（@lezer/markdown + Obsidian 扩展）定义。
替换 kH 不需要替换 __language — 只需要知道节点类型名。

关键节点类型（从 zR 和代码分析推断）：
- `ATXHeading1`-`ATXHeading6`, `SetextHeading1`, `SetextHeading2`
- `Emphasis`, `StrongEmphasis`, `Strikethrough`, `Highlight`
- `InlineCode`, `FencedCode`, `CodeBlock`
- `Link`, `Image`, `URL`
- `hmd-internal-link`, `hmd-embed` (Obsidian 自定义)
- `Blockquote`, `BulletList`, `OrderedList`, `ListItem`
- `HorizontalRule`, `Callout`
- `formatting-*` (各种格式化标记)
