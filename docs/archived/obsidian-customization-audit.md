# Obsidian 定制深度审计

> 基于 md-live-preview 逆向工程，穷举 Obsidian 在 CodeMirror 6 之上的所有定制点，按修改深度分为 A/B/C 三类。本报告为 clean-room 重写提供逐项清单。

---

## 类别 A：完全自定义的逻辑（15 项）

Obsidian 从零实现，不依托 CM6 扩展点。clean-room 重写时需逐项重新实现。

### A1 — Live Preview 渲染引擎

- **暴露为**：`window.__kH(mockEditor, view) → Extension[]`
- **功能**：WYSIWYG 的核心魔法。光标离开某行后，将该行的 markdown 语法符号（`#`、`**`、`*`、`[[`、`>` 等）替换为视觉渲染效果。光标进入该行时还原语法符号。
- **实现推测**：ViewPlugin + Decoration 体系。监听光标位置变化（`update.selectionSet`），对非光标行应用隐藏 decoration（将语法符号替换为 styled DOM），对光标所在行移除 decoration。
- **复杂度**：🔴 极高。需要为每种 markdown 语法节点（标题、粗体、斜体、链接、图片、列表、blockquote、callout、code、tag、embed 等）定义各自的隐藏/渲染规则。

### A2 — Markdown 语言定义

- **暴露为**：`window.__language`
- **功能**：Markdown 的 StreamLanguage parser，继承自 hypermd（CM5 的 markdown mode），扩展了 Obsidian 特有语法。
- **扩展的语法节点**：
  - `[[wiki-link]]` — 内部链接（含别名 `[[target|alias]]`）
  - `![[embed]]` — 笔记/图片嵌入
  - `> [!NOTE]` / `> [!WARNING]` — Callout 语法
  - `#tag` / `#nested/tag` — 标签
  - `^block-ref` — 块引用
  - `---` frontmatter 块 — YAML 元数据
  - `==highlight==` — 高亮文本
  - `~~strikethrough~~` — 删除线（GFM 标准，但 hypermd 原生可能没有）
- **复杂度**：🔴 高。StreamLanguage API 是 CM5 遗留接口，clean-room 时需用 CM6 的 Language API（`@codemirror/language`）完全重写。

### A3 — 悬挂缩进

- **暴露为**：`window.__hangingIndent`
- **功能**：列表项内换行后，文字对齐到项目符号之后而非行首。
- **效果示例**：
  ```
  - 这是一段很长的列表项文字
    第二行对齐到此处（而非 - 的下方）
  ```
- **实现推测**：自定义 Decoration 或 StyleModule，对列表项内换行行添加 text-indent。
- **复杂度**：🟡 中。

### A4 — 智能列表续行

- **暴露为**：`window.__listRegex`
- **功能**：
  - 列表项末尾按 Enter → 自动插入下一个列表标记（`- `、`1. `、`- [ ] ` 等）
  - 有序列表自动递增序号
  - 空列表项按 Enter → 删除该列表标记（退出列表）
  - blockquote + 列表嵌套场景（`> - item`）正确处理
- **实现**：自定义 keymap handler（见 `extensions.ts` 中 Enter 键的处理）。`listRegex` 用于检测当前行是否为列表项并提取前缀结构。
- **复杂度**：🟡 中。clean-room 时可参考 `@codemirror/lang-markdown` 的列表行为但 Obsidian 的更完善。

### A5 — Frontmatter 处理

- **暴露为**：`window.__frontmatterHandler`
- **功能**：解析 `---\n...\n---` 包裹的 YAML frontmatter 块。支持：
  - 语法高亮（YAML 键值对）
  - 折叠/展开
  - 渲染为属性列表（`propertiesInDocument: 'visible'`）
- **复杂度**：🟡 中。

### A6 — Markdown 包围

- **暴露为**：`window.__closeBrackets.markdownSurround (iB)`
- **功能**：选中文字后输入 `*` → 用 `*文字*` 包围而非替换。支持 `*`、`_`、`` ` ``、`~`、`=` 等符号。需要判断上下文（不在代码块内才生效）。
- **与 CM6 的区别**：CM6 原生 `closeBrackets` 只处理括号配对，不处理选中文字后的包围行为。
- **复杂度**：🟡 中。

### A7 — Wiki-link 解析与渲染

- **暴露为**：内嵌在 `__language` 和 `__kH` 中
- **功能**：
  - `[[target]]` 解析为内部链接
  - `[[target|alias]]` 支持别名
  - 已解析链接 vs 未解析链接（不同 CSS class：`is-resolved` / `is-unresolved`）
  - 链接点击导航
- **复杂度**：🟡 中。

### A8 — Callout 渲染

- **暴露为**：内嵌在 `__language` 和 `__kH` 中
- **功能**：`> [!NOTE]` / `> [!WARNING]` / `> [!TIP]` / `> [!INFO]` / `> [!DANGER]` / `> [!EXAMPLE]` 等渲染为带图标、标题和背景色的提示块。支持可折叠 callout（`> [!NOTE]-`）。
- **复杂度**：🟡 中。

### A9 — Tag 渲染

- **暴露为**：内嵌在 `__language` 中
- **功能**：`#tag` 和 `#nested/tag/sub` 渲染为可点击的标签 pill。标签中不允许空格和某些特殊字符。
- **复杂度**：🟢 低。

### A10 — Embed 渲染

- **暴露为**：内嵌在 `__kH` 中
- **功能**：
  - `![[note]]` — 嵌入其他笔记的内容（内联渲染为 HTML）
  - `![[image.png]]` — 嵌入图片
  - `![[audio.mp3]]` — 嵌入音频
  - `![[note#^block]]` — 嵌入特定块
- **复杂度**：🟡 中。

### A11 — 中文括号自动转换

- **暴露为**：项目自写（`src/expand-text.ts`）
- **功能**：输入 `【【` → 自动替换为 `[[`，输入 `】】` → 自动替换为 `]]`。使用 `EditorView.updateListener` 监听 `input` 事件后用 `view.dispatch()` 替换。
- **注**：这是 Obsidian 在中文语言环境下的行为。当前实现仅支持全角括号到半角的转换。
- **复杂度**：🟢 低。

### A12 — 自定义 StateField

- **暴露为**：`window.__stateFields.editor (jB)` / `owner (WB)` / `livePreview (KB)`
- **功能**：
  - `editor`：将 mock Editor 对象注入 CM6 State，供所有扩展访问
  - `owner`：将文件所有者信息（路径、文件名）注入 State
  - `livePreview`：标记当前是否处于 live preview 模式（vs source mode）
- **实现**：`StateField.define()` 创建，通过 `jB.init(() => view)` 等方式初始化。
- **复杂度**：🟡 中。

### A13 — 自定义缩进命令

- **暴露为**：`window.__commands.indentMore` / `indentLess` / `newlineAndIndent`
- **功能**：
  - Tab → 增加缩进（列表嵌套、blockquote 嵌套）
  - Shift-Tab → 减少缩进
  - Enter → 新行 + 缩进
- **Markdown 感知**：在列表项中按 Tab 增加缩进层级（从 `- ` 变成 `  - `），在 blockquote 中正确处理 `>` 前缀。
- **复杂度**：🟡 中。

### A14 — HTML 粘贴转 Markdown

- **暴露为**：项目自写（`mock-app.ts` 中 `clipboardManager.handlePaste`）
- **功能**：粘贴富文本 HTML 时，使用 TurndownService 转为 Markdown 后插入。仅在 clipboard 包含 `text/html` 时触发。
- **复杂度**：🟢 低。

### A15 — 附件拖拽/粘贴

- **暴露为**：项目自写（`mock-app.ts` 中 `clipboardManager`）
- **功能**：
  - 拖拽文件到编辑器 → 调用 `saveAttachment()` → 插入 `[[path]]` 或 `![[path]]`
  - 粘贴图片 → 调用 `saveAttachment()` → 插入 `![[path]]`
- **复杂度**：🟡 中。

---

## 类别 B：基于 CM6 扩展点定制（11 项）

使用了 CM6 的公开扩展点（StateField、ViewPlugin、Decoration、keymap、Compartment 等），但注入了 Obsidian 特有的行为。clean-room 时可用 CM6 公开 API 重新实现。

### B1 — 自动配对括号（closeBrackets）

- **暴露为**：`window.__closeBrackets` (pT/lT/fT/iB)
- **基于**：`@codemirror/autocomplete` 的 `closeBrackets` 扩展
- **Obsidian 定制**：
  - 括号列表扩展：加入 `*`、`_`、`` ` ``、` ``` ` 等 markdown 符号
  - 上下文感知：不在代码块/数学公式内配对
- **复杂度**：🟡 中。

### B2 — 标题折叠

- **暴露为**：`window.__foldHeading`
- **基于**：`@codemirror/language` 的 `foldService`（node-based）
- **Obsidian 定制**：针对 `#` 标题层级折叠，支持嵌套标题折叠
- **复杂度**：🟢 低。

### B3 — 缩进折叠

- **暴露为**：`window.__foldIndent`
- **基于**：`@codemirror/language` 的 `foldService`（indent-based）
- **Obsidian 定制**：Markdown 列表和 blockquote 的缩进折叠
- **复杂度**：🟢 低。

### B4 — 折叠 UI

- **暴露为**：`window.__foldGutter` / `__foldExtensions` / `__foldEffect`
- **基于**：`@codemirror/language` 的 `foldGutter`
- **Obsidian 定制**：Obsidian 主题风格的折叠按钮（箭头图标、颜色、hover 效果）、折叠动画
- **复杂度**：🟢 低。

### B5 — 行号显示

- **暴露为**：`window.__lineNumbers`
- **基于**：`@codemirror/view` 的 `lineNumbers`
- **Obsidian 定制**：Obsidian 风格的行号样式、字号、颜色、间距
- **复杂度**：🟢 低。

### B6 — 活动行高亮

- **暴露为**：`window.__activeLineGutter` / `__highlightActiveLineGutter`
- **基于**：`@codemirror/view` 的 gutter 扩展 + `highlightActiveLine`
- **Obsidian 定制**：当前行行号和背景高亮的颜色
- **复杂度**：🟢 低。

### B7 — 缩进指引

- **暴露为**：`window.__indentGuide`
- **基于**：`@codemirror/view` 的 `indentGuides` 或 `@codemirror/language`
- **Obsidian 定制**：适配 Obsidian 主题色的缩进线样式
- **复杂度**：🟢 低。

### B8 — 自定义 Keymap

- **暴露为**：`extensions.ts` 中 `keymap.of([...])`
- **基于**：`@codemirror/commands` 的 `keymap`
- **Obsidian 定制**：
  - Enter：列表续行、blockquote 续行
  - Tab/Shift-Tab：缩进/反缩进（markdown 感知）
  - Ctrl+S：保存
- **复杂度**：🟡 中。

### B9 — 自动补全架构

- **暴露为**：内嵌在 Obsidian 中，项目使用 `src/suggest.ts` 自建
- **基于**：`@codemirror/autocomplete` 的 `autocompletion`
- **Obsidian 定制**：
  - `[[` 触发链接补全
  - `/` 触发 slash command
  - 自定义补全弹窗 UI
- **复杂度**：🟡 中。

### B10 — 拼写检查

- **暴露为**：通过 `EditorView.contentAttributes` 设置 `spellcheck`
- **基于**：`@codemirror/view` 的 `contentAttributes`
- **Obsidian 定制**：利用浏览器原生拼写检查（`contenteditable="true"` + `spellcheck="true"`），无需额外的 spellcheck 库
- **复杂度**：🟢 低。

### B11 — Compartment 动态扩展切换

- **暴露为**：`window.__compartments` (base ZB / dynamic iN)
- **基于**：`@codemirror/state` 的 `Compartment`
- **Obsidian 定制**：用 Compartment 实现 source mode / live preview 的动态切换，无需重建 EditorState
- **复杂度**：🟢 低。

---

## 类别 C：CM6 原生特性（15 项）

Obsidian 直接使用，无定制。clean-room 时无需任何额外工作。

| # | 特性 | CM6 来源 |
|---|------|----------|
| C1 | EditorView 生命周期 | `@codemirror/view` |
| C2 | EditorState.create / setState | `@codemirror/state` |
| C3 | tabSize 配置 | `@codemirror/state` |
| C4 | indentUnit 配置 | `@codemirror/language` |
| C5 | updateListener | `@codemirror/view` |
| C6 | domEventHandlers | `@codemirror/view` |
| C7 | Transaction.addToHistory | `@codemirror/state` |
| C8 | StateEffect.appendConfig | `@codemirror/state` |
| C9 | syntaxTree | `@codemirror/language` |
| C10 | keymap.of() | `@codemirror/commands` |
| C11 | languageData.of() | `@codemirror/language` |
| C12 | Selection API | `@codemirror/state` |
| C13 | contentAttributes | `@codemirror/view` |
| C14 | ChangeSpec / Transaction | `@codemirror/state` |
| C15 | coordsAtPos / posAtDOM | `@codemirror/view` |

---

## 第三方依赖审计

这些是 Obsidian 使用的第三方库，与 Obsidian 定制代码零耦合（或极少耦合）。

| 库 | 用途 | 大小 | 可选？ | clean-room 处理 |
|----|------|------|--------|----------------|
| CodeMirror 5 | hypermd 的依赖（语法解析底层） | ~170KB | 否 | 阶段 5 用 CM6 Language API 替代 |
| hypermd | CM5 的 markdown mode | ~80KB | 否 | 阶段 5 用 `@codemirror/lang-markdown` 替代 |
| i18next | 国际化框架 | ~40KB | 是 | 保留或替换为轻量方案 |
| Turndown | HTML → Markdown 转换 | ~30KB | 是 | 保留（MIT 许可） |
| MathJax (tex-chtml-full) | LaTeX 数学公式渲染 | ~1.3MB | 是 | 保留（Apache 2.0 许可） |
| woff 字体 | MathJax 字体渲染 | ~700KB | 是 | 保留 |

---

## 关键结论

1. **A1+A2 是核心堡垒**。Live Preview 渲染引擎（A1）和 Markdown 语言定义（A2）约占总定制代码的 60%。clean-room 重写时这两个是主要工作量。

2. **A3-A15 粒度高、可独立实现**。除 A1/A2 外，其余 13 项都是边界清晰的独立功能，可以逐个插件实现和替换。

3. **B 类全部可基于 CM6 公开 API 重写**。不需要逆向 Obsidian，只需要知道"Obsidian 用这个扩展点做了什么"。

4. **C 类是零成本项**。clean-room 后行为完全不变。

5. **第三方依赖干净**。MathJax、Turndown 都是标准开源库，只在 hypermd/CM5 这条链上有遗留依赖。阶段 5 的核心就是切断 CM5 依赖链。

---

> 基于 md-live-preview 逆向分析，覆盖所有 `window.__*` 全局变量。
>
> 最后更新：2025-07
