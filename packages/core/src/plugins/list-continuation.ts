/**
 * List Continuation 插件
 *
 * 智能列表续行：Enter 时自动创建下一列表项，
 * 空项时按 Enter 退出列表。支持有序/无序/checkbox 列表。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

const LIST_REGEX = /^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/;

export const listContinuationPlugin: EditorPlugin = {
  id: 'list-continuation',

  install(ctx: PluginContext) {
    const { keymap } = (window as any).__cm6;
    const __newlineAndIndent = (window as any).__commands?.newlineAndIndent;

    return keymap.of([
      {
        key: 'Enter',
        run(v: any) {
          const state = v.state;
          const { head } = state.selection.main;
          const line = state.doc.lineAt(head);
          const match = LIST_REGEX.exec(line.text);
          if (!match) return false;

          const prefix = match[0];
          const blockquote = match[1] || '';
          const listMarker = match[2] || '';

          if (!blockquote && !listMarker) return false;

          // 空列表项：删除标记
          if (line.text.slice(prefix.length).trim() === '') {
            v.dispatch({
              changes: { from: line.from, to: line.to, insert: '' },
              userEvent: 'input.type',
            });
            return true;
          }

          if (listMarker) {
            let newMarker = listMarker;
            const ordNum = match[4];
            if (ordNum) {
              const sep = match[5];
              newMarker = (parseInt(ordNum) + 1) + sep;
            }
            const checkbox = match[6] !== undefined ? '[ ] ' : '';
            if (checkbox) newMarker = newMarker.replace(/\[.\] $/, '');
            const insert = '\n' + blockquote + newMarker + checkbox;
            v.dispatch({
              changes: { from: head, insert },
              selection: { anchor: head + insert.length },
              userEvent: 'input.type',
            });
          } else {
            const insert = '\n' + blockquote;
            v.dispatch({
              changes: { from: head, insert },
              selection: { anchor: head + insert.length },
              userEvent: 'input.type',
            });
          }
          return true;
        },
        shift(v: any) {
          if (__newlineAndIndent) return __newlineAndIndent(v);
          return false;
        },
        preventDefault: true,
      },
    ]);
  },
};
