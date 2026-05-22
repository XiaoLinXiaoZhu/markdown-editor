/**
 * Link Handler 插件
 *
 * 处理内部链接（[[link]]）和外部链接（[text](url)）的点击导航。
 * 通过 options.onLinkClick / options.onExternalLinkClick 或 backend.openFile 处理。
 */
import type { EditorPlugin, PluginContext } from '../types.js';

export const linkHandlerPlugin: EditorPlugin = {
  id: 'link-handler',

  install(ctx: PluginContext) {
    const { EditorView } = (window as any).__cm6;
    const { options: opts, backend: be, view } = ctx;
    const editorEl = view.dom?.parentElement || view.dom;

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target?.closest) return;

      // 内部链接
      const internalLink = target.closest('.internal-link, .cm-hmd-internal-link');
      if (internalLink) {
        e.preventDefault();
        e.stopPropagation();
        const linkText = (internalLink as HTMLElement).getAttribute('data-href')
          || (internalLink as HTMLElement).getAttribute('href')
          || (internalLink as HTMLElement).textContent?.trim() || '';
        if (linkText) {
          if (opts.onLinkClick) {
            opts.onLinkClick(linkText, opts.filePath || '');
          } else {
            be.openFile(linkText);
          }
        }
        return;
      }

      // 外部链接
      const externalLink = target.closest('.external-link') as HTMLElement;
      if (externalLink) {
        const href = externalLink.getAttribute('href') || externalLink.getAttribute('data-href') || '';
        if (href && /^https?:|^mailto:/.test(href)) {
          e.preventDefault();
          e.stopPropagation();
          if (opts.onExternalLinkClick) {
            opts.onExternalLinkClick(href);
          } else {
            window.open(href, '_blank');
          }
        }
        return;
      }

      // 下划线渲染的内部链接
      const underline = target.closest('.cm-underline') as HTMLElement;
      if (underline) {
        const linkParent = underline.closest('.cm-hmd-internal-link');
        if (linkParent) {
          e.preventDefault();
          e.stopPropagation();
          const pos = view.posAtDOM(underline);
          const doc = view.state.doc.toString();
          const before = doc.lastIndexOf('[[', pos);
          if (before !== -1 && before >= pos - 200) {
            const after = doc.indexOf(']]', before + 2);
            if (after !== -1 && after < pos + 200) {
              const content = doc.slice(before + 2, after);
              const pipeIdx = content.indexOf('|');
              const linkContent = pipeIdx !== -1 ? content.slice(0, pipeIdx) : content;
              if (opts.onLinkClick) {
                opts.onLinkClick(linkContent, opts.filePath || '');
              } else {
                be.openFile(linkContent);
              }
            }
          }
          return;
        }

        // 下划线渲染的外部链接
        const extParent = underline.closest('.cm-link');
        if (extParent) {
          e.preventDefault();
          e.stopPropagation();
          const urlEl = extParent.parentElement?.querySelector('.cm-url, .cm-string') as HTMLElement;
          let url = '';
          if (urlEl) {
            url = urlEl.textContent?.replace(/^\(|\)$/g, '') || '';
          }
          if (!url || !/^https?:/.test(url)) {
            const pos = view.posAtDOM(underline);
            const line = view.state.doc.lineAt(pos);
            const linkMatch = line.text.match(/\[([^\]]*)\]\(([^)]+)\)/g);
            if (linkMatch) {
              for (const m of linkMatch) {
                const urlMatch = m.match(/\(([^)]+)\)/);
                if (urlMatch && /^https?:/.test(urlMatch[1])) {
                  url = urlMatch[1];
                  break;
                }
              }
            }
          }
          if (/^https?:/.test(url)) {
            if (opts.onExternalLinkClick) {
              opts.onExternalLinkClick(url);
            } else {
              window.open(url, '_blank');
            }
          }
        }
      }
    };

    editorEl.addEventListener('click', handler);

    // Store cleanup reference in plugin state
    ctx.setState('link-handler', { cleanup: () => editorEl.removeEventListener('click', handler) });

    return [];
  },

  uninstall(ctx: PluginContext) {
    const state = ctx.getState<{ cleanup: () => void }>('link-handler');
    if (state?.cleanup) state.cleanup();
  },
};
