# 阶段 3 验收清单：API 稳定 + 文档

> 阶段目标：API 契约明确、文档完整、示例可运行、在线 Playground 可用。发布 v1.0.0 到 npm。
> 本阶段是项目从"能用"到"可交付"的转折点。

---

## 一、产出物清单

| # | 产出物 | 位置 | 说明 |
|---|--------|------|------|
| 3.1 | API 参考文档 | `docs/api.md` | 所有公开接口的完整说明（类型、参数、返回值、示例） |
| 3.2 | 架构文档 | `docs/architecture.md` | 微内核架构说明、插件开发指南 |
| 3.3 | 纯 HTML/JS 示例 | `apps/web/index.html` 或独立页面 | 不依赖框架的最小集成示例 |
| 3.4 | Vue 3 集成示例 | `apps/web/src/` 中独立页面 | Vue 组件封装示例 |
| 3.5 | React 集成示例 | `apps/web/src/` 中独立页面 | React 组件封装示例（可用可不做，看需求） |
| 3.6 | 在线 Playground | `apps/web` 发布为静态站点 | 可直接编辑 Markdown 的体验页面 |
| 3.7 | 迁移指南 | `docs/migration.md` | 从 vditor 迁移到 xlxz-markdown-editor 的对照说明 |
| 3.8 | npm 发布 | npm registry | `xlxz-markdown-editor@1.0.0` |

---

## 二、验收步骤

### 步骤 1：API 文档完整性

打开 `docs/api.md`，逐项检查：

| 检查项 | 说明 |
|--------|------|
| `createEditor()` | 参数、返回值、异常说明 |
| `EditorOptions` | 每个字段的类型、默认值、作用 |
| `EditorBackend` | 每个方法的签名、参数、返回值、可选性 |
| `EditorInstance` | 每个方法的签名、作用、示例 |
| `EditorPlugin` | interface 定义、`install`/`uninstall` 说明 |
| `PluginContext` | 可用方法和属性 |
| 所有公开类型导出 | `LinkTarget`、`SuggestConfig`、`SuggestItem`、`I18nProvider`、`AssetLoader` |

**验收标准**：每个公开接口都有文档。文档中的代码示例可以直接复制粘贴到项目中运行。

### 步骤 2：集成示例可运行

| 示例 | 操作 | 期望 |
|------|------|------|
| 纯 HTML/JS | 打开 HTML 文件 | 编辑器正常显示，可以输入和渲染 |
| Vue 3 | `bun run dev` 访问 Vue 示例页 | 编辑器作为 Vue 组件正常工作 |
| React | `bun run dev` 访问 React 示例页（如有） | 编辑器作为 React 组件正常工作 |

**验收标准**：所有示例无需额外配置即可运行。

### 步骤 3：Playground

访问 Playground 页面：

| 检查项 | 期望 |
|--------|------|
| 初始文档加载 | 预置 demo 文档正确渲染 |
| 编辑交互 | 可以自由编辑，Live Preview 正常工作 |
| 主题切换 | 可以切换暗色/亮色主题 |
| 功能展示 | 展示基础插件和可选插件的效果 |
| 控制台 | 无错误 |

**验收标准**：Playground 可以公开发布为项目的在线演示页。

### 步骤 4：迁移指南

打开 `docs/migration.md`：

| 检查项 | 期望 |
|--------|------|
| vditor API → xlxz API 对照表 | 每个常用 vditor 方法对应新 API |
| 初始化代码对比 | 旧代码 vs 新代码并排展示 |
| 图片处理迁移 | 从 `upload.handler` 到 `saveAttachment` |
| 内容读写迁移 | `getValue/setValue` → `getDoc/setDoc` |
| 已知差异说明 | 哪些行为不同、为什么 |

**验收标准**：开发者在 10 分钟内能完成基础迁移。

### 步骤 5：npm 发布验证

```bash
# 在独立测试项目中
mkdir test-install && cd test-install
bun init
bun add xlxz-markdown-editor
```

```typescript
import { createEditor } from 'xlxz-markdown-editor';
// 应能正常导入，类型提示正常
```

**验收标准**：npm install 成功，import 正常，TypeScript 类型提示正常。

---

## 三、关注点

| 关注 | 不关注 |
|------|--------|
| API 文档是否与代码实现一致（对照源码核对） | 文档排版美观度 |
| 集成示例是否真的可运行（不只是代码片段） | 示例项目的功能完整性 |
| 类型定义是否正确导出（IDE 自动补全可用） | 文档的多语言翻译 |
| Playground 是否展示了核心功能 | Playground 的 UI 设计 |
| npm 发布版本号是否正确（1.0.0） | npm 下载量 |

---

## 四、允许进入阶段 4 的标准

- [ ] `docs/api.md` 覆盖所有公开接口，代码示例可直接使用
- [ ] `docs/architecture.md` 清晰说明微内核架构和插件开发流程
- [ ] `docs/migration.md` 包含 vditor → xlxz 对照
- [ ] 纯 HTML/JS 示例可独立运行
- [ ] Vue 3 示例可独立运行
- [ ] Playground 页面可正常使用
- [ ] npm 发布成功，独立项目可安装和导入
- [ ] TypeScript 类型提示在所有示例中正常

**任一标准不满足 → 不允许进入阶段 4。**

---

## 五、人类检查要点

1. **API 文档 vs 实际行为**：选 3 个文档中的代码示例，复制到 `apps/web` 中实际运行，确认行为与文档描述一致。
2. **类型导出**：在 TypeScript 项目中 `import`，检查 IDE 是否提供正确的自动补全和类型检查。
3. **迁移指南的诚实性**：确认迁移指南中列出的"已知差异"与实际情况一致，不隐瞒、不美化。
4. **npm 发布前检查**：确认 `package.json` 的 `files` 字段正确（只包含 `dist/` 和必要文件），不泄露源码中的敏感信息。

---

> 预计人类参与时间：30 分钟
