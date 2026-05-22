/**
 * Indent Guide 插件
 *
 * 显示缩进指引线。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const indentGuidePlugin: EditorPlugin = {
  id: 'indent-guide',

  install(_ctx: PluginContext) {
    const ext = (window as any).__indentGuide;
    if (!ext) {
      console.warn('[indent-guide] indentGuide extension not available');
      return [];
    }
    return ext;
  },
};
