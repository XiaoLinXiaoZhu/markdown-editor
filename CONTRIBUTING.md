# 贡献指南

## SSOT 原则

此仓库遵循「单一真相源」（Single Source of Truth）原则：

1. **代码**：`packages/core/src/` 中的 `.ts` 文件是唯一权威定义。不存在于该目录下的同名文件应视为废弃或实验代码。
2. **文档**：`docs/` 是唯一权威文档目录。`docs/archived/` 为已归档的历史文档，不保证时效性。
3. **策略**：当前架构策略为「依赖恢复」，权威文档为 `docs/strategy-pivot.md`。

## 如何查阅失败实验

所有已否决的实验均记录在 [docs/decisions/negative/](docs/decisions/negative/) 中（负向 ADR）。

每个负向 ADR 包含：
- 尝试了什么
- 为什么被否决
- 关键教训
- 替代方案

## 修改 Vendor 文件

修改 `packages/core/vendor/obsidian-app.patched.js` 后，必须：
1. 更新 `docs/vendor-patches.md` 记录修改内容
2. 运行 `bun test e2e/` 验证

## 提交规范

- 提交信息应说明改了什么以及为什么（中文或英文均可）
- 不应包含「任务级上下文」（如「为 X 功能添加」），这些信息属于文档范畴

## CHANGELOG 管理

本项目使用 [Keep a Changelog](https://keepachangelog.com/) 格式维护 `CHANGELOG.md`。

### 规则

1. **每个有意义的变更**都应在 `CHANGELOG.md` 的 `## [Unreleased]` 区域追加条目
2. 条目按类型分组：`Added`、`Changed`、`Fixed`、`Removed`、`Breaking Changes`
3. 发版时将 `[Unreleased]` 重命名为版本号 + 日期（如 `## [2.1.0] — 2026-06`）
4. 条目应面向使用者编写——说明行为变化，而非实现细节

### 什么需要记录

- 新增功能（`Added`）
- API 变更或行为变更（`Changed`）
- Bug 修复（`Fixed`）
- 移除的功能（`Removed`）
- 不兼容变更（`Breaking Changes`）

### 什么不需要记录

- 纯重构（不改变外部行为）
- 测试变更
- 文档更新
- CI/CD 配置变更

### 提交与 CHANGELOG 的关系

提交信息使用 Conventional Commits 格式（`feat:` / `fix:` / `refactor:` 等）。CHANGELOG 条目从提交信息中提炼，但措辞面向使用者而非开发者。例如：

- Commit: `feat(table): 表格智能续行——Enter 插入空行 / 空行退出 + 自动格式化`
- CHANGELOG: `**Table continuation**: pressing Enter in a table row inserts an empty row; pressing Enter on an empty row exits the table`
