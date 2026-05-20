# Patch 001：随机等价性测试（Fuzz Equivalence Testing）

> 追加于 `incremental-replacement-plan.md`，作为 Phase 1.5 补充。

---

## 动机

手写的 38 个场景覆盖"已知重要"的路径，但无法穷举操作组合。随机测试从操作池中抽取任意行为序列，每步计算 canonical state hash，利用编辑器的纯确定性特征做等价性断言。

## 设计

### Canonical State

```typescript
interface CanonicalState {
  doc: string;                 // 文档全文
  selection: [number, number]; // [anchor, head]
  lines: Array<{
    classes: string[];         // 行 CSS class（排序后）
    text: string;              // 可见文本 textContent
  }>;
}
```

只比较语义相关状态，忽略 cursor blink、scroll position、内部 ID 等非确定性因素。

### Seeded PRNG

```typescript
const seed = process.env.FUZZ_SEED || Date.now();
const rng = createPRNG(seed);
// 失败时打印 seed，用同一 seed 可精确复现
```

### 操作池（带权重）

| 操作 | 权重 | 说明 |
|------|------|------|
| 输入普通字符 | 40% | a-z, 0-9, 空格, 中文 |
| 输入 Markdown 语法 | 20% | `#`、`*`、`[[`、`` ` ``、`>`、`-`、`=`、`~` |
| Enter | 10% | 触发列表续行等 |
| Tab / Shift-Tab | 5% | 缩进 |
| Backspace / Delete | 10% | 删除 |
| 光标移动 / 点击 | 10% | 触发 Live Preview 切换 |
| 选中后操作 | 5% | 包围测试 |

### 执行流程

```
录制阶段（Phase 1 完成后，vendor 版本）:
  1. 用 seed S 生成 N 步操作序列
  2. 在 vendor 版本上逐步执行
  3. 每步计算 canonical state → hash
  4. 保存 { seed, steps, hashes } 为 golden

回放阶段（Phase 3 每次替换后）:
  1. 用同一 seed S 生成同一操作序列
  2. 在新版本上逐步执行
  3. 每步计算 hash，与 golden 对比
  4. 第一个不匹配 = 行为分歧点
```

### 发散诊断

```
Step 47 DIVERGED (seed=1719483726, action: type("*") with selection [5,10])
  doc:  -"hello *world*"  +"hello **world*"
  line3.classes: -["cm-em"] +["cm-strong", "cm-em"]
```

### 参数

- 默认每次运行 3 个随机序列，每序列 200 步
- CI 中可加大：10 个序列 × 500 步
- 超时上限：单序列 60s

---

## 与手写测试的关系

| 手写测试 | 随机测试 |
|----------|----------|
| 断言精确，报错信息清晰 | 覆盖广，发现未知交互 |
| 验证已知关键路径 | 探索组合空间 |
| 替换时的第一道防线 | 替换后的补充验证 |

两者互补，不互斥。
