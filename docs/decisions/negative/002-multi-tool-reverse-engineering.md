# 负向决策记录：多维逆向分析工具集

> 日期：2026-05-20
> 状态：已否决
> 归档标签：N/A（代码直接移动到 archived 目录，未创建独立分支）

---

## 尝试了什么

构建了一套 8 个专用工具用于逆向分析 `obsidian-app.patched.js`：

| 工具 | 功能 |
|------|------|
| `collect.ts` | 从 webpack module table 中提取所有模块 ID 和代码 |
| `module-extract.ts` | 按依赖关系提取特定模块的传递闭包 |
| `analyze-functions.ts` | 识别并分类所有函数定义（CM6 原生 vs Obsidian 定制 vs 第三方） |
| `class-extract.ts` | 提取类定义，识别原型方法和继承链 |
| `ast-strip.ts` | 基于 AST 删除未引用的死代码 |
| `strip-dead-code.ts` | 基于动态覆盖率删除未执行的代码段 |
| `deobfuscate.ts` | 部分还原 webpack 混淆的变量名 |
| `extract-live-code.ts` | 提取 Puppeteer 覆盖率报告标记的"热"代码段 |

这些工具总代码量约 2,200 行 TypeScript。

## 预期

建立一个可复用的逆向工程工具链，能够：
- 自动化分析 vendor 的模块结构和依赖图
- 精准识别死代码
- 为每个 `window.__*` 窄接口精确提取依赖闭包

## 实际发生了什么

在实际使用中发现了几个问题：

1. **多数工具依赖 webcrack 输出格式**：`collect.ts`、`module-extract.ts` 等都假设输入是 webcrack 反混淆后的 webpack module table 格式。webcrack 的输出格式不稳定（不同版本的模块编号可能变化），导致工具链脆弱。

2. **"死代码"的定义模糊**：静态分析和动态覆盖率得出的死代码结论常常不一致。某些代码在 Puppeteer 运行中未被覆盖，但实际上在某些边缘场景（如特定 Callout 类型）中会被执行。

3. **EBML 剥离是唯一有明确产出的操作**：在 8 个工具中，只有 `strip-ebml.ts` 产生了实际效果（从 vendor 中移除 13 个 ts-ebml 模块，-187 KB）。其余工具的分析结果都停留在了"信息收集"阶段。

4. **维护成本高于价值**：8 个独立的工具维护各自的 AST 遍历逻辑和类型假设，每当 webcrack 输出格式或 vendor 文件结构变化时，需要同步更新多个工具。

## 为什么被否决

在策略转向「恢复外部依赖」后，这个工具集失去了存在理由：

- 识别模块边界 → 不再需要，因为直接安装 npm 包替代
- 死代码分析 → 不再需要，因为用 import 替代后 webpack tree-shaking 会自动移除
- 函数分类 → 不再需要，因为目标是移除而非理解

唯一保留的工具是 `strip-ebml.ts`——它直接操作 webcrack 输出，产生可验证的大小缩减，且操作是幂等的。

## 关键教训

1. **工具应该解决具体问题，而非"探索可能性"**——8 个工具中大多数是在"看看能发现什么"，而不是"解决一个明确的问题"。

2. **单一用途工具优于通用工具链**——当 `strip-ebml.ts`（177 行）能完成同样工作时，不需要一个 2,200 行的工具集。

3. **在确认输入格式稳定之前，不要在其上构建工具链**——webcrack 输出格式的脆弱性使得整个工具链难以维护。

## 替代方案

采用单一工具 `strip-ebml.ts`（177 行），仅保留 EBML 模块链剥离功能。其余分析需求通过手动检查 vendor 文件（搭配搜索）满足。

## 关联

- 归档代码：`packages/core/e2e/coverage/archived/`（结晶过程中已删除，可通过 git history 找回）
- 保留工具：`packages/core/e2e/coverage/strip-ebml.ts`

---

> 完美是好的敌人。一个能用的 177 行工具胜过八个"即将完成"的 200 行工具。
