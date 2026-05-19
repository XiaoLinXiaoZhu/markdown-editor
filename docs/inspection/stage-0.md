# 阶段 0 验收清单：项目基础设施

> 阶段目标：monorepo 骨架就绪、构建链路通畅、开发环境可运行。
> 本阶段完成后，项目应处于"可以开始写内核代码"的状态。

---

## 一、产出物清单

人类检查以下文件和目录是否就位：

| # | 产出物 | 位置 | 说明 |
|---|--------|------|------|
| 0.1 | workspace 根配置 | `package.json` | `workspaces` 字段包含 `packages/core` 和 `apps/web` |
| 0.2 | bun 配置 | `bunfig.toml` | workspaces 模式正确 |
| 0.3 | 公共 TypeScript 配置 | `tsconfig.json` | strict 模式，路径别名 |
| 0.4 | 内核包配置 | `packages/core/package.json` | name=`xlxz-markdown-editor`，exports 字段正确 |
| 0.5 | 内核源码入口 | `packages/core/src/index.ts` | 导出 `createEditor` 和相关类型 |
| 0.6 | 类型定义 | `packages/core/src/types.ts` | `EditorPlugin`、`EditorBackend`、`EditorOptions`、`EditorInstance`、`PluginContext` |
| 0.7 | 内核实现 | `packages/core/src/kernel.ts` | `createEditor()` 函数骨架 |
| 0.8 | vendor 脚本 | `packages/core/vendor/` | 从 md-live-preview 迁移：`obsidian-app.patched.js`、CM5、hypermd、i18next、turndown、enhance.js、mock.js |
| 0.9 | vendor 样式 | `packages/core/vendor/` | `app.css`（Obsidian 主题） |
| 0.10 | web 应用配置 | `apps/web/package.json` | 依赖 `xlxz-markdown-editor`（workspace 引用） |
| 0.11 | web 入口 HTML | `apps/web/index.html` | 按正确顺序加载 vendor 脚本 + 挂载点 |
| 0.12 | web Vite 配置 | `apps/web/vite.config.ts` | dev server 端口、静态资源路径 |
| 0.13 | web 入口 TS | `apps/web/src/main.ts` | 调用 `createEditor()`，挂载到 DOM |
| 0.14 | 构建脚本 | `packages/core/package.json` 的 `scripts.build` | `bun build` 输出 ESM + CJS 到 `dist/` |
| 0.15 | .gitignore | 根目录 | 忽略 `node_modules`、`dist`、`.temp` |

---

## 二、验收步骤

### 步骤 1：安装依赖

```bash
cd E:\_Project\@xlxz\markdown-editor
bun install
```

**验收标准**：无错误。`node_modules` 在根目录生成（bun workspaces 默认 hoist）。

### 步骤 2：构建内核

```bash
cd packages/core
bun run build
```

**验收标准**：`packages/core/dist/` 生成 ESM 和 CJS 产物。无 TypeScript 错误。

### 步骤 3：启动 apps/web

```bash
cd apps/web
bun run dev
```

**验收标准**：Vite dev server 启动，浏览器访问后页面不报错。

### 步骤 4：验证空白编辑器

打开 `http://localhost:xxxx`，页面应显示一个空白的 CM6 编辑器区域（有行号、有光标、可输入纯文本）。

**验收标准**：
- 编辑器区域可见
- 可以输入文字
- 行号显示正常
- 控制台无红色错误

---

## 三、关注点

| 关注 | 不关注 |
|------|--------|
| monorepo 结构是否清晰（packages + apps 分离） | 编辑器是否有 live preview 渲染 |
| `bun install` 和 `bun run build` 是否无错误 | 插件系统是否完善 |
| `apps/web` 能否启动并显示空白编辑器 | MathJax / 语法高亮 |
| vendor 脚本加载顺序是否正确（无 `__cm6 not found` 错误） | CSS 主题是否美观 |
| TypeScript 类型是否正确导出 | 性能 / 包体积 |
| ESM + CJS 双格式构建是否正常 | i18n 翻译完整性 |

---

## 四、允许进入阶段 1 的标准

- [x] `bun install` 零错误
- [x] `bun run build`（在 packages/core）零错误，`dist/` 产物存在
- [x] `apps/web` dev server 正常启动
- [x] 浏览器访问 `apps/web` 能看到空白编辑器
- [x] 控制台无 `__cm6 not found` 或类似运行时错误
- [x] 所有产出物文件（0.1-0.15）就位

**任一标准不满足 → 不允许进入阶段 1。**

---

## 五、人类检查要点

1. **目录结构是否符合预期**：对照 ROADMAP.md 第六节的 monorepo 结构图，确认无遗漏、无多余文件。
2. **package.json 的 name 和 exports**：确认 npm 包名正确、exports 路径映射无误。
3. **vendor 脚本的加载顺序**：对照 md-live-preview 的 `index.html`，确认 `<script>` 标签顺序一致。
4. **mock.js 是否正确**：确认 `window.__cm6` 等全局变量在调用 `createEditor()` 前被正确初始化。
5. **构建产物格式**：确认 `dist/` 同时包含 `.mjs`（ESM）和 `.cjs`（CJS）以及 `.d.ts` 类型声明。

---

> 预计人类参与时间：15 分钟
