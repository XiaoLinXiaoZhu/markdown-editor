/**
 * Live Preview 插件
 *
 * 封装 Obsidian 的 __kH 渲染引擎，实现 WYSIWYG 模式：
 * 光标离开区域隐藏 markdown 语法符号，光标进入则显示原始符号。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const livePreviewPlugin: EditorPlugin = {
  id: 'live-preview',

  install(ctx: PluginContext) {
    const { livePreview: KB } = (window as any).__stateFields;
    const __kH = (window as any).__kH;
    if (!KB || !__kH) {
      console.warn('[live-preview] Obsidian runtime not available');
      return [];
    }

    const { editor: jB } = (window as any).__stateFields;
    const mockEditor = jB ? ctx.view.state.field(jB) : null;

    const extensions: any[] = [];
    extensions.push(KB.init(() => true));

    const livePreviewExts = __kH(mockEditor || ctx.view, ctx.view);
    if (livePreviewExts) {
      extensions.push(livePreviewExts);
    }

    return extensions;
  },
};
