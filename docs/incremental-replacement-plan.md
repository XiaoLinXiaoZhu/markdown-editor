# 渐进式逆向替换方案

> 目标：在测试保护下，逐模块将 `obsidian-app.patched.js`（vendor）替换为基于 CM6 公开 API 的开源实现。
> 核心策略：**先锁行为，再换实现**。不做一次性重构。

---

## 为什么原计划失败

原 `reverse-engineering-plan.md` 的问题：

1. **一次性全量重写**：174K 行 → AST 切片 → 3000 行重实现，中间没有任何可验证的中间状态
2. **无回退能力**：如果重写出错，没有机制发现"哪个模块行为不一致"
3. **测试后置**：先写代码再验证，而非先验证再替换
4. **耦合假设**：假定能一次性理清所有模块依赖，实际上模块间存在隐式耦合

---

## 新策略：测试先行 + 逐步替换

```
当前状态                          目标状态
┌────────────────┐              ┌────────────────┐
│  kernel.ts     │              │  kernel.ts     │
│  ↓ 使用        │              │  ↓ 使用        │
│  window.__X    │   ────→      │  engine/src/*  │
│  (vendor)      │              │  (开源 CM6)    │
└────────────────┘              └────────────────┘
        │                               │
        └───── 同一套 Puppeteer 测试 ─────┘
              (行为必须完全一致)
```

每次替换一个模块：

1. 对该模块写 Puppeteer 行为测试（针对当前 vendor 行为）
2. 用变异测试验证测试有效性
3. 编写开源替换实现
4. 切换实现，运行测试
5. 全通过 → 提交；有失败 → 修复或回退

---

## Phase 0：测试基础设施

### 目标

搭建 Puppeteer 端到端测试框架，能对 `apps/web` 的 dev server 执行操作并断言行为。

### 产出物

```
packages/core/
├── e2e/
│   ├── setup.ts           # Puppeteer 启动/连接逻辑
│   ├── helpers.ts         # 编辑器操作工具函数
│   ├── snapshot.ts        # Golden snapshot 对比逻辑
│   ├── smoke.test.ts      # 5 个冒烟测试
│   └── golden/            # 快照存储目录
└── package.json           # 新增 puppeteer dev dependency
```

### 测试工具函数

```typescript
// helpers.ts — 核心操作原语
interface EditorHelper {
  /** 设置编辑器文档内容 */
  setDoc(content: string): Promise<void>;
  /** 获取编辑器文档内容 */
  getDoc(): Promise<string>;
  /** 在当前光标位置输入文本 */
  type(text: string): Promise<void>;
  /** 按键（支持组合键） */
  press(key: string): Promise<void>;
  /** 点击指定行的指定位置 */
  clickLine(line: number, ch?: number): Promise<void>;
  /** 移动光标到指定位置 */
  setCursor(line: number, ch: number): Promise<void>;
  /** 获取光标位置 */
  getCursor(): Promise<{ line: number; ch: number }>;
  /** 获取指定行的 DOM class 列表 */
  getLineClasses(line: number): Promise<string[]>;
  /** 获取指定行的可见文本（渲染后） */
  getLineText(line: number): Promise<string>;
  /** 获取指定行的完整 innerHTML */
  getLineHTML(line: number): Promise<string>;
  /** 检查某个 CSS class 是否存在于指定行 */
  lineHasClass(line: number, cls: string): Promise<boolean>;
  /** 获取编辑器 DOM 的标准化快照 */
  getSnapshot(): Promise<string>;
  /** 等待渲染稳定（两帧无变化） */
  waitForStable(): Promise<void>;
}
```

### 冒烟测试

| # | 测试 | 断言 |
|---|------|------|
| 1 | 编辑器启动 | `.cm-editor` 元素存在 |
| 2 | 设置文档 | `getDoc()` 返回设置的内容 |
| 3 | 输入文本 | 输入 "hello" 后 `getDoc()` 包含 "hello" |
| 4 | Live Preview 渲染 | 设置 `# Title`，光标在其他行时，行有 `HyperMD-header` class |
| 5 | 行号显示 | `.cm-lineNumbers` 元素存在 |

### 验收标准

- `bun test e2e/smoke.test.ts` 全部通过
- 测试运行时间 < 30s（headless Chrome）
- 测试可在 CI 中重复运行

---

## Phase 1：行为锁定测试套件

### 目标

将 `docs/inspection/stage-1.md` 中的 35+ 手动验收场景全部转为自动化 Puppeteer 测试。

### 测试分组

#### 1.1 Live Preview 渲染（19 个测试）

每个测试模式相同：

```typescript
test('heading: # hidden when cursor outside', async () => {
  await editor.setDoc('# Hello\n\nWorld');
  await editor.clickLine(3);         // 光标移到第3行
  await editor.waitForStable();
  
  const classes = await editor.getLineClasses(1);
  expect(classes).toContain('HyperMD-header-1');
  
  const visibleText = await editor.getLineText(1);
  expect(visibleText).not.toContain('#');  // # 被隐藏
  expect(visibleText).toContain('Hello');
});

test('heading: # visible when cursor on line', async () => {
  await editor.setDoc('# Hello\n\nWorld');
  await editor.clickLine(1);         // 光标在标题行
  await editor.waitForStable();
  
  const visibleText = await editor.getLineText(1);
  expect(visibleText).toContain('#');   // # 可见
});
```

| # | 场景 | 关键断言 |
|---|------|---------|
| 1 | 标题渲染（光标外） | `#` 不可见，行有 `HyperMD-header-*` class |
| 2 | 标题编辑（光标内） | `#` 可见 |
| 3 | 粗体渲染 | `**` 不可见，文字有 bold 样式 |
| 4 | 粗体编辑 | `**` 可见 |
| 5 | 斜体渲染 | `*` 不可见，文字有 italic 样式 |
| 6 | 链接渲染 | `[text](url)` 中方括号/圆括号隐藏 |
| 7 | 链接编辑 | 完整 markdown 可见 |
| 8 | Wiki-link 渲染 | `[[target]]` 显示为链接样式 |
| 9 | 图片渲染 | `![alt](url)` 显示为 img 元素 |
| 10 | 代码块 | 有背景 class |
| 11 | Blockquote | `>` 隐藏，有 blockquote class |
| 12 | 无序列表 | `- ` 隐藏，显示 bullet |
| 13 | 有序列表 | `1. ` 隐藏，显示序号 |
| 14 | 任务列表 | 显示 checkbox |
| 15 | Callout | 有 callout class 和对应 type |
| 16 | 标签 | 有 tag class |
| 17 | 删除线 | `~~` 隐藏 |
| 18 | 高亮 | `==` 隐藏 |
| 19 | 水平线 | 渲染为 hr |

#### 1.2 列表续行（7 个测试）

| # | 场景 | 操作 → 断言 |
|---|------|------------|
| 1 | 无序列表续行 | `- item` 末尾 Enter → 新行以 `- ` 开头 |
| 2 | 有序列表续行 | `1. item` 末尾 Enter → 新行以 `2. ` 开头 |
| 3 | 任务列表续行 | `- [ ] task` 末尾 Enter → 新行以 `- [ ] ` 开头 |
| 4 | 空列表退出 | `- ` 按 Enter → 该行清空 |
| 5 | Tab 缩进 | 列表项按 Tab → 缩进增加 |
| 6 | Shift-Tab 反缩进 | 缩进列表按 Shift-Tab → 缩进减少 |
| 7 | Blockquote 续行 | `> text` 末尾 Enter → 新行以 `> ` 开头 |

#### 1.3 自动配对（6 个测试）

| # | 场景 | 操作 → 断言 |
|---|------|------------|
| 1 | 括号配对 | 输入 `(` → 文档包含 `()` |
| 2 | 粗体配对 | 输入 `**` → 文档包含 `****` |
| 3 | 代码配对 | 输入 `` ` `` → 文档包含 ` `` ` |
| 4 | 代码块配对 | 输入 ` ``` ` → 文档包含 ` ```\n``` ` |
| 5 | 选中包围 | 选中 `hello` 输入 `*` → 文档包含 `*hello*` |
| 6 | 代码块内不配对 | 在代码块内输入 `(` → 只有 `(`，没有 `)` |

#### 1.4 中文转换（3 个测试）

| # | 场景 | 操作 → 断言 |
|---|------|------------|
| 1 | `【【` → `[[` | 输入后文档包含 `[[` |
| 2 | `】】` → `]]` | 输入后文档包含 `]]` |
| 3 | `···` → ` ``` ` | 输入后文档包含 ` ``` ` |

#### 1.5 回调（3 个测试）

| # | 场景 | 断言 |
|---|------|------|
| 1 | onChange | 输入文字后 callback 被调用 |
| 2 | onSave | Ctrl+S 后 callback 被调用 |
| 3 | onLinkClick | 点击链接后 callback 被调用 |

### 验收标准

- 38 个测试全部通过
- 每个测试有明确的 describe/test 命名
- 测试运行时间 < 2 分钟

---

## Phase 2：变异测试

### 目标

验证 Phase 1 的测试套件确实能检测到行为变化——避免浅度测试（只检查"不报错"）和无效测试（检查无关属性）。

### 方法

**自建轻量变异框架**，而非使用 Stryker（太重且不适合 E2E 测试）。

原理：对 `kernel.ts` 施加可控的行为变更（mutant），然后运行测试套件。如果测试仍然全部通过，说明该区域的测试覆盖无效。

### 变异目标

```typescript
// mutants.ts — 变异定义
interface Mutant {
  id: string;
  description: string;
  /** 对 kernel.ts 内容施加变异 */
  apply(source: string): string;
  /** 期望哪些测试应该失败 */
  expectedFailures: string[];
}

const mutants: Mutant[] = [
  {
    id: 'M01-no-list-continuation',
    description: '删除列表续行逻辑',
    apply: (s) => s.replace(
      /key: 'Enter',\s*run\(v: any\) \{[\s\S]*?return true;\s*\}/,
      "key: 'Enter', run() { return false; }"
    ),
    expectedFailures: ['list-continuation/*'],
  },
  {
    id: 'M02-no-expand-text',
    description: '删除中文括号转换',
    apply: (s) => s.replace(
      /setupExpandText\(\)/,
      '/* expandText disabled */'
    ),
    expectedFailures: ['expand-text/*'],
  },
  {
    id: 'M03-no-live-preview',
    description: '禁用 live preview 扩展',
    apply: (s) => s.replace(
      /const livePreviewExts = .*?\n.*?stateExtensions\.push\(livePreviewExts\);/s,
      '// live preview disabled'
    ),
    expectedFailures: ['live-preview/*'],
  },
  {
    id: 'M04-no-auto-pair',
    description: '禁用自动配对',
    apply: (s) => s.replace(
      /if \(opts\.autoPairBrackets \|\| opts\.autoPairMarkdown\) \{[\s\S]*?\n  \}/,
      '// auto pair disabled'
    ),
    expectedFailures: ['close-brackets/*'],
  },
  {
    id: 'M05-no-fold',
    description: '禁用折叠支持',
    apply: (s) => s.replace(
      /if \(opts\.foldHeading \|\| opts\.foldIndent\) \{[\s\S]*?\n  \}/,
      '// fold disabled'
    ),
    expectedFailures: ['fold/*'],
  },
];
```

### 执行流程

```
对每个 mutant:
  1. 复制 kernel.ts → kernel.mutant.ts（应用变异）
  2. 临时替换构建入口（或用 import alias）
  3. 启动 dev server
  4. 运行测试套件
  5. 记录失败的测试
  6. 对比 expectedFailures：
     - 期望失败的测试确实失败 → ✅ 测试有效
     - 期望失败的测试仍通过 → ❌ 测试无效，需要加强
  7. 还原
```

### 变异测试报告

```
Mutant Report:
┌──────────────────────────┬────────┬───────────────────────┐
│ Mutant                   │ Status │ Details               │
├──────────────────────────┼────────┼───────────────────────┤
│ M01-no-list-continuation │ KILLED │ 7/7 tests failed ✅   │
│ M02-no-expand-text       │ KILLED │ 3/3 tests failed ✅   │
│ M03-no-live-preview      │ KILLED │ 19/19 tests failed ✅ │
│ M04-no-auto-pair         │ KILLED │ 6/6 tests failed ✅   │
│ M05-no-fold              │ KILLED │ 2/2 tests failed ✅   │
└──────────────────────────┴────────┴───────────────────────┘
Mutation Score: 100% (5/5 killed)
```

### 验收标准

- Mutation score ≥ 90%（允许少量边缘 case 未覆盖）
- 每个存活的 mutant 要分析原因并决定是否补充测试
- 变异测试脚本可重复运行

---

## Phase 3：逐模块替换

### 替换机制

在 `packages/core/src/kernel.ts` 中引入模块切换：

```typescript
// kernel.ts 顶部
import * as engine from '@xlxz/engine';  // packages/engine

// 使用时
const lineNumbersImpl = engine.lineNumbers ?? (window as any).__lineNumbers;
stateExtensions.push(lineNumbersImpl({ fixed: false }));
```

`packages/engine` 按模块导出，每个模块独立完成后才加入导出：

```typescript
// packages/engine/src/index.ts
export { lineNumbers } from './line-numbers.js';
export { indentGuide } from './indent-guide.js';
// ... 随替换进度逐步增加
```

### 替换顺序与依赖关系

```
B1（最简，无依赖）
├── lineNumbers          → @codemirror/view lineNumbers()
├── activeLineGutter     → @codemirror/view highlightActiveLine()
├── indentGuide          → @codemirror/view (custom decoration)
├── spellcheck           → EditorView.contentAttributes
└── expandText           → 已是自写代码，只需提取到 engine

B2（中等，依赖 language）
├── foldHeading          → @codemirror/language foldService
├── foldIndent           → @codemirror/language foldService
├── foldGutter           → @codemirror/language foldGutter
├── indentCommands       → @codemirror/commands indentMore/Less
├── listContinuation     → custom keymap handler
└── hangingIndent        → custom Decoration

B3（复杂，相互依赖）
├── closeBrackets        → @codemirror/autocomplete closeBrackets + 自定义
├── markdownSurround     → custom keymap handler
├── frontmatter          → StreamLanguage 或 custom Language
├── stateFields          → StateField.define()
└── compartments         → Compartment（trivial）

B4（核心，所有模块的基础）
├── markdown-language    → @codemirror/lang-markdown + wiki-link/callout/tag/embed 扩展
└── live-preview         → ViewPlugin + Decoration（最大工作量）
```

### 每个模块的替换流程

```
┌─────────────────────────────────────────────────────────────┐
│ 模块 X 替换流程                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 确认测试覆盖                                           │
│     └─ 运行 bun test e2e/ --grep "模块X"                   │
│     └─ 所有相关测试通过 ✓                                   │
│                                                             │
│  2. 分析 vendor 行为                                        │
│     └─ 在 DevTools 中观察 window.__X 的输入输出             │
│     └─ 记录接口契约（参数类型、返回值、副作用）             │
│                                                             │
│  3. 编写替换实现                                            │
│     └─ packages/engine/src/module-x.ts                      │
│     └─ 使用 CM6 公开 API                                    │
│     └─ 匹配 vendor 版本的接口签名                           │
│                                                             │
│  4. 切换                                                    │
│     └─ kernel.ts 中将 window.__X 替换为 engine.moduleX      │
│                                                             │
│  5. 验证                                                    │
│     └─ bun test e2e/  → 全部通过 ✓                         │
│     └─ 如有失败 → 分析差异，修复实现                        │
│                                                             │
│  6. 提交                                                    │
│     └─ git commit: "feat(engine): replace __X with ..."     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### B1 详细设计：最简模块

#### lineNumbers

```typescript
// packages/engine/src/line-numbers.ts
import { lineNumbers as cmLineNumbers } from '@codemirror/view';
import { highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';

export function lineNumbers(opts?: { fixed?: boolean }) {
  return cmLineNumbers();
}

export const activeLineGutter = highlightActiveLineGutter();
export const highlightActiveLineGutterExt = highlightActiveLine;
```

#### indentGuide

```typescript
// packages/engine/src/indent-guide.ts
import { ViewPlugin, Decoration, DecorationSet, EditorView } from '@codemirror/view';

// 重实现缩进指引线（观察 vendor 输出的 DOM 结构后模仿）
export const indentGuide = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = this.build(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view: EditorView): DecorationSet { /* ... */ }
}, { decorations: v => v.decorations });
```

### B4 详细设计：核心模块（远期）

这是最难的部分。markdown-language 和 live-preview 高度耦合：

- live-preview 依赖 language 提供的语法树（syntaxTree）来决定哪些节点要隐藏/渲染
- language 定义了 wiki-link、callout、tag、embed 等自定义语法节点
- 两者必须协同替换

**策略**：
1. 先替换 language（用 `@codemirror/lang-markdown` + `@lezer/markdown` 扩展）
2. 确保语法树结构兼容
3. 再替换 live-preview（基于新语法树的 ViewPlugin）
4. 两者替换期间可能需要中间适配层

---

## 技术细节

### Puppeteer 连接方式

```typescript
// e2e/setup.ts
import puppeteer from 'puppeteer';

let browser: Browser;
let page: Page;

export async function setup() {
  browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
  // apps/web dev server 在 port 3002
  await page.goto('http://localhost:3002', { waitUntil: 'networkidle0' });
  // 等待编辑器就绪
  await page.waitForSelector('.cm-editor');
}
```

### DOM 断言标准化

Live Preview 的 DOM 结构依赖于 vendor 实现细节。为了让测试对替换不敏感，断言应基于：

1. **语义 class**（如 `HyperMD-header-1`、`cm-link`）而非 DOM 层级
2. **可见文本内容**（`element.textContent`）而非 innerHTML
3. **光标位置**（`state.selection.main.head`）而非 DOM 选区

### 条件切换的回退安全

```typescript
// 如果 engine 模块在运行时出错，自动 fallback 到 vendor
function safeUseEngine<T>(engineImpl: T | undefined, vendorKey: string): T {
  if (engineImpl !== undefined) {
    return engineImpl;
  }
  const vendorImpl = (window as any)[vendorKey];
  if (!vendorImpl) {
    console.warn(`Neither engine nor vendor provides ${vendorKey}`);
  }
  return vendorImpl;
}
```

---

## 时间线估算

| Phase | 工作量 | 依赖 |
|-------|--------|------|
| P0: 测试基础设施 | 2-3 天 | 无 |
| P1: 行为锁定 | 5-7 天 | P0 |
| P2: 变异测试 | 2-3 天 | P1 |
| P3-B1: 最简模块 | 2-3 天 | P1 |
| P3-B2: 中等模块 | 5-7 天 | P3-B1 |
| P3-B3: 复杂模块 | 7-10 天 | P3-B2 |
| P3-B4: 核心模块 | 15-25 天 | P3-B3 + 全部测试 |

总计：~40-60 天（单人），但 **每一步都有可验证的交付物**。

---

## 与原计划的区别

| 维度 | 原计划 | 新计划 |
|------|--------|--------|
| 验证时机 | 最后验证 | 每步验证 |
| 失败影响 | 全部返工 | 只回退一个模块 |
| 回退能力 | 无 | 随时可回退到 vendor |
| 中间产物 | 无可用状态 | 每次替换后仍然可用 |
| 测试角色 | 验收检查 | 驱动替换的核心工具 |
| 起步门槛 | 需理解全部 174K 行 | 只需理解当前替换的模块 |
| 风险分布 | 集中（最后阶段爆发） | 分散（每个模块独立承担） |

---

## 下一步行动

1. 在 `packages/core/package.json` 中添加 `puppeteer` 作为 devDependency
2. 创建 `packages/core/e2e/` 目录结构
3. 实现 `setup.ts` 和 `helpers.ts`
4. 编写 5 个冒烟测试验证基础设施可用
5. 开始 Phase 1 的测试编写

---

> 本方案的核心原则：**在任何时刻，编辑器都是可工作的。** 替换是增量的，风险是隔离的，验证是自动化的。
