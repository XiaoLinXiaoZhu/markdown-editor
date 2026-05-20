/**
 * 链接点击处理
 *
 * 在编辑器容器上注册 click 事件，处理内部链接（[[link]]）和外部链接（[text](url)）的点击。
 * 通过 opts.onLinkClick / opts.onExternalLinkClick 回调或者 backend.openFile / window.open 处理导航。
 */
import type { EditorBackend, EditorOptions } from './types.js';

export function setupLinkClickHandler(
  editorEl: HTMLElement,
  view: any,
  opts: EditorOptions,
  backend: Required<EditorBackend>,
) {
  editorEl.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target?.closest) return;

    // ── 内部链接：.internal-link / .cm-hmd-internal-link ──
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
          backend.openFile(linkText);
        }
      }
      return;
    }

    // ── 外部链接：.external-link ──
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

    // ── 下划线渲染的内部链接（cm-underline + cm-hmd-internal-link） ──
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
              backend.openFile(linkContent);
            }
          }
        }
        return;
      }

      // ── 下划线渲染的外部链接 ──
      const extParent = underline.closest('.cm-link');
      if (extParent) {
        e.preventDefault();
        e.stopPropagation();
        // 尝试 DOM 提取 URL
        const urlEl = extParent.parentElement?.querySelector('.cm-url, .cm-string') as HTMLElement;
        let url = '';
        if (urlEl) {
          url = urlEl.textContent?.replace(/^\(|\)$/g, '') || '';
        }
        // 回退：从 markdown 源码提取
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
  });
}
