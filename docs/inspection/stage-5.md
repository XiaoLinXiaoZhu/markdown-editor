# 阶段 5 验收清单：Clean-Room 重写

> 阶段目标：移除对 `obsidian-app.patched.js` 的依赖，用纯开源 CM6 包重建所有 A 类和 B 类插件。
> 本阶段完成后，xlxz-markdown-editor 成为完全开源许可的项目。
> 这是技术要求最高的阶段，但验收逻辑最简单——**行为必须与阶段 4 完全一致。**

---

## 一、重写范围

逐项重写，阶段 1-4 的所有测试场景（stage-1.md 的 35 个场景、stage-2.md 的 20 个场景、stage-4.md 的 20 个场景）必须在阶段 5 后全部重新通过。

### A 类重写（完全自定义 → 纯 CM6 实现）

| # | 插件 | 原依赖 | 重写方案 |
|---|------|--------|---------|
| A1 | live-preview | `__kH` | CM6 ViewPlugin + Decoration，根据光标位置动态隐藏/显示 markdown 语法符号 |
| A2 | markdown-language | `__language` (hypermd) | `@codemirror/lang-markdown` + 自定义扩展（wiki-link、callout、tag、embed） |
| A3 | hanging-indent | `__hangingIndent` | CM6 Decoration 或 StyleModule |
| A4 | list-continuation | `__listRegex` | 自定义 keymap handler |
| A5 | frontmatter | `__frontmatterHandler` | 自定义 StreamLanguage parser 或 Language extension |
| A6 | markdown-surround | `__closeBrackets.markdownSurround` | CM6 ViewPlugin + keymap |
| A7 | wiki-link | 内嵌在 `__language` | CM6 Language extension（syntax node + decoration） |
| A8 | callout | 内嵌在 `__language` | CM6 Language extension |
| A9 | tag-render | 内嵌在 `__language` | CM6 Language extension |
| A10 | embed | 内嵌在 `__kH` | CM6 ViewPlugin |
| A11 | expand-text | 项目自写（已独立） | 保留，无需重写 |
| A12 | state-fields | `__stateFields` | CM6 StateField.define() |
| A13 | indent-commands | `__commands` | CM6 keymap + `@codemirror/language` indent API |
| A14 | html-paste | 项目自写（已独立） | 保留，无需重写 |
| A15 | attachment | 项目自写（已独立） | 保留，无需重写 |

### B 类重写（基于 CM6 扩展点 → 直接用标准 CM6 包）

| # | 插件 | 原依赖 | 重写方案 |
|---|------|--------|---------|
| B1 | close-brackets | `__closeBrackets` | `@codemirror/autocomplete` 的 `closeBrackets` |
| B2-B7 | fold / line-numbers / active-line / indent-guide | 各种 `__fold*`、`__lineNumbers` 等 | 直接用 `@codemirror/view` 和 `@codemirror/language` 的标准扩展 |
| B8 | keymap | extensions.ts 自写 | 保留，CM6 标准 API |
| B9 | suggest | 项目自写（已独立） | 保留，基于 CM6 `@codemirror/autocomplete` 重写（可选） |
| B10 | spellcheck | `contentAttributes` | 保留，CM6 标准 API |
| B11 | compartments | `__compartments` | CM6 标准 `Compartment` |

---

## 二、验收策略

**核心原则：阶段 5 的验收不是重新测试功能，而是验证"重写前和重写后行为完全一致"。**

### 步骤 1：回归测试

使用阶段 1 定义的 35 个测试场景 + 阶段 2 的 20 个测试场景 + 阶段 4 的 20 个测试场景（共 75 个场景），在 `apps/web` 和 iNote 中逐条回归。

**验收标准**：所有 75 个场景的行为与阶段 4（重写前）一致。

### 步骤 2：vendor 目录清理

| 检查项 | 期望 |
|--------|------|
| `packages/core/vendor/` 目录 | 已完全删除 |
| `obsidian-app.patched.js` | 不再存在于项目中 |
| CM5（codemirror.js） | 不再存在于项目中 |
| hypermd（markdown.js） | 不再存在于项目中 |
| enhance.js | 不再存在于项目中 |
| mock.js | 不再存在于项目中（或大幅简化） |
| 最终 bundle 大小 | 显著减小（目标 < 400KB 核心，不含可选插件） |

**验收标准**：`grep -r "obsidian-app\|__kH\|__language\|__cm6\|hypermd" packages/core/src/` 无结果（除了注释/文档中可能的历史引用）。

### 步骤 3：依赖审计

| 检查项 | 期望 |
|--------|------|
| `packages/core/package.json` 的 `dependencies` | 仅包含 MIT/Apache 2.0/BSD 许可的开源包 |
| 所有依赖的 license | 已通过 `bun run license-check` 验证 |
| `@codemirror/*` 系列包 | 作为核心依赖 |

**验收标准**：无闭源代码依赖。

### 步骤 4：iNote 最终验证

在 iNote 上运行与阶段 4 完全相同的验收步骤。

**验收标准**：行为与阶段 4 一致，无新增问题。

---

## 三、关注点

| 关注 | 不关注 |
|------|--------|
| 行为是否与重写前完全一致（regression-free） | 新功能 |
| vendor 目录是否彻底移除 | 微小的渲染差异（CSS 像素级差异可接受） |
| 依赖许可合规 | 性能是否优于重写前（持平即可，优化可在后续版本进行） |
| 构建成功、类型检查通过 | Markdown 解析器的边缘 case（可在后续 issue 中修复） |

---

## 四、允许发布 v2.0.0 的标准

- [ ] 75 个回归测试场景全部通过
- [ ] `packages/core/vendor/` 目录已删除
- [ ] `obsidian-app.patched.js` 及其所有相关全局变量引用已移除
- [ ] 核心 bundle < 400KB（不含可选插件）
- [ ] 所有运行时依赖为开源许可（MIT / Apache 2.0 / BSD）
- [ ] iNote 集成验证通过
- [ ] `bun run build` 零错误
- [ ] `bun test` 全部通过（阶段 6 引入的测试套件）

**任一标准不满足 → 不允许发布 v2.0.0。**

---

## 五、人类检查要点

1. **行为对比**：同时打开重写前（阶段 4）和重写后（阶段 5）两个版本，并排对比每个测试场景。
2. **已知差异记录**：如果某些渲染细节无法做到 100% 一致（如 hypermd parser 和 CM6 Language parser 的对齐差异），记录为 known issues 并在 release notes 中说明。
3. **license 审计**：运行 `bun licenses list` 或等效命令，确认无 copyleft（GPL）许可污染。
4. **性能对比**：用同一个 5000 行的测试文档，对比重写前后的加载时间、输入延迟。

---

> 预计人类参与时间：60-90 分钟（这是最重要的验收，需要最仔细的对比）
