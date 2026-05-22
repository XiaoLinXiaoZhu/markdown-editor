/**
 * Markdown Language 插件
 *
 * 注入 Obsidian 的自定义 Markdown 语法定义（parser + syntax highlighting），
 * 支持 wiki-link、callout、tag、embed 等扩展语法节点。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const markdownLanguagePlugin: EditorPlugin = {
  id: 'markdown-language',

  install(_ctx: PluginContext) {
    const lang = (window as any).__language;
    if (!lang) {
      console.warn('[markdown-language] Obsidian language extension not available');
      return [];
    }
    return lang;
  },
};
