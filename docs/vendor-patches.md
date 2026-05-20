# Vendor Patches 记录

> 本文档记录对 `packages/core/vendor/obsidian-app.patched.js` 的所有人工修改。
> 基准：webcrack 反混淆输出（从 `ref/public/vendor/obsidian-app.patched.js` 处理得到）。
> 每次修改 vendor 后必须更新此文档。

---

## Patch 1: Electron/Require Mock（原始 patch）

**位置**：文件头部 L1-51
**来源**：项目初始化时添加
**作用**：模拟 Electron 环境，使 Obsidian 运行时可在浏览器中加载

```js
window.electron = { ipcRenderer: {...}, remote: {...}, clipboard: {...}, shell: {...} };
window.require = function(m) { if (m === "electron") return window.electron; return {}; };
```

---

## Patch 2: ts-ebml 模块链移除（-187 KB）

**位置**：webpack module table（L53-9590 区域）
**工具**：`packages/core/e2e/coverage/strip-ebml.ts`
**Commit**：`e6b8b7d`

**修改内容**：
- Module 8246 stub 化：`exports.default = (blob) => Promise.resolve(blob)`
- 移除 13 个仅被 8246 传递依赖的模块：9742 (base64-js), 645 (ieee754), 8166 (buffer), 4370 (EBML schema), 1166 (int64-buffer), 3210 (ts-ebml tools), 8031 (Encoder), 190 (helper), 2800 (Decoder), 1381 (Reader), 1384 (barrel), 4990 (types), 7187 (EventEmitter)

**影响**：音频录制器的 `makeMetadataSeekable` 功能失效（录音文件不可 seek），编辑器功能不受影响。

---

## Patch 3: 禁用交互式表格 Widget

**位置**：Live Preview decoration builder 中的表格检测
**搜索标记**：`false /* table widget disabled`

**修改内容**：
```js
// 原始：
if (J.has("HyperMD-table-row")) {

// 修改为：
if (false /* table widget disabled — using plain text extension */) {
```

**原因**：Obsidian 的交互式表格需要 `editTableCell` 方法（创建 sub-editor），我们的环境不提供完整的 MarkdownEditor 实例。禁用后由 `src/table/` 自定义扩展接管表格渲染。

---

## Patch 4: setCellFocus No-op

**位置**：`t.prototype.setCellFocus`
**搜索标记**：`table cell editing disabled`

**修改内容**：
```js
// 原始：
t.prototype.setCellFocus = function (e, t, n) {
  if (this.isMalformed) { this.dispatchTable(e, t, n); }
  else { this.receiveCellFocus(e, t, n, true); }
};

// 修改为：
t.prototype.setCellFocus = function (e, t, n) {
  // Patched: table cell editing disabled (no sub-editor in this environment)
  return;
};
```

**原因**：与 Patch 3 配合。即使表格 widget 被禁用，某些残余代码路径仍可能调用 setCellFocus，此 patch 防止 crash。

---

## Patch 5: receiveCellFocus Guard

**位置**：`t.prototype.receiveCellFocus`
**搜索标记**：`typeof s.editTableCell !== 'function'`

**修改内容**：在函数开头添加 guard + try-catch：
```js
if (!s || typeof s.editTableCell !== 'function') return;
try { ... } catch (err) { return; }
```

**原因**：防御性编程，即使 editTableCell 存在但返回不兼容对象时也不 crash。

---

## Kernel 侧修改（非 vendor patch）

以下修改在 `packages/core/src/kernel.ts` 中，不修改 vendor 文件：

### K1: editor state field 使用 mockEditor

```js
// 原始（仅提供 EditorView）：
stateExtensions.push(jB.init(() => view));

// 修改为（提供完整 mock）：
stateExtensions.push(jB.init(() => mockEditor));
```

mockEditor 包含 `editTableCell` stub、`cm: view`、`app`、`addChild`/`removeChild` 等。

### K2: `···` → `` ``` `` 自动转换

**Commit**：`207be98`
**位置**：`setupExpandText()` 中的 rules 数组

```js
{ regex: /···$/, replace: () => '```' },
```

中文输入法下 `···`（三个中点）自动转换为代码块围栏。与 `【【→[[`、`】】→]]` 同一机制。

---

## 重建 Vendor 的步骤

如需从原始文件重新生成当前 vendor：

```bash
# 1. webcrack 反混淆
webcrack ref/public/vendor/obsidian-app.patched.js -o output -f

# 2. 复制 deobfuscated 输出
cp output/deobfuscated.js packages/core/vendor/obsidian-app.patched.js

# 3. 运行 EBML strip
bun run packages/core/e2e/coverage/strip-ebml.ts

# 4. 手动应用 Patch 3-5（搜索标记定位）
# 搜索 "HyperMD-table-row" → 改为 if (false ...)
# 搜索 "setCellFocus" → 改为 return;
# 搜索 "receiveCellFocus" → 添加 guard
```

---

## 验证

每次修改 vendor 后运行：
```bash
cd packages/core && bun test e2e/
```

预期：全部 E2E 测试通过
