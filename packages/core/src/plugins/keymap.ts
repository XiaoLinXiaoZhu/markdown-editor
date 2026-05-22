/**
 * Keymap 插件
 *
 * 核心快捷键：Tab 缩进、Ctrl+S 保存。
 * 注意：Enter 列表续行由 list-continuation 插件处理。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const keymapPlugin: EditorPlugin = {
  id: 'keymap',

  install(ctx: PluginContext) {
    const { keymap } = (window as any).__cm6;
    const __indentMore = (window as any).__commands?.indentMore;
    const __indentLess = (window as any).__commands?.indentLess;
    const opts = ctx.options;

    return keymap.of([
      {
        key: 'Tab',
        run(v: any) {
          if (__indentMore) return __indentMore(v);
          return false;
        },
        shift(v: any) {
          if (__indentLess) return __indentLess(v);
          return false;
        },
      },
      {
        key: 'Mod-s',
        run(v: any) {
          if (opts.onSave) opts.onSave(v.state.doc.toString());
          return true;
        },
        preventDefault: true,
      },
    ]);
  },
};
