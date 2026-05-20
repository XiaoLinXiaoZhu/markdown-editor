# Fuzz Equivalence Testing

随机等价性测试 — 通过随机操作序列验证编辑器行为的确定性。

## 工作原理

1. **录制**：用 seeded PRNG 生成操作序列，在 vendor 版本执行，记录每步 state hash → golden file
2. **回放**：Phase 3 替换模块后，用同一 seed 回放，对比 hash 找行为分歧点

## 使用方式

### 录制 golden（当前 vendor 版本）

```bash
cd packages/core
FUZZ_SEED=42 bun test e2e/fuzz/
```

### 回放验证（替换模块后）

```bash
cd packages/core
FUZZ_MODE=replay FUZZ_SEED=42 bun test e2e/fuzz/
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `FUZZ_SEED` | `Date.now()` | 随机种子（固定值保证可复现） |
| `FUZZ_STEPS` | `200` | 每序列操作步数 |
| `FUZZ_RUNS` | `3` | 运行序列数 |
| `FUZZ_MODE` | `record` | `record` 录制 / `replay` 回放 |

### CI 推荐配置

```bash
FUZZ_SEED=42 FUZZ_STEPS=500 FUZZ_RUNS=10 FUZZ_MODE=replay bun test e2e/fuzz/
```

## 操作池

| 操作 | 权重 | 说明 |
|------|------|------|
| 输入普通字符 | 40% | a-z, 0-9, 空格, 中文 |
| 输入 Markdown 语法 | 20% | `#`, `*`, `` ` ``, `>`, `-`, 等 |
| Enter | 10% | 触发列表续行等 |
| Tab / Shift-Tab | 5% | 缩进 |
| Backspace / Delete | 10% | 删除 |
| 光标移动 | 5% | 方向键、Home/End |
| 点击行 | 5% | 触发 Live Preview 切换 |
| 选中+包围 | 5% | Markdown surround |

## 分歧诊断

失败时输出：

```
DIVERGENCE DETECTED (seed=42)
  Step 108: select+surround with '*'
  Expected hash: 79b50144
  Actual hash:   9f735580
  Doc: "..."
  Selection: [92,96]

Reproduce: FUZZ_SEED=42 bun test e2e/fuzz/
```
