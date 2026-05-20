# 结晶报告

> 日期：2026-05
> 范围：`@xlxz/markdown-editor` 仓库

---

## 一、勘探摘要

### 分支结构
- `master`：当前开发主线（3 个提交）
- `phase1/behavior-lock-tests`：Phase 1 E2E 行为锁定测试（滞后 master 1 个提交）
- `ref/`（内嵌独立 git 仓库）：md-live-preview v1.0.0 原型

### 关键发现
1. `ref/`（md-live-preview）是早期原型，已被 `packages/core/`（xlxz-markdown-editor v1.0.0）完全取代
2. 多个同名实体在 ref/ 和 packages/ 之间重复（kernel.ts, types.ts, obsidian-app.patched.js, vendor libs）
3. 项目经历了三次策略迭代：从零重写 → 增量替换 → 依赖恢复（当前策略）
4. vendor lib 文件（markdown.js, codemirror.js 等）在 ref/ 和 packages/ 之间内容完全一致

---

## 二、已归档失败实验

### 实验 1：从零重写策略
- **负向 ADR**：[docs/decisions/negative/001-from-scratch-rewrite-strategy.md](docs/decisions/negative/001-from-scratch-rewrite-strategy.md)
- **归档文档**：docs/archived/reverse-engineering-plan.md, docs/archived/incremental-replacement-plan.md
- **否决原因**：CM6 Facet 引用相等性问题 + language/live-preview 不可分割
- **替代方案**：依赖恢复策略（docs/strategy-pivot.md）
- **教训**：优先识别 vendor 内生结构（npm 包边界），而非从零重写

### 实验 2：多维逆向分析工具集
- **负向 ADR**：[docs/decisions/negative/002-multi-tool-reverse-engineering.md](docs/decisions/negative/002-multi-tool-reverse-engineering.md)
- **归档代码**：已从 packages/core/e2e/coverage/archived/ 删除（可通过 git history 找回）
- **否决原因**：8 个工具维护成本高于价值，唯一有效产出仅需 177 行工具
- **替代方案**：strip-ebml.ts（单一工具）
- **教训**：工具应解决明确问题，而非"探索可能性"

### 实验 3：OSS Live Preview 替代
- **负向 ADR**：合并入 #001（从零重写策略的组成部分）
- **归档代码**：packages/core/src/live-preview.ts 及配套测试已删除
- **否决原因**：策略转向依赖恢复后，自行重写 live preview 失去意义
- **替代方案**：继续使用 vendor `__kH`，远期通过依赖恢复精简

---

## 三、统一后的实体清单

| 实体 | 权威定义（SSOT） | 替代/废弃定义 | 状态 |
|------|-----------------|-------------|------|
| 编辑器入口 | `packages/core/src/kernel.ts` | `ref/src/create.ts` | ✅ |
| 类型定义 | `packages/core/src/types.ts` | `ref/src/types.ts` | ✅ |
| Vendor 核心 | `packages/core/vendor/obsidian-app.patched.js` | `ref/public/vendor/obsidian-app.patched.js` | ✅ |
| Live Preview | vendor `__kH`（kernel.ts L462-465） | 已删除 live-preview.ts | ✅ |
| 文档 | `docs/` | `ref/docs/` | ✅ |
| 项目路线图 | `ROADMAP.md` | — | ✅ |
| 当前策略 | `docs/strategy-pivot.md` | — | ✅ |

---

## 四、修剪清单

### 已删除文件（14 个）
- `packages/core/e2e/coverage/archived/` — 8 个旧分析工具
- `packages/core/src/live-preview.ts` — OSS rewrite 实验
- `packages/core/e2e/live-preview-oss.test.ts` — OSS 测试
- `packages/core/e2e/setup-open-source.ts` — OSS setup
- `packages/core/e2e/fuzz/compare.test.ts` — vendor vs OSS 对比
- `packages/engine/` — 旧策略残留

### 保留但标记的目录
- `docs/archived/` — 5 个历史计划文档（被负向 ADR 引用）
- `ref/` — 历史原型（gitignored，vendor 重建时用作源文件）

---

## 五、文档更新

| 文件 | 变更 |
|------|------|
| `ROADMAP.md` | 阶段 5 从"Clean-Room 重写"更新为"依赖恢复 + 精简"；D10 决策更新；许可证更新；日期更新 |
| `README.md` | 新建：项目简介、SSOT 原则、结构说明 |
| `CONTRIBUTING.md` | 新建：SSOT 原则、负向 ADR 查阅指南、vendor 修改规范 |
| `assets/negative_adr_template.md` | 新建：负向 ADR 模板 |
| `docs/decisions/negative/001-*.md` | 新建：从零重写策略负向 ADR |
| `docs/decisions/negative/002-*.md` | 新建：多维逆向工具集负向 ADR |

---

## 六、验证结果

```
bun test（packages/core）：
  29 pass / 0 fail
  ── smoke tests: 6/6
  ── live-preview tests: 23/23
```

---

> 结晶完成。此仓库的单一真相源已建立：代码见 `packages/core/src/`，策略见 `docs/strategy-pivot.md`，失败教训见 `docs/decisions/negative/`。
