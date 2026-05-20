# 负向决策记录：从零重写策略

> 日期：2026-05-20
> 状态：已否决
> 归档标签：N/A（策略转向，未创建独立分支）

---

## 尝试了什么

制定了一个三层递进的逆向工程 + 重写方案：

1. **动态分析**：通过 Puppeteer 覆盖率采集找到 vendor（174,096 行）中实际执行的 ~35,000 行代码
2. **AST 程序切片**：从 28 个 `window.__*` 窄接口出发，通过 AST 依赖分析提取 Obsidian 编辑器的依赖闭包
3. **模块化拆分 + 重实现**：将提取出的代码按功能拆分为 18 个独立模块，用一个 CM6 开源实现逐一替换

该方案记录在 `docs/archived/reverse-engineering-plan.md`（三层递进方案）和 `docs/archived/incremental-replacement-plan.md`（测试驱动的逐模块替换方案）中。

## 预期

- 通过动态覆盖率将分析范围从 174K 行缩小到 ~35K 行
- 通过 AST 切片再从 35K 行缩小到 ~5K 行（仅 Obsidian 自有逻辑）
- 最终产出 18 个纯开源 CM6 模块
- 整个过程由 parity 测试（38 场景 E2E + fuzz）保证行为等价

## 实际发生了什么

在投入实施前，发现了两个致命的障碍：

1. **`__language` 和 `__kH` 不可分割**：Live Preview 渲染引擎（`__kH`）依赖语法树节点类型名称来做渲染决策。如果替换 Markdown parser（`__language`），节点类型名称会改变，导致渲染逻辑全部失效。两者必须同时替换——无法渐进。

2. **CM6 Facet 共享问题**：CM6 的 Facet 实例按 JavaScript 引用比较。如果使用独立 bundle 的 `@codemirror/*` npm 包，Facet 实例与 vendor 内嵌的实例不是同一 JavaScript 对象，导致 Facet 不匹配。这意味着无法单独替换一个 CM6 模块——要么全换，要么全不换。

## 为什么被否决

策略转向了更务实的方案：「恢复外部依赖」（`docs/strategy-pivot.md`）。

核心洞察：vendor 文件本质上是把大量 npm 包（`@codemirror/*`、`@lezer/*`、`hast-util-*` 等）通过 webpack 打包在一起的产物。如果我们能识别这些包的精确版本号，安装同版本 npm 包，就可以用 `import` 替代内嵌代码——**同版本意味着同一份代码产生了相同的 Facet 实例，Facet 共享问题自动解决**。

从零重写方案约需 40-60 天（单人），而依赖恢复方案每个替换步骤只需数天。

## 关键教训

1. **不要从零重写已有库的包装代码**——vendor 中的 CM6/Lezer/hast 代码就是 npm 包，没有任何 Obsidian 定制。重写它们是在浪费时间。

2. **优先识别内生结构**——vendor 不是一个混沌体，它保留了 webpack 的模块边界和 npm 包结构。在重写之前，应先耗尽"识别 → 提取 → 恢复"的可能性。

3. **Facet 引用相等性是 CM6 的根本约束**——任何"逐步替换 CM6 模块"的方案都不可能成功，因为 CM6 的 Compartment/Facet 系统要求同一 Facet 的所有实例来自同一 JavaScript 对象。

## 替代方案

采用「恢复外部依赖」策略（`docs/strategy-pivot.md`），按以下层次逐步剥离 vendor：

1. 第一层：第三方工具库（base64-js、buffer、events 等）
2. 第二层：CM6 基础设施（@codemirror/state、view、commands、language、autocomplete）
3. 第三层：Lezer / Markdown 语法
4. 第四层：Obsidian 自有逻辑（最终目标，此时体量已大幅缩小）

> **注**：OSS live-preview.ts 实验代码已在重构（crystallization）过程中移除。

## 关联

- 关联文档：`docs/archived/reverse-engineering-plan.md`、`docs/archived/incremental-replacement-plan.md`
- 替代方案：`docs/strategy-pivot.md`

---

> 不要把别人的代码再写一遍。——务实主义
