/**
 * Callout 主题样式
 *
 * 行内 decoration 实现 callout 渲染：
 * - 首行：icon + 标题（约2行高），用 padding 实现垂直居中
 * - 中间行：带底色，非激活行隐藏 `> ` 前缀
 * - 末行：额外 padding-bottom 半行高
 * - 圆角矩形背景
 */

export function createCalloutTheme(EditorView: any) {
  return EditorView.baseTheme({
    // --- 所有 callout 行共通 ---
    '.cm-callout-line': {
      backgroundColor: 'rgba(var(--callout-line-color, var(--callout-default)), 0.1)',
    },

    // --- 首行 ---
    '.cm-callout-first': {
      borderTopLeftRadius: 'var(--callout-radius, var(--radius-s))',
      borderTopRightRadius: 'var(--callout-radius, var(--radius-s))',
      // 上下各半行 padding，使总高度约为2行，内容自然居中
      paddingTop: '0.75em',
      paddingBottom: '0.75em',
    },
    // 首行非激活：标题样式
    '.cm-callout-first:not(.cm-callout-active)': {
      fontSize: 'var(--h3-size, 1.25em)',
      fontWeight: 'var(--callout-title-weight, 600)',
      color: 'rgb(var(--callout-line-color, var(--callout-default)))',
    },
    // 首行激活：保持同样 padding（同高度），正常字号
    '.cm-callout-first.cm-callout-active': {
      fontSize: 'inherit',
      fontWeight: 'inherit',
      color: 'inherit',
    },

    // --- 末行 ---
    '.cm-callout-last': {
      borderBottomLeftRadius: 'var(--callout-radius, var(--radius-s))',
      borderBottomRightRadius: 'var(--callout-radius, var(--radius-s))',
      paddingBottom: '0.75em',
    },
    // 如果首行同时也是末行（单行 callout）
    '.cm-callout-first.cm-callout-last': {
      borderRadius: 'var(--callout-radius, var(--radius-s))',
    },

    // --- Icon widget ---
    '.cm-callout-icon-widget': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '1.4em',
      height: '1.4em',
      marginRight: '0.35em',
      verticalAlign: 'middle',
      color: 'rgb(var(--callout-line-color, var(--callout-default)))',
    },
    '.cm-callout-icon-widget svg': {
      width: '100%',
      height: '100%',
    },

    // Title label (shown when no custom title text exists)
    '.cm-callout-title-label': {
      marginLeft: '0.2em',
      verticalAlign: 'middle',
    },

    // --- Type-specific colors ---
    '.cm-callout-note': { '--callout-line-color': 'var(--callout-info)' },
    '.cm-callout-info': { '--callout-line-color': 'var(--callout-info)' },
    '.cm-callout-tip': { '--callout-line-color': 'var(--callout-tip)' },
    '.cm-callout-hint': { '--callout-line-color': 'var(--callout-tip)' },
    '.cm-callout-warning': { '--callout-line-color': 'var(--callout-warning)' },
    '.cm-callout-caution': { '--callout-line-color': 'var(--callout-warning)' },
    '.cm-callout-attention': { '--callout-line-color': 'var(--callout-warning)' },
    '.cm-callout-danger': { '--callout-line-color': 'var(--callout-error)' },
    '.cm-callout-error': { '--callout-line-color': 'var(--callout-error)' },
    '.cm-callout-bug': { '--callout-line-color': 'var(--callout-bug)' },
    '.cm-callout-success': { '--callout-line-color': 'var(--callout-success)' },
    '.cm-callout-check': { '--callout-line-color': 'var(--callout-success)' },
    '.cm-callout-done': { '--callout-line-color': 'var(--callout-success)' },
    '.cm-callout-question': { '--callout-line-color': 'var(--callout-question)' },
    '.cm-callout-help': { '--callout-line-color': 'var(--callout-question)' },
    '.cm-callout-faq': { '--callout-line-color': 'var(--callout-question)' },
    '.cm-callout-example': { '--callout-line-color': 'var(--callout-example)' },
    '.cm-callout-abstract': { '--callout-line-color': 'var(--callout-summary)' },
    '.cm-callout-summary': { '--callout-line-color': 'var(--callout-summary)' },
    '.cm-callout-tldr': { '--callout-line-color': 'var(--callout-summary)' },
    '.cm-callout-important': { '--callout-line-color': 'var(--callout-important)' },
    '.cm-callout-todo': { '--callout-line-color': 'var(--callout-todo)' },
    '.cm-callout-fail': { '--callout-line-color': 'var(--callout-fail)' },
    '.cm-callout-failure': { '--callout-line-color': 'var(--callout-fail)' },
    '.cm-callout-missing': { '--callout-line-color': 'var(--callout-fail)' },
    '.cm-callout-quote': { '--callout-line-color': 'var(--callout-quote)' },
    '.cm-callout-cite': { '--callout-line-color': 'var(--callout-quote)' },
  });
}
