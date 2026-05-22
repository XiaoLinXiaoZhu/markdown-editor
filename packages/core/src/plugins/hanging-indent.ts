/**
 * Hanging Indent 插件
 *
 * 列表悬挂缩进：续行文本对齐到列表标记之后。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const hangingIndentPlugin: EditorPlugin = {
  id: 'hanging-indent',

  install(_ctx: PluginContext) {
    const ext = (window as any).__hangingIndent;
    if (!ext) {
      console.warn('[hanging-indent] Extension not available');
      return [];
    }
    return ext;
  },
};
