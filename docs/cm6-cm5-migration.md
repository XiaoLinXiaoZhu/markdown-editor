# CM6 npm 替换 & CM5 剔除 — 进展跟踪

> 分支：`exp/runtime-extraction`
> 启动日期：2026-05-26

## 目标

将 vendor (`obsidian-app.patched.js`, 161k 行) 中的内嵌 CM6 替换为 npm `@codemirror/*`，用 Proxy trap 定位并逐步剔除 CM5 依赖。最终大幅缩减 vendor 体积，只保留 Obsidian 自有的编辑器逻辑。

## 架构

```
┌─ 构建时 ──────────────────────────────────────────────────┐
│                                                            │
│  ref/public/vendor/obsidian-app.patched.js (原始, 6.3MB)   │
│       │                                                    │
│       ▼ externalize-cm6.ts                                 │
│  将 27 个 CM6 IIFE 替换为 window.__cm6_all 引用             │
│       │                                                    │
│       ▼                                                    │
│  obsidian-app.cm6-external.js (6.2MB)                      │
│                                                            │
├─ 运行时 ───────────────────────────────────────────────────┤
│                                                            │
│  cm6-runtime.ts                                            │
│       │                                                    │
│       ├─ import npm @codemirror/* (11 packages)            │
│       ├─ ES5/ES6 class compat wrapper                      │
│       ├─ 拷贝静态属性 (Facet.define, StateField.define...)  │
│       └─ window.__cm6_all = wrappedPkgs                    │
│                                                            │
│  cm5-trap.ts (待实现)                                      │
│       │                                                    │
│       └─ window.CodeMirror = Proxy (记录所有调用栈)         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## 已完成的步骤

### ✅ Step 1: externalize-cm6.ts 适配原始文件

原始 vendor (`ref/public/vendor/obsidian-app.patched.js`, 6.3MB) 中包含 27 个 CM6 IIFE 定义。修改 `externalize-cm6.ts`：
- 输入改为原始文件路径
- 移除 byte offset 阈值（原始文件结构不同）
- 产出 `vendor/obsidian-app.cm6-external.js` (6.2MB, -130KB)

27 个被替换的变量：
```
z → @codemirror/state.Text
ue → @codemirror/state.ChangeDesc
he → @codemirror/state.ChangeSet
ye → @codemirror/state.SelectionRange
be → @codemirror/state.EditorSelection
Ce → @codemirror/state.Facet
De → @codemirror/state.StateField
Ne → @codemirror/state.Compartment
$e → @codemirror/state.StateEffect
Qe → @codemirror/state.Transaction
ct → @codemirror/state.EditorState
mt → @codemirror/state.RangeSet
vt → @codemirror/state.RangeSetBuilder
jn → @codemirror/view.WidgetType
Gn → @codemirror/view.Decoration
qi → @codemirror/view.ViewPlugin
er → @codemirror/view.ViewUpdate
Vo → @codemirror/view.EditorView
Qc → @lezer/common.NodeProp
tu → @lezer/common.NodeType
iu → @lezer/common.NodeSet
au → @lezer/common.Tree
lu → @lezer/common.TreeBuffer
bu → @lezer/common.TreeCursor
Su → @lezer/common.NodeWeakMap
Tu → @lezer/common.Parser
Nq → @lezer/lr.LRParser
```

### ✅ Step 2: ES5/ES6 class compat wrapper

npm `@codemirror/*` 是 ES6 模块，class 必须用 `new` 调用。vendor 是 ES5 编译产物，调用 `Text(...)` 而非 `new Text(...)`。

解决方案（`cm6-test.html` 中验证通过）：
```js
function wrapClass(OriginalClass) {
  const wrapper = function(...args) {
    return new OriginalClass(...args);  // 始终用 new
  };
  // 拷贝静态属性 (Facet.define, StateField.define, etc.)
  for (const key of Object.getOwnPropertyNames(OriginalClass)) {
    if (key !== 'prototype' && key !== 'length' && key !== 'name') {
      wrapper[key] = OriginalClass[key];
    }
  }
  return wrapper;
}
```

### ✅ Step 3: 浏览器验证

`apps/web/cm6-test.html` 在真实浏览器中加载 npm CM6 + externalized vendor。
- 11 个 npm CM6 包全部加载成功（341 exports）
- vendor 初始化正常
- `window.__cm6` 导出全部 12 个 API
- Live Preview 编辑器功能正常

## 进行中

### 🔄 Step 4: cm6-runtime.ts 模块化

将 `cm6-test.html` 中的 wrapper 逻辑抽取为独立的 `cm6-runtime.ts` 模块，供正式 build 使用。

### 🔄 Step 5: 集成到正式 demo

修改 `apps/web/index.html`，使其默认使用 npm CM6 + externalized vendor。

## 待实现

### ⏳ Step 6: CM5 Proxy trap

在 vendor 加载前用 Proxy 替换 `window.CodeMirror`，记录所有对 CM5 的访问和调用。产出 `cm5-calls.log`，用于精准定位哪些模块仍在依赖 CM5。

### ⏳ Step 7: webcrack 模块分类

基于 webcrack unpack 的 179 个模块，分类为：
- CM5 依赖（→ stub 或删除）
- CM6 依赖（→ 已替换为 npm）
- Obsidian 自有（→ 保留）
- 工具库（→ 保留或替换）
- 死代码（EBML 等，→ 已删除）

### ⏳ Step 8: tree-shake vendor

根据 CM5 trap 日志和模块分类，逐步裁剪 vendor：
1. 将 CM5 模块替换为 stub（返回 Proxy trap）
2. 验证编辑器仍正常工作
3. 删除不可达代码

### ⏳ Step 9: 最终目标

vendor 体积从 161k 行缩减到 ~35k 行（仅 Obsidian 自有编辑器逻辑）。

## 文件清单

| 文件 | 用途 |
|------|------|
| `packages/core/e2e/coverage/output/cm6-var-mapping.json` | 58 个混淆变量 → npm 包映射 |
| `packages/core/vendor/obsidian-app.cm6-external.js` | CM6 外部化的 vendor |
| `apps/web/public/vendor/obsidian-app.cm6-external.js` | 同上（dev server 可访问） |
| `apps/web/cm6-test.html` | 浏览器验证页面 |
| `packages/core/e2e/coverage/instrument-vendor.ts` | 无头运行时探针（WIP） |
| `packages/core/scripts/externalize-cm6.ts` | 构建脚本（已适配原始文件） |
