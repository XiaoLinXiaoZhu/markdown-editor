# Vendor 模块拆解分析报告

> 日期: 2026-05-20
> 工具: `packages/core/e2e/coverage/module-split.ts`
> 输入: `obsidian-app.deobfuscated.js` (43,664 行 / 1.57 MB)

---

## 工具产出

| 产物 | 路径 | 说明 |
|------|------|------|
| 依赖图 | `output/dependency-graph.json` | 2944 个声明的引用关系 |
| 清理版 | `output/obsidian-app.cleaned.js` | 40,915 行（移除死空声明 -2761 行）|
| 模块文件 | `output/modules/*.js` | 22 个模块，可重新拼接为原始文件 |

---

## 模块结构总览

```
Module                    | Decls | Empty | Active | Imports | Exports | Type
─────────────────────────────────────────────────────────────────────────────
00-mocks                  |     0 |     0 |      0 |       0 |       0 | infra
01-webpack-modules        |     0 |     0 |      0 |       0 |       0 | infra
02-webpack-runtime        |     0 |     0 |      0 |       0 |       0 | infra
03-exports                |    12 |     0 |     12 |       0 |      12 | infra
04-ts-helpers             |     7 |     2 |      5 |       0 |       7 | infra
─── CM6 平台层 ────────────────────────────────────────────────────────────
05-cm6-state              |    96 |    12 |     84 |      11 |      30 | CM6
06-cm6-rangeset           |    23 |     1 |     22 |       9 |       8 | CM6
07-cm6-view-dom           |   112 |     9 |    103 |      25 |      51 | CM6
08-cm6-view-core          |    90 |    25 |     65 |      66 |      16 | CM6
09-cm6-view-ext           |   232 |    64 |    168 |      38 |      47 | CM6
10-lezer-common           |    69 |    18 |     51 |       8 |      13 | CM6
11-cm6-language           |   167 |    61 |    106 |      61 |      25 | CM6
12-cm6-commands           |   381 |   144 |    237 |      41 |      68 | CM6
13-cm6-search             |   111 |    46 |     65 |      21 |       0 | CM6
20-lezer-lr               |    52 |    21 |     31 |      14 |       0 | CM6
─── Obsidian 应用层 ───────────────────────────────────────────────────────
14-obsidian-ui            |    79 |    35 |     44 |      16 |      12 | Obsidian
15-obsidian-vault         |   236 |    43 |    193 |      66 |      22 | Obsidian
16-obsidian-editor        |   284 |    99 |    185 |      27 |      27 | Obsidian
17-obsidian-widgets       |   184 |    31 |    153 |     104 |      32 | Obsidian
18-live-preview           |     7 |     0 |      7 |      54 |       0 | Obsidian
19-obsidian-complete      |   151 |    60 |     91 |      23 |       7 | Obsidian
21-obsidian-app           |   651 |   119 |    532 |      70 |       0 | Obsidian
```

### 关键数据

- **CM6 平台层**: 1333 声明 (400 empty, 933 active), ~17500 行 → 可由 npm 包替代
- **Obsidian 应用层**: 1592 声明 (387 empty, 1205 active), ~15700 行 → 需理解/重写
- **基础设施**: 19 声明, ~10500 行（webpack 模块占 9900 行，多为空）

---

## 核心架构发现

### 三层依赖关系

```
┌─────────────────────────────────────────────┐
│ Layer 3: Live Preview (module 18)           │
│   mH (orchestrator, 400 行)                 │
│   kH (factory, 35 行)                       │
│   54 imports, 0 exports                     │
├─────────────────────────────────────────────┤
│ Layer 2: Widgets (module 17)                │
│   22 WidgetType 子类 + helpers              │
│   $F (Table, 135 行), $R+ (各类 widget)     │
│   104 imports, 32 exports                   │
├─────────────────────────────────────────────┤
│ Layer 1: CM6 Platform (modules 05-13, 20)   │
│   EditorView, StateField, Decoration, etc.  │
│   ~17500 行, 可由 npm 替代                   │
└─────────────────────────────────────────────┘
```

### Live Preview (module 18) 的精确依赖

| 来源 | 数量 | 具体内容 |
|------|------|----------|
| CM6 state | 3 | De (StateField), Fe (Prec), w |
| CM6 view DOM | 3 | Gn (Decoration), qi (ViewPlugin), on |
| CM6 view core | 2 | Vo (EditorView), to |
| CM6 view ext | 4 | Pl, Tc, Ko (keymap), Xl |
| CM6 language | 5 | Ch (syntaxTree), Mh, fp, mp, of |
| CM6 commands | 13 | Af, If, Jw, Lf, Pf, Qw, Uf, Vf, ak, cm, ek, tw, zf |
| Obsidian widgets | 22 | $F, $R, ER, HR, KR, UR, VR, YR, aH, cH, hH, iH, jR, lH, nH, oH, qR, rH, sH, pH, fH, QF |
| Obsidian UI | 1 | YE |
| Obsidian vault | 1 | JT |
| **总计** | **54** | |

### 关键 CM6 commands 依赖解读

这 13 个来自 module 12 的引用并非标准 CM6 commands，而是 **Obsidian 自定义的编辑器工具函数**（恰好定义在该行范围内）：

| 变量 | 推测功能 |
|------|----------|
| If | 搜索高亮 StateField |
| Pf | 高亮类型注册表 |
| Vf | 选区范围检测 |
| zf | 搜索高亮范围检测 |
| Af | Live Preview StateEffect |
| Lf | 链接/embed 解析 |
| ak | 链接文本解析 |
| Uf | Live Preview 范围合并 |

---

## 叶子模块（0 exports，无下游依赖）

| 模块 | 说明 | 可安全移除? |
|------|------|------------|
| 13-cm6-search | CM6 搜索功能 | 可能（如果不用搜索） |
| 18-live-preview | Live Preview 核心 | 不能（这是目标） |
| 20-lezer-lr | Lezer LR parser | 需要（语法解析基础） |
| 21-obsidian-app | App 启动逻辑 | 大部分可移除 |

---

## 边界质量验证

通过分析边界两侧 ±50 行内声明的交叉引用密度验证拆分合理性：

```
Boundary  | From → To                           | Fwd | Bwd | Quality
──────────────────────────────────────────────────────────────────────
L12701    | cm6-state → cm6-rangeset            |   0 |   0 | ✅ clean
L13401    | cm6-rangeset → cm6-view-dom         |   1 |   7 | 🟡 ok
L15901    | cm6-view-dom → cm6-view-core        |   1 |   3 | ✅ clean
L18301    | cm6-view-core → cm6-view-ext        |   0 |   0 | ✅ clean
L20601    | cm6-view-ext → lezer-common         |   2 |   0 | ✅ clean
L21801    | lezer-common → cm6-language         |   0 |   0 | ✅ clean
L23501    | cm6-language → cm6-commands         |   0 |  11 | 🟡 ok
L25501    | cm6-commands → cm6-search           |   0 |  10 | 🟡 ok
L26201    | cm6-search → obsidian-ui            |   0 |   2 | ✅ clean
L29001    | obsidian-ui → obsidian-vault        |   2 |   3 | 🟡 ok
L31501    | obsidian-vault → obsidian-editor    |   0 |   3 | ✅ clean
L34001    | obsidian-editor → obsidian-widgets  |   0 |  11 | 🟡 ok
L36632    | obsidian-widgets → live-preview     |   0 |  44 | 🔴 expected
L37175    | live-preview → obsidian-complete    |   0 |   8 | 🟡 ok
L38101    | obsidian-complete → lezer-lr        |   0 |   7 | 🟡 ok
L38401    | lezer-lr → obsidian-app             |   0 |   2 | ✅ clean
```

17→18 的高耦合是预期的（Live Preview 大量消费 Widget 类），不是拆分缺陷。

---

## 替换路径（修订）

基于模块拆解的新认知，替换路径更清晰：

### Phase A: 减脂（低风险，立即可做）

1. **删除 module 21 (obsidian-app, 651 decls)**：App 启动逻辑，0 exports，没有其他模块依赖它。验证方式：删除后跑测试。
2. **删除 module 13 (cm6-search, 111 decls)**：0 exports。如果测试通过就不需要。
3. **清理 module 01 (webpack-modules)**：9900 行空模块定义，可缩减。
4. **使用 stripped 版本**：已验证可运行，-71% 体积。

### Phase B: Widget 替换（中等风险）

模块 17 的 22 个 widget 是 Live Preview 的"渲染原语"。逐个替换：
1. 每个 widget 是独立的 WidgetType 子类
2. 通过 `__cm6_packages` 获取 WidgetType 基类
3. 用 compare.test.ts 验证 DOM 输出一致
4. 替换顺序：简单的先（bullet widget, checkbox widget），复杂的后（$F/Table, embed）

### Phase C: 替换 mH/kH

当所有 widget 都是开源版本后，mH/kH 的 400 行逻辑就是最后的目标。此时：
- 其依赖已全部明确（54 个 import，其中 22 个是已替换的 widget）
- 核心逻辑是"遍历语法树，决定哪些节点隐藏/替换/加 widget"
- 可参考逆向分析文档 `docs/kH-live-preview-architecture.md`

### Phase D: CM6 外部化

当 Obsidian 层完全开源后，CM6 平台层（modules 05-13）可以由 npm 包提供。

---

## 验证

工具输出的 22 个模块文件可以无损拼接回原始文件（已验证）。这意味着：
- 模块边界切割没有丢失任何代码
- 可以对单个模块进行修改/替换后重新拼接，运行测试验证
