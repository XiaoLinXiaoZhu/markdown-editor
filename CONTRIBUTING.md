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

本项目使用**原子化片段**管理 CHANGELOG。每个变更一个文件，发版时自动拼接。

### 目录结构

```
changelog/
├── unreleased.md        # 下个版本的变更（尚未发布时创建）
├── 2.1.0/
│   ├── added-mode-and-theme-api.md
│   ├── added-table-continuation.md
│   └── fixed-table-colors.md
└── 2.0.0/
    ├── breaking-plugin-architecture.md
    ├── breaking-rename-package.md
    └── added-input-prompter.md
```

### 片段粒度

一个片段文件 = 一个**功能单元**的完整变更说明。相关的 API 放在同一个片段中：

- `added-mode-and-theme-api.md` — setMode + getMode + setTheme + EditorMode 类型（同一功能）
- `breaking-plugin-architecture.md` — 整个插件化重构（一件大事）

不要为每个方法/每行代码创建单独片段。判断标准：能否用一句话向用户解释"这是什么变更"——如果能，就是一个片段。

### 片段内容

直接写变更说明（一行或多行），面向使用者。例如：

```markdown
`editor.setMode(mode)` — switch between IR, RAW, VIEW modes
```

### 工作流

1. **开发时**：在 `changelog/unreleased/` 下创建片段文件
2. **发版时**：将 `unreleased/` 重命名为版本号目录，运行 `bun run changelog`
3. **生成结果**：脚本读取所有片段，按版本降序 + 类型分组，输出 `CHANGELOG.md`

```bash
# 生成 CHANGELOG.md
bun run changelog
```

### 什么需要记录

- 新增功能（`added-*`）
- API 变更或行为变更（`changed-*`）
- Bug 修复（`fixed-*`）
- 移除的功能（`removed-*`）
- 不兼容变更（`breaking-*`）

### 什么不需要记录

- 纯重构（不改变外部行为）
- 测试变更
- 文档更新
- CI/CD 配置变更
