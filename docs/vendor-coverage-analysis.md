# Vendor 动态覆盖率分析报告

> 生成日期：2026-05-20
> 方法：V8 Coverage + Puppeteer，运行全部 E2E 场景期间收集

---

## 核心发现

| 指标 | 数值 |
|------|------|
| 总行数 | 174,097 |
| 活跃行数 | 60,023 (34.5%) |
| 死代码行数 | 114,074 (65.5%) |
| 总函数数 | 9,783 |
| 活跃函数 | 2,580 (26.4%) |
| 死函数 | 6,571 (67.2%) |
| 大型死代码块（≥50行）| 503 个 |

**结论：我们只使用了 vendor 的约 1/3 代码。**

---

## 死代码来源分析

最大的死函数（从不执行）揭示了 Obsidian 完整 app 中我们不需要的功能：

| 行范围 | 行数 | 函数名 | 推测功能 |
|--------|------|--------|----------|
| 172088-173484 | 1396 | registerCommands | 命令面板注册 |
| 123931-125314 | 1383 | (constructor) | 未知大型类 |
| 168099-169041 | 942 | display | 设置面板 UI |
| 164141-164956 | 815 | _sync | 同步功能 |
| 161105-161712 | 607 | onOpen | 模态框打开 |
| 142837-143324 | 487 | generateHDImage | 图片生成 |
| 94008-94595 | 587 | onContextMenu | 右键菜单 |
| 131536-131875 | 339 | buildMenu | 菜单构建 |
| 116107-116456 | 349 | initGraphics | Canvas 图形 |
| 125864-126200 | 336 | onDragLeaf | 工作区拖拽 |

---

## 活跃代码热路径

调用频次最高的函数（核心循环）：

| 调用次数 | 行范围 | 函数名 | 推测用途 |
|----------|--------|--------|----------|
| 117,184 | 15862-15869 | lineInner | CM6 文档行访问 |
| 78,361 | 18875-18883 | compare | RangeSet 比较 |
| 56,229 | 18793-18795 | get | RangeSet getter |
| 52,284 | 18939-18953 | wt | Range 操作 |
| 49,226 | 18837-18839 | forward | RangeCursor 前进 |
| 49,132 | 34324-34363 | sibling | Lezer 树兄弟遍历 |
| 49,132 | 33534-33564 | iterate | Lezer 树迭代 |
| 24,112 | 19850-19863 | findPos | 位置查找 |
| 18,208 | 19015-19069 | next | 迭代器推进 |
| 16,337 | 34269-34289 | enterChild | Lezer 树进入子节点 |

**结论：热路径全部是 CM6 核心 + Lezer 语法树操作。**

---

## 活跃子系统清单

通过 `window.__X` 全局变量暴露的模块（kernel.ts 消费者）：

### 核心（不可简单替换）

| 全局变量 | 类型 | 作用 | 替换难度 |
|----------|------|------|----------|
| `__cm6` | object | CM6 公共 API 集合 | 标准库，无需替换 |
| `__language` | Language | Markdown 语言定义 + Lezer parser | 高（需 @lezer/markdown 扩展） |
| `__kH` | function | Live Preview 扩展工厂 | 最高（核心渲染逻辑） |
| `__baseExtensions` | array[19] | 基础扩展集合 | 中（需逐个理解） |
| `__stateFields` | object | editor/owner/livePreview 状态字段 | 中 |
| `__closeBrackets` | object | 自动配对完整系统 | 中 |

### 可独立替换（B1/B2 模块）

| 全局变量 | 类型 | 作用 | 替换难度 |
|----------|------|------|----------|
| `__lineNumbers` | function | 行号显示 | 低 |
| `__activeLineGutter` | extension | 活跃行 gutter 高亮 | 低 |
| `__highlightActiveLineGutter` | function | 活跃行内容高亮 | 低 |
| `__indentUnit` | Facet | 缩进单位配置 | 低 |
| `__indentGuide` | ViewPlugin | 缩进指引线 | 低 |
| `__hangingIndent` | ViewPlugin | 列表悬挂缩进 | 中 |
| `__commands` | object | indentMore/Less/newlineAndIndent | 低 |
| `__foldGutter` | function | 折叠 gutter | 中 |
| `__foldHeading` | extension | 标题折叠 | 中 |
| `__foldIndent` | extension | 缩进折叠 | 中 |
| `__listRegex` | RegExp | 列表匹配正则 | 最低（已在 kernel.ts 中使用） |

### 不需要（kernel.ts 未使用或仅 mock 用）

| 全局变量 | 说明 |
|----------|------|
| `__obsidian` | Obsidian API mock，仅 registerSuggest 间接用 |
| `__fields` | searchHighlight，当前未启用 |
| `__mH` | 未知，kernel.ts 未引用 |
| `__stateEffects` | updateField，当前未直接使用 |

---

## 替换优先级建议（修订版）

基于覆盖率数据，修订 B1 替换顺序：

### 第一批（最低风险，最少依赖）

1. **`__listRegex`** — 已在 kernel.ts 内联使用，只是一个正则表达式
2. **`__commands`** — indentMore/Less 是标准 CM6 命令
3. **`__indentUnit`** — 标准 CM6 Facet
4. **`__lineNumbers` + `__activeLineGutter` + `__highlightActiveLineGutter`** — 标准 gutter API

### 第二批（需观察 DOM 输出）

5. **`__indentGuide`** — ViewPlugin，需匹配 DOM class 名
6. **`__hangingIndent`** — ViewPlugin，需匹配缩进对齐逻辑
7. **`__foldGutter` + `__foldHeading` + `__foldIndent`** — 折叠系统

### 第三批（高耦合，需深入逆向）

8. **`__closeBrackets`** — 4 个组件组成的完整系统
9. **`__baseExtensions`** — 19 个扩展的集合，需逐个理解
10. **`__stateFields`** — editor/owner 是 mock 系统的核心

### 最后（核心替换）

11. **`__language`** — Markdown Lezer 语法
12. **`__kH`** — Live Preview 渲染引擎

---

## 后续行动

1. ~~收集覆盖率~~ ✅
2. 提取 `__listRegex` 的实际正则表达式值 → 写入 engine
3. 用 `@codemirror/commands` 替换 `__commands`
4. 用 `@codemirror/view` 的 `lineNumbers()` 替换 `__lineNumbers`
5. 每次替换后运行全部 E2E 测试验证等价性
