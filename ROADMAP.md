# xlxz-markdown-editor — ROADMAP

> 基于 Obsidian CM6 引擎的 Markdown 即时渲染编辑器组件。npm 包分发，微内核架构，体验与 Obsidian 完全一致。

---

## 一、项目定位

| 维度 | 决策 |
|------|------|
| 包名 | `xlxz-markdown-editor` |
| 仓库 | `E:\_Project\@xlxz\markdown-editor` |
| 分发 | npm（ESM + CJS + types） |
| 架构 | 微内核 + 插件系统 |
| 工作区 | bun workspaces（monorepo） |
| 验证项目 | `apps/web` |
| 用户范围 | 自己 + 少量熟人开发者 |
| 许可证 | 待定（远期依赖恢复完成后 MIT） |

### 核心原则

1. **Markdown 是唯一真相源**。HTML/DOM/渲染产物全是派生，不持久化。
2. **依赖反转**。文件系统、网络、存储全部通过接口注入，内核不依赖任何具体实现。
3. **开闭原则**。新功能通过新增插件实现，不修改内核代码。
4. **体验复刻 Obsidian**。光标离开区域隐藏 markdown 语法符号、显示渲染效果；光标进入则显示原始符号。
5. **先复刻后创新**。阶段 1 完全复刻 Obsidian 行为（少量 mock），阶段 2 后根据反馈调整与 Obsidian 不同的功能。

---

## 二、架构设计

### 2.1 微内核

内核只做三件事：

```
┌──────────────────────────────────────────┐
│                  Kernel                   │
│                                           │
│  createEditor(container, options) → EditorInstance │
│                                           │
│  EditorInstance:                          │
│    .view        → CM6 EditorView          │
│    .getDoc()    → string (markdown)       │
│    .setDoc()    → void                    │
│    .getSelection() → string               │
│    .focus()                               │
│    .destroy()                             │
│    .use(plugin) → void                    │
│    .unuse(plugin) → void                  │
└──────────────────────────────────────────┘
```

内核大小：~120 行 TypeScript（已达成 < 300 行目标）。

### 2.2 插件系统

每个插件实现 `EditorPlugin` 接口：

```typescript
interface EditorPlugin {
  /** 唯一标识 */
  id: string;
  /** 依赖的其他插件 ID */
  deps?: string[];
  /** 安装：接收编辑器上下文，返回 CM6 扩展（或扩展数组） */
  install(ctx: PluginContext): Extension | Extension[];
  /** 卸载（可选） */
  uninstall?(ctx: PluginContext): void;
}

interface PluginContext {
  view: EditorView;
  options: EditorOptions;
  backend: EditorBackend;
  // 插件的共享状态（通过内核管理）
  getState<T>(pluginId: string): T | undefined;
  setState<T>(pluginId: string, state: T): void;
}
```

### 2.3 扩展点目录

内核不定义具体的扩展点——扩展点就是 `EditorPlugin.id`。插件通过 `deps` 声明依赖关系。这比预定义 interface 更灵活：一个插件可以实现多个关注点，未来新增扩展点不需要改内核。

约定优于配置：以下 plugin ID 是稳定契约（语义版本控制），其余 ID 是内部实现：

| Plugin ID | 语义约定 | 类别 |
|-----------|---------|------|
| `live-preview` | WYSIWYG 渲染——隐藏/显示 markdown 语法符号 | A |
| `markdown-language` | Markdown 语言定义（parser + syntax highlighting） | A |
| `hanging-indent` | 列表悬挂缩进 | A |
| `list-continuation` | 智能列表续行（Enter/Tab 行为） | A |
| `frontmatter` | YAML frontmatter 解析和渲染 | A |
| `markdown-surround` | 选中文字后自动包围 markdown 语法 | A |
| `wiki-link` | `[[link]]` 解析、渲染、导航 | A |
| `callout` | `> [!NOTE]` 渲染 | A |
| `tag-render` | `#tag` 渲染 | A |
| `embed` | `![[note]]` 嵌入渲染 | A |
| `expand-text` | 中文括号自动转换 `【【`→`[[` | A |
| `close-brackets` | 自动配对括号（基于 CM6 closeBrackets 扩展） | B |
| `fold-heading` | 标题折叠 | B |
| `fold-indent` | 缩进折叠 | B |
| `fold-ui` | 折叠按钮和 UI | B |
| `line-numbers` | 行号显示 | B |
| `active-line` | 活动行高亮 | B |
| `indent-guide` | 缩进指引线 | B |
| `keymap` | 自定义快捷键 | B |
| `suggest` | 自动补全框架 | B |
| `spellcheck` | 拼写检查 | C |
| `math` | MathJax 数学公式渲染（可选，默认不打包） | 可选 |
| `syntax-highlight` | 代码块语法高亮（按语言懒加载） | 可选 |
| `attachment` | 粘贴/拖拽图片处理 | 可选 |
| `theme` | 主题和 CSS 变量注入 | 基础 |
| `i18n` | 国际化 | 可选 |

### 2.4 依赖注入层

```typescript
interface EditorBackend {
  /** 返回所有可链接目标（[[ 补全） */
  listLinkTargets?(): Promise<LinkTarget[]>;
  /** 解析内部链接路径 → 实际路径；null = 不存在 */
  resolveLinkPath?(linktext: string, sourcePath: string): string | null;
  /** vault 路径 → 可加载 URL */
  getResourceUrl?(path: string): string;
  /** 读取文件内容（笔记嵌入） */
  readFile?(path: string): Promise<string>;
  /** 导航到文件 */
  openFile?(path: string): void;
  /** 保存附件，返回最终路径 */
  saveAttachment?(name: string, data: ArrayBuffer): Promise<string>;
}

interface I18nProvider {
  t(key: string, params?: Record<string, string>): string;
}

interface AssetLoader {
  loadFont(url: string): Promise<ArrayBuffer>;
  loadScript(url: string): Promise<void>;
}
```

所有方法均可选——未提供的能力优雅降级（如不提供 `listLinkTargets` 则 `[[` 补全不弹出）。

---

## 三、Obsidian 定制深度审计

（完整分析见 `docs/archived/obsidian-customization-audit.md`）

### A 类：完全自定义（15 项）

Obsidian 从零实现的逻辑。clean-room 重写时需要逐项重新实现。

| # | 组件 | 复杂度 |
|---|------|--------|
| A1 | Live Preview 渲染引擎（`__kH`） | 🔴 极高 |
| A2 | Markdown 语言定义（`__language`，含 wiki-link/callout/tag/embed 语法） | 🔴 高 |
| A3 | 悬挂缩进（`__hangingIndent`） | 🟡 中 |
| A4 | 智能列表续行（`__listRegex` + Enter handler） | 🟡 中 |
| A5 | Frontmatter 处理（`__frontmatterHandler`） | 🟡 中 |
| A6 | Markdown 包围（`__closeBrackets.markdownSurround`） | 🟡 中 |
| A7 | Wiki-link 解析与渲染 | 🟡 中 |
| A8 | Callout 渲染 | 🟡 中 |
| A9 | Tag 渲染 | 🟢 低 |
| A10 | Embed 渲染 | 🟡 中 |
| A11 | 中文括号自动转换（`【【`→`[[`） | 🟢 低 |
| A12 | 自定义 StateField（editor/owner/livePreview） | 🟡 中 |
| A13 | 自定义缩进命令 | 🟡 中 |
| A14 | HTML 粘贴转 Markdown | 🟢 低 |
| A15 | 附件拖拽/粘贴 | 🟡 中 |

### B 类：基于 CM6 扩展点定制（11 项）

使用 CM6 公开 API 实现，可在 clean-room 中用标准 CM6 包重写。

### C 类：CM6 原生特性（15 项）

无需处理，直接使用 CM6 标准 API。

---

## 四、阶段计划

### 阶段 0：项目基础设施

**目标**：monorepo 骨架、构建链路、开发环境就绪。

| # | 任务 | 产出 |
|---|------|------|
| 0.1 | 创建 bun workspace 根配置 | `package.json`（workspaces）、`bunfig.toml` |
| 0.2 | `packages/core`：内核骨架 | 空 `createEditor()` + `EditorPlugin` interface |
| 0.3 | `apps/web`：Vite + 最小 HTML 页面 | 验证内核能创建空白 CM6 EditorView |
| 0.4 | 从 `md-live-preview` 迁移 vendor 脚本到 `packages/core/vendor/` | obsidian-app.patched.js + CM5 + hypermd + turndown |
| 0.5 | 构建配置：`bun build` 输出 ESM + CJS | `dist/` 产物 |
| 0.6 | TypeScript 严格模式 + path aliases | `tsconfig.json` |
| 0.7 | CI：`bun test` + `bun run build` | GitHub Actions（可选） |

### 阶段 1：内核 + 基础插件（复刻 Obsidian 最小可用体验）

**目标**：`apps/web` 中能打开一个具备 live preview 的编辑器，输入 markdown 获得与 Obsidian 一致的即时渲染。

| # | 任务 | 依赖 |
|---|------|------|
| 1.1 | 实现内核 `createEditor()` 和插件注册表 | 0.2 |
| 1.2 | 实现 `live-preview` 插件（封装 `__kH`） | 1.1, 0.4 |
| 1.3 | 实现 `markdown-language` 插件（封装 `__language`） | 1.1, 0.4 |
| 1.4 | 实现 `theme` 插件（自动注入 CSS + CSS 变量体系） | 1.1 |
| 1.5 | 实现 `hanging-indent` 插件（封装 `__hangingIndent`） | 1.1 |
| 1.6 | 实现 `list-continuation` 插件（智能列表 Enter/Tab） | 1.1 |
| 1.7 | 实现 `markdown-surround` 插件 | 1.1 |
| 1.8 | 实现 `close-brackets` 插件 | 1.1 |
| 1.9 | 实现 `frontmatter` 插件 | 1.1 |
| 1.10 | 实现 `wiki-link` 插件 | 1.1 |
| 1.11 | 实现 `callout` 插件 | 1.1 |
| 1.12 | 实现 `tag-render` 插件 | 1.1 |
| 1.13 | 实现 `expand-text` 插件（中文括号转换） | 1.1 |
| 1.14 | 实现 `fold-heading` + `fold-indent` + `fold-ui` 插件 | 1.1 |
| 1.15 | 实现 `line-numbers` + `active-line` 插件 | 1.1 |
| 1.16 | 实现 `indent-guide` 插件 | 1.1 |
| 1.17 | `apps/web` 集成验证：打开 demo 文档，交互正常 | 1.2-1.16 |

阶段 1 产出：npm 可发布的 `xlxz-markdown-editor`（alpha 版），具备与 Obsidian 一致的编辑体验。

### 阶段 2：可选插件（tree-shakeable 的重型依赖）

**目标**：MathJax、语法高亮、图片处理等重依赖作为独立插件，不引入则零开销。

| # | 任务 |
|---|------|
| 2.1 | 实现 `math` 插件（MathJax 集成，默认不打包） |
| 2.2 | 实现 `syntax-highlight` 插件（代码块高亮，按语言懒加载 mode） |
| 2.3 | 实现 `attachment` 插件（粘贴/拖拽图片：先插入后上传） |
| 2.4 | 实现 `suggest` 插件（自动补全框架——`[[` 补全 + 通用扩展） |
| 2.5 | 实现 `i18n` 插件（DI 注入翻译函数，中文优先） |

### 阶段 3：API 稳定 + 文档

**目标**：明确的 API 契约、多场景集成示例。

| # | 任务 |
|---|------|
| 3.1 | API 参考文档（JSDoc → 自动生成） |
| 3.2 | 集成示例：纯 HTML/JS、Vue 3 |
| 3.3 | 在线 playground（`apps/web` 发布为静态站点） |
| 3.4 | 迁移指南（从 vditor 到 xlxz-markdown-editor） |
| 3.5 | 发布 v1.0.0 到 npm |

### 阶段 4：iNote 集成验证

**目标**：在真实 Tauri 应用中替换 vditor。

| # | 任务 |
|---|------|
| 4.1 | iNote 独立分支集成 `xlxz-markdown-editor` |
| 4.2 | 适配图片存储（`saveAttachment` → Tauri 文件系统） |
| 4.3 | 适配链接导航（`atom:///` 协议） |
| 4.4 | 适配便签列表卡片（markdown → HTML 预览） |
| 4.5 | 全功能回归测试 |

### 阶段 5：依赖恢复 + 精简（远期）

**目标**：通过识别和恢复 vendor 中内嵌的 npm 包，逐步减少对 `obsidian-app.patched.js` 的依赖。

| # | 任务 |
|---|------|
| 5.1 | 识别 vendor 中内嵌的 npm 包版本（@codemirror/*、@lezer/*、hast-util-* 等） |
| 5.2 | 安装对应版本的 npm 包，用 import 替代 vendor 内嵌代码 |
| 5.3 | 逐层剥离：第三方工具库 → CM6 基础设施 → Lezer/Markdown 语法 |
| 5.4 | 最终仅保留 Obsidian 自有编辑器逻辑（此时体量已大幅缩小） |
| 5.5 | 发布 v2.0.0（纯开源许可） |

> 详细策略见 `docs/strategy-pivot.md`。

---

## 五、决策日志

| # | 决策 | 结论 | 日期 |
|---|------|------|------|
| D1 | 项目名称 | `xlxz-markdown-editor` | 2025-07 |
| D2 | 架构模式 | 微内核 + 插件系统 | 2025-07 |
| D3 | 包管理 | bun workspaces | 2025-07 |
| D4 | 验证项目 | `apps/web`（Vite + 纯 HTML） | 2025-07 |
| D5 | 工具栏 | 不提供（Obsidian 风格：键盘优先） | 2025-07 |
| D6 | CSS 策略 | 自动注入 + CSS 变量体系 | 2025-07 |
| D7 | 图片上传 | 先插入后异步上传（和 Obsidian 一致） | 2025-07 |
| D8 | 链接行为 | 完全由外部回调控制（`onLinkClick` / `onExternalLinkClick`） | 2025-07 |
| D9 | HTML 输出 | 不内置 `getHTML()`——markdown 是唯一真相源，需要 HTML 由外部用第三方 parser 生成 | 2025-07 |
| D10 | 法律路径 | 当前使用 Obsidian 提取物（内部使用），通过依赖恢复策略（识别 vendor 内嵌 npm 包，逐步替换为同版本 npm import）替代 clean-room 重写 | 2026-05 |
| D11 | import 风格 | 命名导出 `import { createEditor } from 'xlxz-markdown-editor'` | 2025-07 |
| D12 | 字体/脚本加载 | 通过 `AssetLoader` 接口依赖注入，适配 Tauri file:// 协议 | 2025-07 |

---

## 六、monorepo 目录结构

```
@xlxz/markdown-editor/
├── package.json              # workspaces 根
├── bunfig.toml
├── tsconfig.json             # 公共 tsconfig
├── ROADMAP.md                # 本文件
├── README.md                 # 项目简介 + SSOT 原则
├── CONTRIBUTING.md           # 贡献指南
├── CRYSTALLIZATION_REPORT.md # 结晶报告
├── docs/
│   ├── api.md                # API 参考
│   ├── architecture.md       # 架构文档
│   ├── strategy-pivot.md     # 当前策略（依赖恢复）
│   ├── vendor-patches.md     # Vendor 补丁记录
│   ├── decisions/negative/   # 负向决策记录
│   ├── inspection/           # 验收检查清单
│   └── archived/             # 已归档文档
│       └── obsidian-customization-audit.md
├── assets/
│   └── negative_adr_template.md
├── packages/
│   └── core/
│       ├── package.json      # "xlxz-markdown-editor"
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts      # 公开 API 入口
│       │   ├── kernel.ts     # createEditor() 内核（~882 行）
│       │   ├── types.ts      # 所有公开类型
│       │   └── table/        # 纯文本表格扩展
│       ├── e2e/              # E2E 测试（Puppeteer + bun test）
│       │   ├── fuzz/         # Fuzz 等价性测试
│       │   └── coverage/     # Vendor 分析工具
│       ├── vendor/           # Obsidian 运行时（远期通过依赖恢复精简）
│       └── dist/             # 构建产物
├── apps/
│   └── web/                  # 验证应用（Vite + Vue）
└── ref/                      # 历史原型（gitignored，vendor 重建源文件）
```

---

## 七、当前状态

| 阶段 | 状态 | 说明 |
|------|------|------|
| 0 — 基础设施 | ✅ 完成 | monorepo + 构建链路 + vendor 迁移 |
| 1 — 内核 + 基础插件 | ✅ 完成 | 微内核（~120 行）+ 17 个独立插件，38 E2E 测试通过 |
| 2 — 可选插件 | ✅ 完成 | suggest 重构为 Input Prompter（多 provider 架构），所有功能已插件化 |
| 3 — API 稳定 + 文档 | ✅ 完成 | npm v1.0.0 已发布，api.md + architecture.md 就绪 |
| 4 — iNote 集成 | ⏳ 未开始 | 等待阶段 5 依赖恢复完成后进行 |
| 5 — 依赖恢复 | ⏳ 进行中 | 策略已确定（strategy-pivot.md），vendor 已剥离 EBML，待识别 CM6 版本 |

---

> 最后更新：2026-05
