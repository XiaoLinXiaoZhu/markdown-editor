/**
 * Fold 插件
 *
 * 标题折叠 + 缩进折叠 + 折叠 UI（gutter 按钮）。
 * 根据 options.foldHeading / options.foldIndent 决定启用哪些折叠模式。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const foldPlugin: EditorPlugin = {
  id: 'fold',

  install(ctx: PluginContext) {
    const opts = ctx.options;
    if (!opts.foldHeading && !opts.foldIndent) return [];

    const foldGutter = (window as any).__foldGutter;
    const foldExtensions = (window as any).__foldExtensions;
    const foldHeading = (window as any).__foldHeading;
    const foldIndent = (window as any).__foldIndent;
    const foldEffect = (window as any).__foldEffect;

    if (!foldGutter || !foldExtensions) {
      console.warn('[fold] Fold extensions not available');
      return [];
    }

    const extensions: any[] = [];
    extensions.push(foldGutter());
    extensions.push(...foldExtensions);

    if (opts.foldHeading && foldHeading) extensions.push(foldHeading);
    if (opts.foldIndent && foldIndent) extensions.push(foldIndent);
    if (foldEffect) extensions.push(foldEffect);

    // Side effect: add CSS class for fold styling
    const container = ctx.view.dom?.parentElement;
    if (container) container.classList.add('is-folding');

    return extensions;
  },
};
