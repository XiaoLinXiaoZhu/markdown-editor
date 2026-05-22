/**
 * Expand Text 插件
 *
 * 中文括号自动转换：
 * - 【【 → [[
 * - ！【【 → ![[
 * - 】】 → ]]
 * - ··· → ```
 */
import type { EditorPlugin, PluginContext } from '../types.js';

const RULES = [
  { regex: /(！)?【【$/, replace: (m: RegExpMatchArray) => m[1] ? '![[' : '[[' },
  { regex: /】】$/, replace: () => ']]' },
  { regex: /···$/, replace: () => '```' },
];

export const expandTextPlugin: EditorPlugin = {
  id: 'expand-text',

  install(ctx: PluginContext) {
    const { EditorView } = (window as any).__cm6;

    return EditorView.updateListener.of((update: any) => {
      if (!update.docChanged) return;
      const isUserInput = update.transactions.some((tr: any) => tr.isUserEvent('input'));
      if (!isUserInput) return;

      const state = update.state;
      const cursor = state.selection.main.head;
      const line = state.doc.lineAt(cursor);
      const textBefore = line.text.slice(0, cursor - line.from);

      for (const rule of RULES) {
        const match = textBefore.match(rule.regex);
        if (match) {
          const replaceText = rule.replace(match);
          const from = cursor - match[0].length;
          setTimeout(() => {
            ctx.view.dispatch({
              changes: { from, to: cursor, insert: replaceText },
              selection: { anchor: from + replaceText.length },
              userEvent: 'input.type',
            });
          }, 0);
          break;
        }
      }
    });
  },
};
