/**
 * Callout 插件
 *
 * 纯文本 Callout Live Preview：行内装饰、类型颜色、圆角背景、hover 描边。
 * 替代 Obsidian 原生的 block widget 渲染。
 */
import type { EditorPlugin, PluginContext } from '../types.js';
import { createCalloutExtension } from '../callout/index.js';

export const calloutPlugin: EditorPlugin = {
  id: 'callout',

  install(_ctx: PluginContext) {
    return createCalloutExtension();
  },
};
