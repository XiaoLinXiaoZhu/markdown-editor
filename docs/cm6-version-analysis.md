# CM6 版本分析

> 日期: 2025-05-20
> 基于 obsidian-app.patched.js (Obsidian API 1.7.6) 的逆向分析

## 内嵌 CM6 包清单

vendor 文件为 webpack bundle，入口点（L14412+）直接包含以下 CM6 包的完整实现代码：

| 包名 | vendor 中 export 数 | 估算版本范围 | 备注 |
|------|-------------------|------------|------|
| @codemirror/state | 29 | 6.4.0 – 6.6.0 | 精确匹配 npm 6.6.0 |
| @codemirror/view | 44 | 6.22.0 – 6.22.3 | 有 findFromDOM/scrollSnapshot, 无 clipboardInputFilter |
| @codemirror/language | 58 | ~6.9.x (自定义) | 含4个Obsidian私有export |
| @codemirror/commands | 100 | 6.3.x – 6.5.x | |
| @codemirror/autocomplete | 30 | 6.11.0+ | 精确匹配 npm 6.20.2 |
| @codemirror/search | 19 | 6.4.0+ | 精确匹配 npm 6.7.0 |
| @codemirror/lint | 12 | 6.3.0+ | 精确匹配 npm 6.9.6 |
| @codemirror/collab | 6 | any | 精确匹配 npm 6.1.1 |
| @lezer/common | 13 | 1.1.0+ | 精确匹配 npm 1.5.2 |
| @lezer/highlight | 7 | 1.1.0+ | npm 1.2.3 多1个export (additive) |
| @lezer/lr | 6 | 1.3.0+ | 精确匹配 npm 1.4.10 |

## 与最新 npm 版本的兼容性

**结论：最新版 CM6 完全向后兼容。**

所有 vendor 中存在的 export 在最新 npm 版本中均保留，无一移除。新版只是增加了额外 export。

唯一例外：`@codemirror/language` 中 4 个 vendor 特有 export：
- `ignoreSpellcheckToken` — Obsidian 自定义
- `lineClassNodeProp` — 在 npm 6.10.0 中移除
- `lineHighlighter` — Obsidian 自定义
- `tokenClassNodeProp` — 在 npm 6.10.0 中移除

这些是 Obsidian 对 @codemirror/language 的 fork 添加，替换时需保留在 vendor 中。

## Bundle 结构分析

```
L1-43:       electron/require mock (我们的 patch)
L44:         IIFE 开始
L45-14379:   webpack 模块（base64-js, buffer, binary-parser, hast-util, events 等）
L14380-14411: webpack runtime
L14412-14908: export 声明块（CM6 各包 + Obsidian API 导出）
L14909-~34000: CM6 实现代码
  L15722:    Text (变量 z)
  L17000:    EditorSelection (变量 be)
  L17142:    Facet (变量 Ce)
  L17984:    EditorState (变量 ct)
  L20833:    Decoration (变量 Gn)
  L21686:    ViewPlugin (变量 qi)
  L26701:    EditorView (变量 Vo)
  L27663:    keymap (变量 Ko)
  L33253:    NodeProp (变量 Qc)
  L33312:    NodeType (变量 tu)
  L33404:    NodeSet (变量 iu)
  L33440:    Tree (变量 au)
~34000-174097: Obsidian 代码 + @lezer/lr (L108312) + markdown grammar
```

## window.__cm6 映射表

```javascript
window.__cm6 = {
  EditorView: Vo,      // @codemirror/view
  EditorState: ct,     // @codemirror/state
  ViewPlugin: qi,      // @codemirror/view
  Decoration: Gn,      // @codemirror/view
  WidgetType: jn,      // @codemirror/view
  syntaxTree: Ch,      // @codemirror/language
  Prec: Fe,            // @codemirror/state
  keymap: Ko,          // @codemirror/view
  StateField: De,      // @codemirror/state
  StateEffect: $e,     // @codemirror/state
  Compartment: Ne,     // @codemirror/state
  Transaction: Qe,     // @codemirror/state
};
```

## 变量名-导出名完整映射

### @codemirror/state (变量 e)
| Export | 变量名 |
|--------|--------|
| Annotation | Ye |
| AnnotationType | Ze |
| ChangeDesc | ue |
| ChangeSet | he |
| CharCategory | at |
| Compartment | Ne |
| EditorSelection | be |
| EditorState | ct |
| Facet | Ce |
| Line | Y |
| MapMode | ce |
| Prec | Fe |
| Range | dt |
| RangeSet | mt |
| RangeSetBuilder | vt |
| RangeValue | ht |
| SelectionRange | ye |
| StateEffect | $e |
| StateEffectType | Xe |
| StateField | De |
| Text | z |
| Transaction | Qe |
| codePointAt | oe |
| codePointSize | se |
| combineConfig | ut |
| countColumn | Tt |
| findClusterBreak | ee |
| findColumn | Dt |
| fromCodePoint | ae |

### @codemirror/view (变量 t)
| Export | 变量名 |
|--------|--------|
| EditorView | Vo |
| ViewPlugin | qi |
| ViewUpdate | er |
| Decoration | Gn |
| WidgetType | jn |
| keymap | Ko |
| (+ 38 others) | (见 L14447-14494) |

### @lezer/common (变量 i)
| Export | 变量名 |
|--------|--------|
| NodeProp | Qc |
| NodeType | tu |
| NodeSet | iu |
| Tree | au |
| TreeBuffer | lu |
| TreeCursor | bu |
| TreeFragment | xu |
| Parser | Tu |
| parseMixed | Au |
| (+ 4 others) | (见 L14496-14511) |

### @lezer/highlight (变量 r)
| Export | 变量名 |
|--------|--------|
| Tag | Uu |
| tags | fh |
| styleTags | Wu |
| tagHighlighter | Yu |
| classHighlighter | mh |
| highlightTree | Zu |
| getStyleTags | $u |

### @lezer/lr (变量 h)
| Export | 变量名 |
|--------|--------|
| LRParser | Nq |
| ExternalTokenizer | Mq |
| InputStream | wq |
| ContextTracker | Bq |
| LocalTokenGroup | Cq |
| Stack | pq |

## Obsidian 兼容层

vendor 在 L127372-127399 定义了两个映射对象，用于 Obsidian 插件系统的 `require()` 拦截：

```javascript
var jW = {  // 当前包名
  "obsidian": d,
  "@codemirror/autocomplete": l,
  "@codemirror/collab": c,
  "@codemirror/commands": a,
  "@codemirror/language": o,
  "@codemirror/lint": u,
  "@codemirror/search": s,
  "@codemirror/state": e,
  "@codemirror/text": e,          // alias → state
  "@codemirror/view": t,
  "@lezer/common": i,
  "@lezer/lr": h,
  "@lezer/highlight": r,
};

var WW = {  // 旧包名 → 新实现
  "@codemirror/closebrackets": l,  // → autocomplete
  "@codemirror/comment": a,        // → commands
  "@codemirror/fold": o,           // → language
  "@codemirror/gutter": t,         // → view
  "@codemirror/highlight": o,      // → language
  "@codemirror/history": a,        // → commands
  "@codemirror/matchbrackets": o,  // → language
  "@codemirror/panel": t,          // → view
  "@codemirror/rangeset": e,       // → state
  "@codemirror/rectangular-selection": t, // → view
  "@codemirror/stream-parser": o,  // → language
  "@codemirror/tooltip": t,        // → view
};
```

## CM6 外部化策略

### 关键发现：代码非连续分布

CM6 代码在 vendor 中**不是一个连续区域**，而是散布在整个文件中：

```
L14909-18000: @codemirror/state
L18000-28000: @codemirror/view  
L33000-35000: @lezer/common
L35000-35800: @lezer/highlight
L35800-38000: @codemirror/language
L38000-44000: @codemirror/commands + history + search
      ... Obsidian 代码 ...
L103522+:    @codemirror/autocomplete
      ... Obsidian 代码 ...
L108312+:    @lezer/lr
      ... Obsidian 代码 ...
```

原因：webpack 按 import graph 顺序拼接模块。后导入的包（autocomplete, lr）出现在 Obsidian 代码之后。

### 挑战

1. **不能简单切除一个连续区域**——CM6 代码与 Obsidian 代码交错
2. **Obsidian 代码通过闭包变量直接引用 CM6**——如 `Vo`(EditorView), `ct`(EditorState)
3. **内部 helper 函数未导出但可能被 Obsidian 代码使用**

### 可行路径

#### 路径 A：基于 stripped.js 的精确替换（推荐）

1. 使用 stripped.js（1.9MB，已验证可运行）作为工作基础
2. 逐个识别 CM6 函数/类定义（通过签名匹配 npm 源码）
3. 将每个实现替换为从 npm 包导入的等价物
4. 保留变量名赋值（`var Vo = externalCM6.EditorView`）

#### 路径 B：构建桥接层

1. 从 npm 构建完整 CM6 bundle（cm6-runtime.js），暴露所有 export 到 window
2. 修改 vendor：删除各处的 CM6 实现代码
3. 在原位插入 `var Vo = window.__cm6_npm.EditorView` 式赋值
4. 需要完整的变量名映射表（本文档已提供部分）

#### 路径 C：webpack externals 模拟

1. 在 vendor IIFE 开头注入代码，从 `window.__cm6_modules` 获取预构建的 CM6
2. 修改 webpack runtime 的 module resolution 逻辑
3. 让内部的 `n(moduleId)` 调用返回外部提供的包

### 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 内部 helper 未导出但被使用 | 替换后运行时错误 | 逐步替换+测试验证 |
| @codemirror/language 4个自定义export | 类型不匹配 | 保留在 vendor 中 |
| Facet/StateField 实例引用 | "多实例"错误 | 确保全局只有一份 CM6 |

## Webpack 模块替换（低风险）

可独立替换的 webpack 模块：

| Module ID | 库 | 行范围 | 大小 | 消费者 |
|-----------|---|--------|------|--------|
| 9742 | base64-js | L46-142 | 96行 | n(9742) at L10514 |
| 8031 | buffer (小shim) | L6919-7019 | 100行 | n(8031) at L9654, L9886 |
| 5204 | hast-util-to-html | L3452-3506 | 54行 | n(5204) at L3242 |
| 8166 | buffer (完整polyfill) | L10512-11942 | 1430行 | 通过 base64-js |

这些模块通过 webpack `n(moduleId)` 调用引用，可以安全地用 npm 等版本替换模块体。

## 正确的渐进替换路径（已验证）

### 核心发现

**部分 CM6 外部化不可行**：仅替换类定义会导致 Facet 身份冲突（vendor 内部 Facet 与 npm Facet 是不同对象）。

**正确方法**：通过 `window.__cm6_packages` 使用 vendor 自身的 CM6 实例编写替换代码。已验证此方法可行（51 测试通过）。

### 已实现

vendor 已 patch 暴露：
```javascript
window.__cm6_packages = {
  "@codemirror/state": e,   // 29 exports
  "@codemirror/view": t,    // 45 exports  
  "@lezer/common": i,       // 13 exports
  "@lezer/highlight": r,    // 7 exports
  "@codemirror/language": o, // 58 exports
  "@codemirror/commands": a, // 100 exports
  "@codemirror/search": s,   // 19 exports
  "@codemirror/autocomplete": l, // 30 exports
  "@codemirror/collab": c,   // 6 exports
  "@codemirror/lint": u,     // 12 exports
  "@lezer/lr": h,           // 6 exports
};
// 总计 325 个函数/类可直接使用
```

### Vendor 全局的真实映射

| Vendor 全局 | 实际是 | __cm6_packages 路径 | 可替换? |
|------------|-------|-------------------|---------|
| `__lineNumbers` | gutters | `view.gutters` | ✓ |
| `__highlightActiveLineGutter` | lineNumbers | `view.lineNumbers` | ✓ |
| `__indentUnit` | indentUnit | `lang.indentUnit` | ✓ |
| `__foldGutter` | codeFolding | `lang.codeFolding` | ✓ |
| `__commands.newlineAndIndent` | insertNewlineAndIndent | `cmds.insertNewlineAndIndent` | ✓ |
| `__activeLineGutter` | 自定义扩展实例 | — | ✗ (Obsidian) |
| `__commands.indentMore` | 自定义命令 | — | ✗ (Obsidian) |
| `__commands.indentLess` | 自定义命令 | — | ✗ (Obsidian) |
| `__kH` | Live Preview 引擎 | — | ✗ (最终重写) |
| `__language` | Markdown parser | — | ✗ (最终重写) |
| `__stateFields` | 编辑器状态 | — | ✗ (最终重写) |
| `__closeBrackets` | 自动配对 | — | ✗ (最终重写) |

### 下一步

1. **修改 kernel.ts**：将 5 个可替换全局改为从 `__cm6_packages` 读取
2. **从 vendor 中移除对应的 `window.__X = ...` 赋值**
3. **开始用 `__cm6_packages` 编写 `__kH` 替代实现**：这是关键路径
