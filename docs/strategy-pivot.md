# 策略转向：恢复外部依赖，而非从零重写

> 日期：2026-05-20
> 基于覆盖率分析和 AST strip 工作后的战略反思

---

## 核心洞察

### 当前最大优势

**替换边界清晰 + 验证闭环完备。**

- kernel.ts 通过 `window.__X` globals 消费 vendor，这些 globals 就是替换的接口契约
- 48 个行为测试 + fuzz 提供 30 秒内的等价性判定
- 替换可以是黑盒的——不完全理解旧实现也能验证新实现

### 当前最大障碍

**`__language` 和 `__kH` 构成一个不可分割的替换单元。**

- Live Preview (`__kH`) 依赖语法树节点类型做渲染决策
- 如果替换 Markdown parser，节点类型名称改变，渲染逻辑全部失效
- 两者必须同时替换 → 无法渐进
- CM6 Facet 实例按引用比较 → 不能用独立 bundle 的 @codemirror/* 替换单个模块

---

## 策略转向

### 旧策略：从零重写

```
理解 vendor 内部 → 写等价的开源实现 → 验证
```

问题：需要完全理解 174K 行混淆代码中活跃的 60K 行，工作量极大。

### 新策略：恢复外部依赖

```
识别 vendor 内嵌的包 → 用 npm 原版替代 → 验证 → strip 死代码 → 循环
```

核心思想：**vendor 不是从零写的，它是把大量 npm 包打包在一起。**

如果我们能识别这些包的版本号，安装同版本 npm 包，用 import 替换内嵌代码：
- 内嵌的 CM6 代码 → `@codemirror/*` 原版
- 内嵌的 Lezer 代码 → `@lezer/*` 原版
- 内嵌的 hast-util → `hast-util-to-html` 原版

**关键：使用同版本 npm 包意味着 Facet 实例是同一份代码产生的，解决了共享问题。**

---

## 执行循环

```
┌─────────────────────────────────────────────────────────┐
│  1. 识别                                                 │
│     分析 vendor 中内嵌包的特征（API 签名、版本号）        │
│                                                         │
│  2. 替换                                                 │
│     安装对应版本 npm 包，将内嵌代码替换为 import          │
│                                                         │
│  3. 自动验证                                             │
│     bun test e2e/ → 48 个测试 + fuzz 全部通过            │
│                                                         │
│  4. 人工审核                                             │
│     人类肉眼确认逻辑等价性                               │
│                                                         │
│  5. Strip + 分析                                         │
│     重新运行 ast-strip，移除新暴露的死代码               │
│     更新覆盖率数据                                       │
│                                                         │
│  6. 循环                                                 │
│     直到 vendor 只剩 Obsidian 自有的编辑器逻辑            │
└─────────────────────────────────────────────────────────┘
```

---

## 为什么这更适合 AI 主导的工作模式

| 步骤 | AI 能力 | 人类角色 |
|------|---------|---------|
| 识别内嵌包 | 模式匹配、API 签名比对 | 确认版本 |
| 替换为 import | 机械代码修改 | 审核 |
| 自动验证 | 执行测试 | 查看结果 |
| Strip 死代码 | AST 操作 | — |
| 逻辑审核 | — | 肉眼检查关键路径 |

**AI 最擅长**：识别已知模式、执行结构化转换、运行验证。
**人类最擅长**：判断"这两段代码语义是否等价"、决策模糊情况。

---

## 预期的剥离顺序

### 第一层：第三方工具库（已确认）
- base64-js、buffer、events、binary-parser
- hast-util-to-html、rehype 系列
- 占 vendor 约 5%，风险最低

### 第二层：CM6 基础设施
- @codemirror/state (EditorState, Transaction, StateField, Facet...)
- @codemirror/view (EditorView, ViewPlugin, Decoration, WidgetType...)
- @codemirror/commands (indentMore, indentLess...)
- @codemirror/language (Language, syntaxTree, indentUnit...)
- @codemirror/autocomplete (closeBrackets...)
- 占 vendor 约 30-40%，**这是最关键的一步**
- 成功后：Facet 共享问题彻底消除

### 第三层：Lezer / Markdown 语法
- @lezer/common (Tree, NodeType, Parser...)
- @lezer/markdown (markdown parser + extensions)
- Obsidian 的自定义 Lezer extensions（wiki-link、callout、tag、embed）
- 占 vendor 约 10-15%

### 第四层：Obsidian 自有逻辑（最终目标）
- Live Preview 渲染引擎 (`__kH`)
- 主题、样式系统
- 状态管理 (editor/owner/livePreview)
- 这部分不可能通过"恢复依赖"解决，必须理解并重写
- 但此时体量已大幅缩小（可能 10-20K 行）

---

## 与原计划的对比

| 维度 | 原计划（从零重写） | 新策略（恢复依赖） |
|------|-----------------|-----------------|
| 需要理解的代码量 | 全部 60K 活跃行 | 只需理解 Obsidian 自有部分 |
| CM6 版本兼容性 | 需要自己确保 | 天然兼容（同版本） |
| Facet 共享问题 | 无法解决 | 自动解决 |
| 每步工作量 | 大（重写一个模块） | 小（识别+替换一个包） |
| 验证可靠性 | 依赖测试 | 依赖测试 + 源码一致性 |
| 最终剩余工作 | 全部核心逻辑 | 只有 Obsidian 自有逻辑 |

---

## 立即可做的下一步

1. **识别 CM6 版本**：在 vendor 中搜索版本字符串特征（如 `"6.x.x"` 或已知的 API 变更点）
2. **安装对应 @codemirror/* 包**：作为 packages/engine 的依赖
3. **对比 vendor 中的 CM6 代码与 npm 包代码**：确认是否完全一致
4. **如果一致**：修改构建流程，从 npm 包加载 CM6 而非 vendor 内嵌版本

---

> 核心原则不变：**在任何时刻，编辑器都是可工作的。** 但策略从"逐模块重写"变为"逐包恢复依赖"。
