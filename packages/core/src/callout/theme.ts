/**
 * Callout 主题样式
 *
 * 选择器使用 `.cm-content .cm-line.cm-callout-*` 提升特异度 (0,4,0+)，
 * 确保覆盖 Obsidian 的 HyperMD-quote 和 .cm-line 默认样式。
 */

export function createCalloutTheme(EditorView: any) {
  return EditorView.baseTheme({
    // --- 所有 callout 行共通 ---
    '.cm-content .cm-line.cm-callout-line.cm-callout-line': {
      backgroundColor: 'rgba(var(--callout-line-color, var(--callout-default)), 0.1)',
    },

    // --- 隐藏 blockquote 竖条（::before 伪元素） ---
    '.cm-content .cm-line.cm-callout-line::before': {
      display: 'none !important',
    },

    // --- 首行 ---
    '.cm-content .cm-line.cm-callout-first': {
      borderTopLeftRadius: 'var(--callout-radius, var(--radius-s))',
      borderTopRightRadius: 'var(--callout-radius, var(--radius-s))',
      paddingTop: 'calc(var(--line-height-normal, 1.5) * var(--font-text-size, 16px) * 0.5)',
      paddingBottom: 'calc(var(--line-height-normal, 1.5) * var(--font-text-size, 16px) * 0.5)',
      // Fixed height prevents widget buffer from causing 2px jump
      height: 'calc(var(--line-height-normal, 1.5) * var(--font-text-size, 16px) * 2)',
      boxSizing: 'border-box',
    },
    // 首行非激活：标题颜色 + 加粗（正常字号）
    '.cm-content .cm-line.cm-callout-first:not(.cm-callout-active)': {
      fontWeight: 'var(--callout-title-weight, 600)',
      color: 'rgb(var(--callout-line-color, var(--callout-default)))',
    },
    // 首行激活：正常样式
    '.cm-content .cm-line.cm-callout-first.cm-callout-active': {
      fontWeight: 'inherit',
      color: 'inherit',
    },

    // --- 末行 ---
    '.cm-content .cm-line.cm-callout-last': {
      borderBottomLeftRadius: 'var(--callout-radius, var(--radius-s))',
      borderBottomRightRadius: 'var(--callout-radius, var(--radius-s))',
      paddingBottom: 'calc(var(--line-height-normal, 1.5) * var(--font-text-size, 16px) * 0.5)',
    },
    // 首行同时也是末行
    '.cm-content .cm-line.cm-callout-first.cm-callout-last': {
      borderRadius: 'var(--callout-radius, var(--radius-s))',
    },

    // --- `>` 前缀占位但透明 ---
    '.cm-content .cm-line.cm-callout-line .cm-callout-hide': {
      color: 'transparent',
    },

    // --- Header widget (icon + optional label) ---
    '.cm-callout-header-widget': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5ch',
      marginRight: '1ch',
      verticalAlign: 'middle',
      color: 'rgb(var(--callout-line-color, var(--callout-default)))',
    },
    '.cm-callout-icon': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
    },
    '.cm-callout-icon svg': {
      width: '1em',
      height: '1em',
      strokeWidth: '2',
    },
    '.cm-callout-title-label': {
      whiteSpace: 'nowrap',
    },

    // --- Type-specific colors ---
    '.cm-content .cm-line.cm-callout-note': { '--callout-line-color': 'var(--callout-info)' },
    '.cm-content .cm-line.cm-callout-info': { '--callout-line-color': 'var(--callout-info)' },
    '.cm-content .cm-line.cm-callout-tip': { '--callout-line-color': 'var(--callout-tip)' },
    '.cm-content .cm-line.cm-callout-hint': { '--callout-line-color': 'var(--callout-tip)' },
    '.cm-content .cm-line.cm-callout-warning': { '--callout-line-color': 'var(--callout-warning)' },
    '.cm-content .cm-line.cm-callout-caution': { '--callout-line-color': 'var(--callout-warning)' },
    '.cm-content .cm-line.cm-callout-attention': { '--callout-line-color': 'var(--callout-warning)' },
    '.cm-content .cm-line.cm-callout-danger': { '--callout-line-color': 'var(--callout-error)' },
    '.cm-content .cm-line.cm-callout-error': { '--callout-line-color': 'var(--callout-error)' },
    '.cm-content .cm-line.cm-callout-bug': { '--callout-line-color': 'var(--callout-bug)' },
    '.cm-content .cm-line.cm-callout-success': { '--callout-line-color': 'var(--callout-success)' },
    '.cm-content .cm-line.cm-callout-check': { '--callout-line-color': 'var(--callout-success)' },
    '.cm-content .cm-line.cm-callout-done': { '--callout-line-color': 'var(--callout-success)' },
    '.cm-content .cm-line.cm-callout-question': { '--callout-line-color': 'var(--callout-question)' },
    '.cm-content .cm-line.cm-callout-help': { '--callout-line-color': 'var(--callout-question)' },
    '.cm-content .cm-line.cm-callout-faq': { '--callout-line-color': 'var(--callout-question)' },
    '.cm-content .cm-line.cm-callout-example': { '--callout-line-color': 'var(--callout-example)' },
    '.cm-content .cm-line.cm-callout-abstract': { '--callout-line-color': 'var(--callout-summary)' },
    '.cm-content .cm-line.cm-callout-summary': { '--callout-line-color': 'var(--callout-summary)' },
    '.cm-content .cm-line.cm-callout-tldr': { '--callout-line-color': 'var(--callout-summary)' },
    '.cm-content .cm-line.cm-callout-important': { '--callout-line-color': 'var(--callout-important)' },
    '.cm-content .cm-line.cm-callout-todo': { '--callout-line-color': 'var(--callout-todo)' },
    '.cm-content .cm-line.cm-callout-fail': { '--callout-line-color': 'var(--callout-fail)' },
    '.cm-content .cm-line.cm-callout-failure': { '--callout-line-color': 'var(--callout-fail)' },
    '.cm-content .cm-line.cm-callout-missing': { '--callout-line-color': 'var(--callout-fail)' },
    '.cm-content .cm-line.cm-callout-quote': { '--callout-line-color': 'var(--callout-quote)' },
    '.cm-content .cm-line.cm-callout-cite': { '--callout-line-color': 'var(--callout-quote)' },
  });
}
