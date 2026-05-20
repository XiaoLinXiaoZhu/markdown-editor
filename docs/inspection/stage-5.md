# 阶段 5 验收清单：依赖恢复 + 精简

> 阶段目标：通过识别和恢复 vendor 中内嵌的 npm 包，逐步减少对 `obsidian-app.patched.js` 的依赖。
> 本阶段完成后，xlxz-markdown-editor 成为纯开源许可的项目。
> 核心验收逻辑——**行为必须与阶段 4 完全一致。**

---

## 一、恢复范围

逐层剥离 vendor，阶段 1-4 的所有测试场景必须在每层剥离后全部重新通过。

### 第一层：第三方工具库

| # | 内嵌包 | 恢复方案 | vendor 缩减 |
|---|--------|---------|------------|
| T1 | base64-js | npm install base64-js | ~5 KB |
| T2 | buffer (feross/buffer) | npm install buffer | ~15 KB |
| T3 | events | npm install events | ~5 KB |
| T4 | hast-util-to-html 系列 | npm install hast-util-to-html | ~10 KB |

### 第二层：CM6 基础设施（关键步骤）

| # | 内嵌包 | 恢复方案 |
|---|--------|---------|
| C1 | @codemirror/state | 识别版本 → npm install @codemirror/state@version |
| C2 | @codemirror/view | npm install @codemirror/view@version |
| C3 | @codemirror/language | npm install @codemirror/language@version |
| C4 | @codemirror/commands | npm install @codemirror/commands@version |
| C5 | @codemirror/autocomplete | npm install @codemirror/autocomplete@version |

> **关键约束**：必须安装与 vendor 内嵌版本完全一致的 npm 包，确保 Facet 实例引用相同。

### 第三层：Lezer / Markdown 语法

| # | 内嵌包 | 恢复方案 |
|---|--------|---------|
| L1 | @lezer/common | npm install @lezer/common@version |
| L2 | @lezer/highlight | npm install @lezer/highlight@version |
| L3 | @lezer/lr | npm install @lezer/lr@version |
| L4 | @lezer/markdown | npm install @lezer/markdown@version |

### 第四层：Obsidian 自有逻辑（最终保留）

| # | 组件 | 处理 |
|---|------|------|
| O1 | Live Preview 渲染引擎 | 保留，最终需自行重写 |
| O2 | Markdown 语言扩展（wiki-link/callout/tag/embed） | 保留 |
| O3 | 自定义扩展（hanging-indent、list-continuation 等） | 保留 |
| O4 | 主题和 CSS 变量体系 | 保留 |

---

## 二、验收策略

**核心原则：阶段 5 的验收不是重新测试功能，而是验证"剥离前和剥离后行为完全一致"。**

### 步骤 1：回归测试

使用阶段 1 定义的测试场景（live-preview 23 测试 + 其余 E2E）在每层剥离后逐条回归。

**验收标准**：所有测试场景的行为与剥离前一致。

### 步骤 2：vendor 目录精简

| 检查项 | 期望 |
|--------|------|
| `packages/core/vendor/obsidian-app.patched.js` | 体量大幅减小（第一层后 -5%，第二层后 -40%，三层后 -55%） |
| CM5（codemirror.js） | 远期移除（被 @codemirror/* 替代） |
| hypermd（markdown.js） | 远期移除（被 @lezer/markdown 替代） |
| 最终 bundle 大小 | 显著减小（目标 < 400KB 核心，不含可选插件） |

**验收标准**：vendor 体积逐层减小，每层减小后测试全部通过。

### 步骤 3：依赖审计

| 检查项 | 期望 |
|--------|------|
| `packages/core/package.json` 的 `dependencies` | 仅包含 MIT/Apache 2.0/BSD 许可的开源包 |
| 所有依赖的 license | 已验证合规 |
| `@codemirror/*` 系列包 | 作为核心依赖 |

**验收标准**：无闭源代码依赖。

### 步骤 4：iNote 最终验证

在 iNote 上运行与阶段 4 完全相同的验收步骤。

**验收标准**：行为与剥离前一致，无新增问题。

---

## 三、关注点

| 关注 | 不关注 |
|------|--------|
| 行为是否与剥离前完全一致（regression-free） | 新功能 |
| 每层剥离后测试全部通过 | 微小的渲染差异（CSS 像素级差异可接受） |
| 依赖许可合规 | 性能是否优于剥离前（持平即可） |
| 构建成功、类型检查通过 | — |

---

## 四、允许发布 v2.0.0 的标准

- [ ] 所有 E2E 测试场景全部通过
- [ ] 前三层剥离完成，vendor 仅保留 Obsidian 自有逻辑
- [ ] 核心 bundle < 400KB（不含可选插件）
- [ ] 所有运行时依赖为开源许可（MIT / Apache 2.0 / BSD）
- [ ] iNote 集成验证通过
- [ ] `bun run build` 零错误
- [ ] `bun test` 全部通过

**任一标准不满足 → 不允许发布 v2.0.0。**

---

## 五、人类检查要点

1. **逐层验证**：每完成一层依赖恢复后，由人类确认行为等价性。
2. **Facet 兼容性**：确认 @codemirror/* 的 Facet 实例与 vendor 中剩余代码兼容。
3. **已知差异记录**：如果某些渲染细节无法做到 100% 一致，记录为 known issues。
4. **license 审计**：运行 `bun licenses list` 或等效命令，确认无 copyleft（GPL）许可污染。

---

> 预计人类参与时间：每层 15-30 分钟（分 4 次，共 1-2 小时）

