/**
 * Base Extensions 插件
 *
 * 加载 Obsidian 的基础扩展集（通过 compartment），
 * 以及核心 StateField（editor/owner）的注入。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const baseExtensionsPlugin: EditorPlugin = {
  id: 'base-extensions',

  install(ctx: PluginContext) {
    const { EditorState } = (window as any).__cm6;
    const { editor: jB, owner: WB } = (window as any).__stateFields;
    const { base: ZB } = (window as any).__compartments;
    const __indentUnit = (window as any).__indentUnit;

    const opts = ctx.options;
    const extensions: any[] = [];

    // StateField: editor mock
    if (jB) {
      const mockEditor = ctx.getState<any>('__mockEditor');
      if (mockEditor) extensions.push(jB.init(() => mockEditor));
    }

    // StateField: owner mock
    if (WB) {
      const mockOwner = ctx.getState<any>('__mockOwner');
      if (mockOwner) extensions.push(WB.init(() => mockOwner));
    }

    // Tab / indent
    const tabSize = opts.tabSize ?? 4;
    const indent = opts.useTab !== false ? '\t' : ' '.repeat(Math.min(Math.max(tabSize, 2), 4));
    extensions.push(EditorState.tabSize.of(tabSize));
    if (__indentUnit) extensions.push(__indentUnit.of(indent));

    // Base extensions compartment
    if ((window as any).__baseExtensions && ZB) {
      extensions.push(ZB.of((window as any).__baseExtensions));
    }

    return extensions;
  },
};
