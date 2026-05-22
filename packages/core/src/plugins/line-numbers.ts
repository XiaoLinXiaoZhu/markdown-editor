/**
 * Line Numbers 插件
 *
 * 显示行号 + 活动行 gutter 高亮。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const lineNumbersPlugin: EditorPlugin = {
  id: 'line-numbers',

  install(_ctx: PluginContext) {
    const __lineNumbers = (window as any).__lineNumbers;
    const __activeLineGutter = (window as any).__activeLineGutter;
    const __highlightActiveLineGutter = (window as any).__highlightActiveLineGutter;

    if (!__lineNumbers) {
      console.warn('[line-numbers] lineNumbers extension not available');
      return [];
    }

    const extensions: any[] = [__lineNumbers({ fixed: false })];
    if (__activeLineGutter) extensions.push(__activeLineGutter);
    if (__highlightActiveLineGutter) extensions.push(__highlightActiveLineGutter());

    return extensions;
  },
};
