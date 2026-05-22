/**
 * Theme 插件
 *
 * 管理编辑器容器的 CSS 类和 CSS 变量。
 * 设置 dark/light 主题、readable-line-width 等外观属性。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const themePlugin: EditorPlugin = {
  id: 'theme',

  install(ctx: PluginContext) {
    const { EditorView } = (window as any).__cm6;
    const opts = ctx.options;
    const editorEl = ctx.view.dom?.parentElement || ctx.view.dom;

    // 基础 CSS 类
    if (!editorEl.classList.contains('markdown-source-view')) {
      editorEl.classList.add('markdown-source-view', 'mod-cm6', 'is-live-preview');
    }
    if (opts.readableLineWidth) {
      editorEl.classList.add('is-readable-line-width');
    }

    // 主题
    if (opts.theme === 'light') {
      editorEl.classList.add('theme-light');
      editorEl.classList.remove('theme-dark');
    } else {
      editorEl.classList.add('theme-dark');
      editorEl.classList.remove('theme-light');
    }

    // CSS 变量
    if (opts.cssVariables) {
      for (const [key, value] of Object.entries(opts.cssVariables)) {
        const prop = key.startsWith('--') ? key : `--${key}`;
        editorEl.style.setProperty(prop, value as string);
      }
    }

    // 内容属性
    return EditorView.contentAttributes.of({
      spellcheck: String(opts.spellcheck ?? false),
      autocorrect: 'on',
      autocapitalize: 'on',
      contenteditable: 'true',
    });
  },
};
