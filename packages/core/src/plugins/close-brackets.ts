/**
 * Close Brackets 插件
 *
 * 自动配对括号和 Markdown 标记（基于 Obsidian 的 closeBrackets 扩展）。
 * 支持 ()[]{}'"*_` 以及 ``` 的自动配对。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const closeBracketsPlugin: EditorPlugin = {
  id: 'close-brackets',

  install(ctx: PluginContext) {
    const { EditorState, keymap } = (window as any).__cm6;
    const closeBrackets = (window as any).__closeBrackets;
    if (!closeBrackets) {
      console.warn('[close-brackets] Obsidian closeBrackets extension not available');
      return [];
    }

    const { inputHandler: pT, stateField: lT, keymap: fT, markdownSurround: iB } = closeBrackets;
    if (!pT || !lT || !fT) return [];

    const opts = ctx.options;
    const brackets: string[] = [];
    if (opts.autoPairBrackets !== false) brackets.push('(', '[', '{', "'", '"');
    if (opts.autoPairMarkdown !== false) brackets.push('*', '_', '`', '```');

    const extensions: any[] = [
      pT,
      lT,
      keymap.of(fT),
      EditorState.languageData.of(() => [{ closeBrackets: { brackets } }]),
    ];

    if (iB) extensions.push(iB);

    // Frontmatter handler (related to bracket behavior)
    const frontmatterHandler = (window as any).__frontmatterHandler;
    if (frontmatterHandler) extensions.push(frontmatterHandler);

    return extensions;
  },
};
