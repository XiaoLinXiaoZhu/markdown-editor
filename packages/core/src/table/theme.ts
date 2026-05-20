/**
 * 表格主题样式
 *
 * 无 border（避免内容跳动），仅使用背景色区分行
 * 复制按钮样式与 Obsidian code-block-flair 统一
 * 所有颜色使用全局 CSS 变量
 */

export function createTableTheme(EditorView: any) {
  return EditorView.baseTheme({
    // 共通：等宽字体
    '.cm-table-header, .cm-table-separator, .cm-table-row-even, .cm-table-row-odd': {
      fontFamily: 'var(--font-monospace)',
      position: 'relative',
    },
    // Header 行
    '.cm-table-header': {
      backgroundColor: 'var(--table-header-bg, rgba(80, 120, 200, 0.15))',
      fontWeight: '600',
    },
    // Separator 行 — 非编辑态：暗淡融入背景
    '.cm-table-separator': {
      backgroundColor: 'var(--table-separator-bg, rgba(80, 120, 200, 0.04))',
      color: 'var(--text-faint)',
    },
    // Separator 行 — 编辑态：比正常文本淡
    '.cm-table-active.cm-table-separator': {
      backgroundColor: 'var(--table-separator-bg, rgba(80, 120, 200, 0.04))',
      color: 'var(--text-muted)',
    },
    // 数据行交替
    '.cm-table-row-even': {
      backgroundColor: 'var(--table-row-even-bg, rgba(80, 140, 220, 0.06))',
    },
    '.cm-table-row-odd': {
      backgroundColor: 'var(--table-row-odd-bg, rgba(80, 140, 220, 0.12))',
    },
    // 编辑态：更淡
    '.cm-table-active.cm-table-header': {
      backgroundColor: 'rgba(80, 120, 200, 0.10)',
    },
    '.cm-table-active.cm-table-row-even': {
      backgroundColor: 'rgba(80, 140, 220, 0.04)',
    },
    '.cm-table-active.cm-table-row-odd': {
      backgroundColor: 'rgba(80, 140, 220, 0.08)',
    },
    // 复制按钮（与 code-block-flair 风格统一）
    '.cm-table-copy-btn': {
      position: 'absolute',
      right: '6px',
      top: '6px',
      zIndex: '1',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--size-4-1) var(--size-4-2)',
      borderRadius: 'var(--code-radius, 4px)',
      border: 'none',
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      cursor: 'var(--cursor)',
      fontSize: 'var(--font-ui-smaller)',
      fontFamily: 'var(--font-interface)',
      opacity: '0',
      transition: 'opacity 0.15s',
    },
    '.cm-table-header:hover .cm-table-copy-btn': {
      opacity: '1',
    },
    '.cm-table-copy-btn:hover': {
      opacity: '1',
      backgroundColor: 'var(--background-modifier-hover)',
    },
    // | 字符可见度控制（覆盖 Obsidian 的 cm-hmd-table-sep 规则）
    // 非编辑态：| 暗淡
    '.cm-table-header span[class*="cm-hmd-table-sep"], .cm-table-separator span[class*="cm-hmd-table-sep"], .cm-table-row-even span[class*="cm-hmd-table-sep"], .cm-table-row-odd span[class*="cm-hmd-table-sep"]': {
      color: 'var(--text-faint)',
    },
    // 编辑态：| 稍亮
    '.cm-table-active span[class*="cm-hmd-table-sep"]': {
      color: 'var(--text-muted)',
    },
  });
}
