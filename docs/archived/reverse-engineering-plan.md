# 完整逆向工程方案

> 目标：从 `obsidian-app.patched.js` 中提取 Obsidian 编辑器引擎的最小功能子集，基于 CM6 公开 API 重新实现。
> 产物：纯开源 `@xlxz/markdown-editor-engine` npm 包，行为与当前 vendor 版本完全一致。

---

## 总体策略

三层递进：**动态分析 → 静态切片 → 重实现**。

```
174,096 行 vendor
      │
      ▼ 第一层：动态分析（找"热代码"）
~35,000 行（实际执行）
      │
      ▼ 第二层：AST 程序切片（找"依赖闭包"）
~5,000 行（编辑器引擎 + 传递依赖）
      │
      ▼ 第三层：按窄接口拆分模块 + 重实现
~3,000 行（纯 CM6 实现）
```

---

## 第一层：动态分析——找到实际执行的代码

### 1.1 Chrome DevTools Protocol 覆盖率采集

```javascript
// coverage-collector.js — 通过 Puppeteer 启动编辑器并采集覆盖率
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // 启用 JS 和 CSS 覆盖率
  await Promise.all([
    page.coverage.startJSCoverage({ resetOnNavigation: false }),
    page.coverage.startCSSCoverage(),
  ]);

  // 加载编辑器页面
  await page.goto('http://localhost:3002');

  // 执行全面的编辑操作，触发所有代码路径
  await performEditOperations(page);

  // 采集覆盖率
  const [jsCoverage] = await Promise.all([
    page.coverage.stopJSCoverage(),
    page.coverage.stopCSSCoverage(),
  ]);

  // 过滤出 obsidian-app.patched.js 的覆盖率
  const vendorCoverage = jsCoverage.find(entry =>
    entry.url.includes('obsidian-app.patched.js')
  );

  // 输出未使用的字节范围（用于死代码消除）
  const unusedRanges = analyzeUnusedRanges(vendorCoverage);
  fs.writeFileSync('coverage-unused.json', JSON.stringify(unusedRanges));

  await browser.close();
})();
```

### 1.2 编辑操作脚本（覆盖所有代码路径）

必须触发的操作（确保覆盖率完整）：

```
□ 页面加载、编辑器初始化
□ 输入普通文本
□ 输入 Markdown 语法：标题 #、粗体 **、斜体 *、删除线 ~~、高亮 ==
□ 输入 Wiki 链接 [[
□ 输入外部链接 [text](url)
□ 输入图片 ![alt](url)
□ 输入代码块 ```
□ 输入 Callout > [!NOTE]
□ 输入标签 #tag
□ 列表操作：无序列表、有序列表、任务列表
□ 列表 Enter 续行、空行退出
□ Tab/Shift-Tab 缩进
□ 自动配对：括号、引号、Markdown 标记
□ 选中文字包围
□ 代码块内不配对
□ 中文括号转换 【【→[[
□ 粘贴 HTML 富文本
□ 粘贴图片（触发 saveAttachment）
□ 拖拽文件
□ 点击内部链接、外部链接
□ 折叠/展开标题
□ 折叠/展开缩进
□ Ctrl+S 保存
□ 拼写检查
□ 行号显示/当前行高亮
□ 缩进指引渲染
□ 自动补全弹出、选择、取消
```

### 1.3 产物

| 文件 | 内容 |
|------|------|
| `coverage-report.json` | 每个 function/range 的执行次数 |
| `hot-ranges.txt` | 实际执行的字节/行号范围列表 |
| `dead-ranges.txt` | 从未执行的代码范围（可直接剔除） |

---

## 第二层：AST 程序切片——提取依赖闭包

### 2.1 窄接口作为切片起点

从 28 个 `window.__*` 变量出发，通过 AST 分析构建完整的依赖图：

```typescript
// dependency-slicer.ts — 从窄接口追溯到所有依赖
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

interface SliceNode {
  name: string;           // 变量名（混淆后的）
  exportName: string;     // window.__X 名称
  defLine: number;        // 定义行号
  defType: 'function' | 'class' | 'var' | 'const' | 'let';
  deps: string[];         // 直接引用的其他变量
  transitive: Set<string>; // 传递闭包
  codeRange: [number, number]; // 在源码中的起止行号
  sizeLines: number;
}

// 步骤：
// 1. 解析 JS → AST
// 2. 找到每个 narrow-interface 变量的定义节点
// 3. 在定义的作用域内，收集所有引用（Identifier references）
// 4. 对每个引用递归追溯其定义
// 5. 构建传递闭包
// 6. 标记哪些依赖是"外部"的（来自 CM6、hypermd 等非 Obsidian 代码）
```

### 2.2 区分三类代码

| 类别 | 标志 | 处理方式 |
|------|------|---------|
| **CM6 标准 API** | `Vo`(EditorView), `ct`(EditorState), `qi`(ViewPlugin), `Gn`(Decoration), `Fe`(Prec), `Ko`(keymap), `De`(StateField), `$e`(StateEffect), `Ne`(Compartment), `Qe`(Transaction) | 直接映射到 `@codemirror/*` npm 包 |
| **Obsidian 定制** | `kH`, `JB`, `jB`, `WB`, `KB`, `lD`, 等 | 需要重实现——这是核心工作量 |
| **外部库** | `CodeMirror`(CM5), `i18next`, `TurndownService`, `MathJax` | 用等价的 npm 包替代 |

### 2.3 作用域精确分析

混淆代码中变量名在不同 IIFE 作用域中复用。必须使用 AST 的作用域树来区分：

```
全局作用域
├── IIFE_1 (行 1 - 50000)
│   ├── var LB = "Lebanon"  ← 国家代码，不是编辑器代码
│   └── var BB = "Barbados"
├── IIFE_2 (行 50001 - 100000)
│   ├── function kH(e, t) { ... }  ← Live Preview 引擎
│   └── var LB = foldService(...)  ← 同名不同义
└── IIFE_3 (行 100001 - 174096)
    └── window.__foldIndent = LB;  ← 引用的是 IIFE_2 的 LB
```

### 2.4 产物

| 文件 | 内容 |
|------|------|
| `slice-graph.json` | 完整依赖图（节点 + 边） |
| `slice-closure.txt` | 依赖闭包的行号范围列表（可从原文件中提取） |
| `external-deps.json` | CM6 API / 第三方库的映射表 |
| `obsidian-custom.json` | Obsidian 定制代码的精确范围（需要重实现的部分） |

---

## 第三层：模块化拆分 + 重实现

### 3.1 按窄接口拆分为独立模块

将依赖闭包中的代码按功能拆分为以下模块：

```
packages/engine/
├── src/
│   ├── index.ts              # createEditor() 入口
│   ├── live-preview.ts       # kH → ViewPlugin + Decoration
│   ├── markdown-language.ts  # JB → @codemirror/lang-markdown + 扩展
│   ├── state-fields.ts       # jB, WB, KB → StateField.define()
│   ├── close-brackets.ts     # pT, lT, fT, iB → @codemirror/autocomplete
│   ├── hanging-indent.ts     # lD → Decoration
│   ├── line-numbers.ts       # Es, iT, Rs → @codemirror/view
│   ├── indent-guide.ts       # qT → @codemirror/view
│   ├── fold.ts               # Ed, RT, FB, LB, BB → @codemirror/language
│   ├── frontmatter.ts        # ET → StreamLanguage
│   ├── commands.ts           # zB, qB, Bg → keymap handlers
│   ├── list.ts               # Jf → regex + keymap
│   ├── expand-text.ts        # 【【→[[ → updateListener
│   ├── link-handler.ts       # → DOM event listener
│   ├── suggest.ts            # → @codemirror/autocomplete
│   ├── attachment.ts         # → domEventHandlers
│   └── types.ts              # 公开类型定义
├── test/
│   ├── parity/               # 行为等价性测试
│   │   ├── test-suite.ts     # 38 个 stage-1 场景自动化
│   │   └── golden-outputs/   # 期望的渲染输出快照
│   └── unit/                 # 单元测试
└── package.json
```

### 3.2 重实现原则

1. **行为等价优先**：先用最直接的方式复现行为，不追求代码优雅
2. **逐模块替换**：一次替换一个模块，替换后立即跑 parity test
3. **CM6 公开 API 优先**：能用 `@codemirror/*` 实现的，绝不手写
4. **保留原注释**：原代码中的逻辑标记为 `// ported from obsidian-app L12345`

### 3.3 parity 测试框架

```typescript
// parity-tester.ts
// 同时启动旧引擎（vendor）和新引擎（重实现），
// 对同一输入序列比较两者的输出

interface ParityTest {
  name: string;
  doc: string;
  actions: EditorAction[];
  assertions: (oldState: any, newState: any) => boolean;
}

type EditorAction =
  | { type: 'input'; text: string }
  | { type: 'key'; key: string; mods?: string[] }
  | { type: 'paste'; html?: string; text?: string; image?: Buffer }
  | { type: 'click'; selector: string }
  | { type: 'moveCursor'; line: number; ch: number };

// 测试套件
const parityTests: ParityTest[] = [
  {
    name: 'heading rendering',
    doc: '# Hello\n\nWorld',
    actions: [
      { type: 'moveCursor', line: 2, ch: 0 },
      { type: 'moveCursor', line: 1, ch: 2 },
    ],
    assertions: (old, neo) => {
      // 比较 DOM 结构、光标位置、decoration 集合
      return domStructureEqual(old, neo);
    },
  },
  // ... 38 个 stage-1 场景
];
```

---

## 第四层：验证与清理

### 4.1 对比验证

| 验证方式 | 工具 |
|---------|------|
| DOM 结构对比 | `oldEditor.view.dom.innerHTML` vs `newEditor.view.dom.innerHTML`（标准化后对比） |
| 光标行为对比 | 相同操作后比对 `state.selection` |
| 渲染快照对比 | Puppeteer screenshot 像素级对比 |
| 事件回调对比 | Mock `onChange`/`onSave`/`onLinkClick` 记录参数序列 |
| 性能对比 | 相同文档 + 相同操作的耗时对比 |

### 4.2 删除 vendor 依赖

当所有 parity 测试通过后：

- [ ] 删除 `packages/core/vendor/obsidian-app.patched.js`
- [ ] 删除 `packages/core/vendor/enhance.js`
- [ ] 删除 `packages/core/vendor/app.css`（用新主题替代）
- [ ] 删除 `packages/core/vendor/i18n/`（用新 i18n 替代）
- [ ] 删除 `packages/core/vendor/lib/codemirror.js`（CM5 → CM6）
- [ ] 删除 `packages/core/vendor/lib/markdown.js`（hypermd → @codemirror/lang-markdown）
- [ ] 删除 `packages/core/vendor/lib/meta.min.js`
- [ ] 删除 `packages/core/vendor/mock.js`（不再需要）
- [ ] `bun run build` 产物从 26 KB → 目标 < 50 KB（纯 JS）
- [ ] 许可证从 UNLICENSED → MIT

---

## 工具清单

| 工具 | 用途 | 安装 |
|------|------|------|
| `puppeteer` | 覆盖率采集、截图对比 | `npm install puppeteer` |
| `acorn` + `acorn-walk` | JS AST 解析与遍历 | `npm install acorn acorn-walk` |
| `astring` | AST → 代码生成 | `npm install astring` |
| `@codemirror/*` | 重实现的目标 API | `npm install @codemirror/view @codemirror/state @codemirror/language @codemirror/commands @codemirror/autocomplete @codemirror/lang-markdown @codemirror/fold` |
| `pixelmatch` | 像素级截图对比 | `npm install pixelmatch` |

---

## 执行顺序

```
Week 1-2: 第一层动态分析
  ├── 搭建 Puppeteer 覆盖率采集
  ├── 编写完整编辑操作脚本
  └── 产出 hot-ranges.txt / dead-ranges.txt

Week 3-4: 第二层 AST 切片
  ├── 用 acorn 解析 obsidian-app.patched.js
  ├── 从 28 个窄接口追溯依赖闭包
  ├── 区分 CM6 API / Obsidian 定制 / 第三方库
  └── 产出 slice-closure.txt / obsidian-custom.json

Week 5-10: 第三层模块化重实现
  ├── 按模块逐个重实现（先 CM6 API 替代、再 Obsidian 定制）
  ├── 每完成一个模块跑 parity test
  └── 目标：全部 38 个 stage-1 场景通过

Week 11-12: 第四层验证与清理
  ├── 全量 parity test 通过
  ├── 删除 vendor 目录
  ├── 许可更新
  └── 发布 v2.0.0
```

---

> 本方案可由另一个 agent 执行。每个阶段有明确的输入、工具、产物和验收标准。
