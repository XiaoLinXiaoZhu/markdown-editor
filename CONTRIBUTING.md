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
