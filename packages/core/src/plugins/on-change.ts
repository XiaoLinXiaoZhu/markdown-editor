/**
 * OnChange 插件
 *
 * 监听文档变更，触发 options.onChange 回调。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const onChangePlugin: EditorPlugin = {
  id: 'on-change',

  install(ctx: PluginContext) {
    const { EditorView } = (window as any).__cm6;
    const opts = ctx.options;

    return EditorView.updateListener.of((update: any) => {
      if (update.docChanged && opts.onChange) {
        opts.onChange(update.state.doc.toString());
      }
    });
  },
};
