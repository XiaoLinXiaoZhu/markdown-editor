# Webpack Module → npm Package Mapping

> Generated: 2026-05-20
> Source: `webcrack` 解包 `vendor/obsidian-app.patched.js`
> Module table: L53-15840 (179 modules, ~15.8K 行)
> Inner IIFE entry points: 14 unique module IDs, 17 calls (1 false positive at L51701)

---

## 架构概览

```
vendor/obsidian-app.patched.js (5.4 MB, 165K 行)
├── L1-51:       Electron/require mock (our patch)
├── L52:         (() => {  — outer IIFE
├── L53-15840:   var e = { ... }  — webpack module table (179 modules)
├── L15841:      var t = {}  — module cache
├── L15842-15852: function n(i) { ... }  — webpack require
├── L15853-15892: webpack helpers (n.n, n.d, n.g, n.o, n.r)
├── L15893:      (() => {  — inner IIFE (main code)
│   ├── CM6 core (state, view, language, etc.)
│   ├── Obsidian Live Preview engine
│   └── window.__ exports
└── })(); })();
```

Inner IIFE 中的 n() 调用（webpack require 入口点）：

| 变量名 | 调用 | 行号 | 用途 |
|--------|------|------|------|
| Vw | n(914) | L49265 | hastscript (create hast nodes) |
| zw | n.n(Vw) | L49266 | default export wrapper |
| qw | n(2854) | L49267 | unist-util-visit |
| Uw | n.n(qw) | L49268 | default export wrapper |
| _w | n(5572) | L49269 | micromark Parser |
| sk | n(773) | L49389 | hast-util-to-html |
| lk | n.n(sk) | L49390 | default export wrapper |
| ck | n(6630) | L49391 | zwitch/convert |
| uk | n.n(ck) | L49392 | default export wrapper |
| hk | n(939) | L49393 | vfile |
| dk | n.n(hk) | L49394 | default export wrapper |
| KM | n(914) | L55236 | hastscript (2nd ref) |
| YM | n(2854) | L55237 | unist-util-visit (2nd ref) |
| ZM | n(7361) | L55238 | unist-util-position |
| XM | n(1744) | L55239 | unist-util-generated |
| $M | n(6630) | L55240 | zwitch/convert (2nd ref) |
| QM | n(719) | L55241 | mdast-util-to-hast/one |
| JM | n(5426) | L55242 | mdast-util-to-hast/all |
| eE | n(6115) | L55243 | wrap (newline insertion) |
| tE | n(1696) | L55244 | footnote section builder |
| nE | n(4617) | L55245 | mdast-util-to-hast handlers |
| TK | n(8246) | L132317 | ts-ebml async (video metadata) |
| DK | n.n(TK) | L132318 | default export wrapper |

---

## Module Groups

### Group 1: base64-js + ieee754 + buffer

**npm 包**: `base64-js`, `ieee754`, `buffer`
**总大小**: ~41 KB
**替换优先级**: ★★★★★ (最安全，无依赖，精确匹配)

| Module ID | 大小 | npm 包 | 说明 |
|-----------|------|--------|------|
| 9742 | 2.1 KB | base64-js | Base64 编解码 |
| 645 | ~1 KB | ieee754 | IEEE 754 浮点数读写 |
| 8166 | 37.3 KB | buffer | Node.js Buffer polyfill (deps: 9742, 645) |

### Group 2: ts-ebml (视频元数据)

**npm 包**: `ts-ebml`, `int64-buffer`
**总大小**: ~95 KB
**替换优先级**: ★★★★☆ (完全隔离，仅用于视频 embed 元数据提取)
**入口**: n(8246) at L132317

| Module ID | 大小 | 角色 | 说明 |
|-----------|------|------|------|
| 4370 | 54.9 KB | schema | EBML element definitions |
| 1166 | 5.7 KB | int64-buffer | 64-bit integer support |
| 3210 | 11.8 KB | tools | Metadata manipulation utilities |
| 8031 | 2.8 KB | Encoder | EBML encoder |
| 190 | 5.0 KB | helper | __assign + encoding helpers |
| 2800 | 4.7 KB | Decoder | EBML decoder |
| 1381 | 11.1 KB | Reader | Stream reader |
| 1384 | ~1 KB | barrel | Main export (Decoder, Encoder, Reader, tools) |
| 4990 | ~0.1 KB | types | TypeScript type stubs |
| 8246 | 4.4 KB | async | makeMetadataSeekable (Blob manipulation) |

依赖链: 8246 → 1384 → {2800, 8031, 1381, 3210} → {4370, 1166, 190} → {8166, 7187}

### Group 3: events

**npm 包**: `events`
**总大小**: 8.8 KB
**替换优先级**: ★★★★☆ (无依赖，标准 polyfill)

| Module ID | 大小 | 说明 |
|-----------|------|------|
| 7187 | 8.8 KB | Node.js EventEmitter polyfill |

### Group 4: character-entities

**npm 包**: `character-entities`, `character-entities-legacy`, `character-entities-html4`, `character-reference-invalid`
**总大小**: ~40 KB
**替换优先级**: ★★★★☆ (纯数据模块，无逻辑)

| Module ID | 大小 | npm 包 | 说明 |
|-----------|------|--------|------|
| 3407 | 33.9 KB | character-entities | Full HTML entity map |
| 5848 | 3.4 KB | character-entities-legacy | HTML4 subset (nbsp, copy, etc.) |
| 6588 | ~3 KB | character-entities-html4 | HTML4 named entities |
| 6852 | ~1 KB | character-reference-invalid | Windows-1252 → Unicode |

### Group 5: property-information

**npm 包**: `property-information`
**总大小**: ~25 KB
**替换优先级**: ★★★☆☆

| Module ID | 大小 | 角色 |
|-----------|------|------|
| 7000 | ~0.3 KB | types (boolean, number, spaceSeparated, etc.) |
| 7596 | ~1.5 KB | create (schema builder) |
| 8740 | ~0.5 KB | case-sensitive-transform |
| 6632 | ~0.1 KB | normalize |
| 9607 | ~0.5 KB | schema class |
| 8805 | ~0.5 KB | defined-info class |
| 7529 | ~0.3 KB | Object.assign merge |
| 9940 | ~0.5 KB | merge utility |
| 5789 | 13.2 KB | SVG properties |
| 1805 | 5.7 KB | HTML properties |
| 855 | ~0.2 KB | case-insensitive-transform |
| 7247 | ~0.3 KB | HTML combined (html space) |
| 1218 | ~0.3 KB | SVG combined (svg space) |

### Group 6: micromark (Markdown parser)

**npm 包**: `micromark` + utilities
**总大小**: ~30 KB (estimated)
**替换优先级**: ★★☆☆☆ (34 sub-deps, 复杂依赖图)
**入口**: n(5572) at L49269

| Module ID | 大小 | 角色 |
|-----------|------|------|
| 4186 | 2.6 KB | micromark main parse function |
| 5572 | 0.1 KB | exports { Parser: micromark } |
| 7647 | 0.4 KB | xtend (object merge) |
| 7678 | 0.2 KB | state toggle utility |
| 7225 | 0.1 KB | whitespace character check |
| 4787 | ~0.5 KB | location utility (line/column) |
| 7751 | ~0.3 KB | chunked splice |
| 633 | ~0.2 KB | bracket index finder |
| 91 | ~0.3 KB | character counter |
| ... | ... | ~25 more tokenizer/content modules |

### Group 7: unist utilities

**npm 包**: `unist-util-visit`, `unist-util-visit-parents`, `unist-util-is`, `unist-util-generated`, `unist-util-position`, `unist-util-stringify-position`
**总大小**: ~5 KB
**替换优先级**: ★★★☆☆

| Module ID | 大小 | npm 包 |
|-----------|------|--------|
| 9294 | ~1 KB | unist-util-visit-parents |
| 2854 | 0.4 KB | unist-util-visit |
| 8145 | ~0.3 KB | unist-util-is |
| 6750 | ~0.05 KB | stringify-position helper |
| 1744 | 0.2 KB | unist-util-generated |
| 7361 | 0.4 KB | unist-util-position |
| 6630 | 0.6 KB | zwitch (function dispatch) |

### Group 8: mdast-util-to-hast

**npm 包**: `mdast-util-to-hast`, `hastscript`
**总大小**: ~15 KB
**替换优先级**: ★★☆☆☆ (多个 handler sub-modules)
**入口**: n(914), n(719), n(5426), n(4617), n(1696), n(6115)

| Module ID | 大小 | 角色 |
|-----------|------|------|
| 914 | 0.3 KB | hastscript h() — create hast nodes |
| 719 | 0.8 KB | one() — traverse single node |
| 5426 | 0.5 KB | all() — traverse children |
| 4617 | 0.8 KB | handlers map (requires all individual handlers) |
| 1696 | 1.2 KB | footnote section builder |
| 6115 | 0.3 KB | wrap() — newline insertion |

Individual handlers (required by 4617):
| Module ID | Handler |
|-----------|---------|
| 4590 | blockquote |
| 3562 | break |
| 7891 | code |
| 9381 | delete (strikethrough) |
| 790 | emphasis |
| 8235 | footnoteReference |
| 5758 | footnote |
| 4890 | heading |
| 2202 | html |
| 1454 | imageReference |
| 5037 | image |
| ... | (more handlers) |

### Group 9: hast-util-to-html

**npm 包**: `hast-util-to-html`
**总大小**: ~10 KB
**替换优先级**: ★★☆☆☆
**入口**: n(773) at L49389

| Module ID | 大小 | 角色 |
|-----------|------|------|
| 5204 | ~3 KB | Main serializer |
| 773 | 0.03 KB | Re-export of 5204 |

### Group 10: vfile

**npm 包**: `vfile`, `vfile-message`
**总大小**: ~8 KB
**替换优先级**: ★★★☆☆
**入口**: n(939) at L49393

| Module ID | 大小 | 角色 |
|-----------|------|------|
| 5905 | ~2 KB | vfile (message, info methods) |
| 939 | 0.03 KB | Re-export of 5905 |
| 734 | ~1.5 KB | vfile-message |
| 5442 | 2.9 KB | VFile constructor |
| 5432 | ~0.5 KB | unist-util-stringify-position |
| 8064 | 4.3 KB | path utilities (resolve, join, etc.) |
| 4228 | 0.03 KB | process.cwd() stub |
| 8738 | ~0.3 KB | is-buffer check |

---

## 替换策略

### Phase 1: 安全替换（无风险）

目标: base64-js, ieee754, events, character-entities 系列
方法: 安装 npm 包 → 用 Vite/bundler 外部化 → 修改 module table entry

```js
// 替换前 (module table 中)
9742: (e, t) => { /* 2.1 KB base64-js 实现 */ }

// 替换后
9742: (e, t) => { Object.assign(t, window.__vendorModules.base64js); }
```

需要一个 vendor-modules.js 预加载脚本，通过 Vite 构建 npm 包并暴露到 window。

### Phase 2: ts-ebml 整体替换

目标: 整个 EBML 组（~95 KB）
方法: `npm install ts-ebml` → 构建为独立 bundle → 替换 module 8246 入口

收益最大：移除 10 个模块 + buffer polyfill + events（如果仅被 EBML 使用）。

### Phase 3: micromark + mdast/hast 生态

目标: 完整的 markdown→HTML pipeline
方法: 逐步替换，每次一个包，测试验证
风险: 版本不匹配可能导致行为差异（Obsidian 可能使用了修改版）

---

## 验证方法

每次替换后运行：
```bash
cd packages/core && bun test e2e/
```

全部 E2E 测试通过即为成功。

---

## 注意事项

1. **n(60) 是假阳性** — L51701 的 `n(60)` 是局部函数调用（秒数计算），不是 webpack require
2. **所有 179 模块都被传递依赖** — 无法通过静态分析移除任何模块
3. **module table 中有 295 个跨模块 n() 调用** — 模块间相互引用密集
4. **n() 有缓存机制** — 多次调用同一 ID 返回相同对象，替换时需保持此语义
5. **n.n() 包装 default export** — 部分模块通过 n.n() 获取 .default
