/**
 * Hanging Indent 插件
 *
 * 列表悬挂缩进：续行文本对齐到列表标记之后。
 *
 * 实现已从 vendor 全局 `window.__hangingIndent` 迁移为本仓库 1:1 逆向的独立实现
 * （见 ../hanging-indent/index.ts）。不再依赖 vendor 暴露该扩展。
 */
import type { EditorPlugin, PluginContext } from '../types.js';
import { createHangingIndentExtension } from '../hanging-indent/index.js';

export const hangingIndentPlugin: EditorPlugin = {
  id: 'hanging-indent',

  install(_ctx: PluginContext) {
    if (!(window as any).__cm6 || !(window as any).__cm6_packages) {
      console.warn('[hanging-indent] CM6 runtime not available');
      return [];
    }
    return createHangingIndentExtension();
  },
};
