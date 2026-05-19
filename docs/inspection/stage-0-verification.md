# 阶段 0 验收报告

> 日期：2025-07
> 对应 commit：`1a19752`

## 验收结论

✅ **通过**。所有基础设施就位，`apps/web` 可正常启动并渲染 Live Preview。

---

## 验收过程中发现的问题

### 问题 1：vendor 脚本 404（lib/ 路径缺失）

**现象**：浏览器 console 报 6 个 404——`i18next.min.js`、`codemirror.js`、`meta.min.js`、`modes.min.js`、`markdown.js`、`turndown.js` 无法加载。

**根因**：`apps/web/index.html` 中路径为 `/vendor/i18next.min.js`，但实际文件在 `public/vendor/lib/i18next.min.js`（缺失 `lib/` 子目录）。

**级联影响**：`i18next` 未定义 → `mock.js` 第 7 行 `i18next.init()` 抛 ReferenceError → `window.process` 未设置 → `obsidian-app.patched.js` 抛 `process is not defined` → `window.__cm6` 等全局变量不存在。

**修复**：`index.html` 中 6 处路径从 `/vendor/*.js` 改为 `/vendor/lib/*.js`。（commit `7c7329e`）

### 问题 2：全局变量命名错误

**现象**：Obsidian 运行时加载成功，但 `createEditor()` 报 `TypeError: Cannot read properties of undefined (reading 'of')`。

**根因**：`kernel.ts` 中从 `window` 读取的变量名缺少 `__` 前缀：

| 错误写法 | 正确写法 |
|---------|---------|
| `window.keymap` | `window.__cm6.keymap` |
| `window.lineNumbers` | `window.__lineNumbers` |
| `window.activeLineGutter` | `window.__activeLineGutter` |
| `window.highlightActiveLineGutter` | `window.__highlightActiveLineGutter` |
| `window.indentUnit` | `window.__indentUnit` |
| `window.indentGuide` | `window.__indentGuide` |
| `window.foldGutter` | `window.__foldGutter` |
| `window.foldExtensions` | `window.__foldExtensions` |
| `window.foldHeading` | `window.__foldHeading` |
| `window.foldIndent` | `window.__foldIndent` |
| `window.foldEffect` | `window.__foldEffect` |

Obsidian 暴露的所有 CM6 扩展都使用 `window.__` 前缀（如 `__lineNumbers`），而 CM6 核心 API 从 `window.__cm6` 读取（如 `__cm6.keymap`）。

**修复**：逐个修正 11 处变量引用。（commit `7c7329e`）

### 问题 3：MathJax 和 i18n 路径错误

**现象**：
- `obsidian-app.patched.js` 动态请求 `/lib/mathjax/tex-chtml-full.js` → 404
- `mock.js` 中 `fetch('/i18n/en.json')` → NetworkError
- 34 个 woff 字体文件 "Failed to decode downloaded font" / "OTS parsing error"

**根因**：原始项目中 MathJax 在 `public/lib/mathjax/`、i18n 在 `public/i18n/`。我将它们错误地放在了 `public/vendor/lib/mathjax/` 和 `public/vendor/i18n/` 下。woff 字体文件可能因 robocopy 参数不当导致损坏。

**修复**：
- 将 MathJax 从 `public/vendor/lib/mathjax/` 移到 `public/lib/mathjax/`
- 将 i18n 从 `public/vendor/i18n/` 移到 `public/i18n/`
- 从 `ref/` 原始项目直接重新复制所有字体文件（25 个 woff）（commit `1a19752`）

### 问题 4：编辑器无法垂直滚动

**现象**：页面内容较长时无法滚动查看下方内容。

**根因**：我在 `.view-content > .markdown-source-view` 上错误地添加了 `overflow: hidden` 和 `min-height: 0`。原始项目 CSS 中该元素没有 `overflow: hidden`——CM6 的 `.cm-scroller` 自带 `overflow-y: auto` 处理内部滚动，外层多余的限制反而剪裁了 scroller。

**修复**：移除 `.markdown-source-view` 上的 `overflow: hidden` 和 `min-height: 0`，恢复为 `flex: 1; display: flex; flex-direction: column;`（与原始项目一致）。（commit `1a19752`）

---

## 补丁汇总

| # | 文件 | 改动 | commit |
|---|------|------|--------|
| 1 | `apps/web/index.html` | vendor lib 路径补 `lib/` | `7c7329e` |
| 2 | `apps/web/package.json` | Vite ^6.0.0 → ^8.0.0 | `7c7329e` |
| 3 | `apps/web/vite.config.ts` | 添加 forwardConsole + warmup | `7c7329e` |
| 4 | `apps/web/src/App.vue` | 轮询式启动 + CSS 修复 | `7c7329e`, `1a19752` |
| 5 | `packages/core/src/kernel.ts` | 11 处变量名 `__` 前缀修正 | `7c7329e` |
| 6 | `packages/core/vendor/mock.js` | 诊断日志 + 全局错误捕获 | `7c7329e` |
| 7 | `apps/web/public/lib/mathjax/` | MathJax 移至正确路径 | `1a19752` |
| 8 | `apps/web/public/i18n/` | i18n 移至正确路径 | `1a19752` |

---

## 最终验证

- `bun install` ✅
- `bun run build`（ESM 9.62 KB + CJS 10.70 KB + types）✅
- `bun run dev`（Vite 8.0.13）✅
- vendor 脚本加载 ✅
- Obsidian 运行时初始化 ✅
- Live Preview 渲染 ✅
- 编辑器滚动 ✅
- MathJax 字体加载 ✅

---

> 验收人：AI（自动验证 + 用户浏览器确认）
