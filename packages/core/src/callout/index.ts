/**
 * Callout Live Preview 扩展 — 入口
 *
 * 设计：
 * - 首行（`> [!TYPE] title`）：
 *   非激活：icon + 标题文字，约2行高，垂直居中，h3 字号
 *   激活：显示原始 `> [!TYPE] title`，保持相同行高（垂直居中）
 * - 中间行：带底色，非激活时隐藏 `> ` 前缀（replace decoration）
 * - 末行：额外 padding-bottom 半行
 * - 所有行正常显示行号
 * - 圆角矩形通过首行/末行 border-radius
 * - 非激活行 `>` 隐藏由 CSS 透明色控制（formatting-quote span）
 */

import { findCalloutRanges, cursorInCallout, cursorOnLine } from './detect.js';
import { createCalloutTheme } from './theme.js';

export function createCalloutExtension() {
  const { EditorView, ViewPlugin, Decoration, WidgetType } = (window as any).__cm6;

  // --- Icon widget for non-active first line ---
  class CalloutIconWidget extends WidgetType {
    type: string;
    label: string;
    constructor(type: string, label: string) {
      super();
      this.type = type;
      this.label = label;
    }
    toDOM() {
      const span = document.createElement('span');
      span.className = 'cm-callout-icon-widget';
      span.setAttribute('aria-hidden', 'true');
      span.innerHTML = getCalloutIcon(this.type);
      if (this.label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'cm-callout-title-label';
        labelEl.textContent = this.label;
        span.appendChild(labelEl);
      }
      return span;
    }
    eq(other: CalloutIconWidget) {
      return this.type === other.type && this.label === other.label;
    }
    ignoreEvent() { return true; }
  }

  // ViewPlugin
  const calloutViewPlugin = ViewPlugin.fromClass(class {
    decorations: any;

    constructor(view: any) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: any) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: any) {
      const { state } = view;
      const doc = state.doc;
      const callouts = findCalloutRanges(doc);
      const builder: any[] = [];

      for (const callout of callouts) {
        const isActive = cursorInCallout(state, callout);
        const typeClass = `cm-callout-${callout.type}`;

        for (let lineNum = callout.firstLine; lineNum <= callout.lastLine; lineNum++) {
          const line = doc.line(lineNum);
          const isLineActive = cursorOnLine(state, line.from, line.to);

          // Build class list for line decoration
          const classes: string[] = ['cm-callout-line', typeClass];
          if (lineNum === callout.firstLine) classes.push('cm-callout-first');
          if (lineNum === callout.lastLine) classes.push('cm-callout-last');
          if (lineNum !== callout.firstLine && lineNum !== callout.lastLine) classes.push('cm-callout-body');
          if (isLineActive) classes.push('cm-callout-active');

          // Line decoration (background + position styling)
          builder.push(
            Decoration.line({ class: classes.join(' ') }).range(line.from)
          );

          if (lineNum === callout.firstLine && !isLineActive) {
            // Non-active first line: replace `> [!TYPE] ` with icon widget
            const text = line.text;
            const match = text.match(/^>\s*\[!\w+\]\s*/);
            if (match) {
              const syntaxEnd = line.from + match[0].length;
              const remaining = text.slice(match[0].length).trim();
              // If no title text remains, show the type name as label
              const label = remaining ? '' : capitalizeFirst(callout.type);
              builder.push(
                Decoration.replace({
                  widget: new CalloutIconWidget(callout.type, label),
                }).range(line.from, syntaxEnd)
              );
            }
          } else if (lineNum !== callout.firstLine && !isLineActive) {
            // Non-active body/last line: hide `> ` prefix with replace
            const text = line.text;
            const match = text.match(/^>\s?/);
            if (match) {
              const prefixEnd = line.from + match[0].length;
              builder.push(
                Decoration.replace({}).range(line.from, prefixEnd)
              );
            }
          }
        }
      }

      builder.sort((a: any, b: any) => a.from - b.from || (a.startSide || 0) - (b.startSide || 0));
      return Decoration.set(builder);
    }
  }, {
    decorations: (v: any) => v.decorations,
  });

  const calloutTheme = createCalloutTheme(EditorView);

  return [calloutViewPlugin, calloutTheme];
}

function getCalloutIcon(type: string): string {
  // All icons use currentColor so they inherit from parent .cm-callout-icon-widget color
  const icons: Record<string, string> = {
    note: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    tip: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10a5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 1.5-3.5C9.5 5.5 11 5 12 2z"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    danger: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    bug: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>',
    example: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    question: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    abstract: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
    todo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    important: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10a5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 1.5-3.5C9.5 5.5 11 5 12 2z"/></svg>',
    quote: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>',
  };
  const aliases: Record<string, string> = {
    hint: 'tip', caution: 'warning', attention: 'warning',
    fail: 'danger', failure: 'danger', missing: 'danger',
    check: 'success', done: 'success',
    help: 'question', faq: 'question',
    summary: 'abstract', tldr: 'abstract',
    cite: 'quote',
  };
  const resolved = aliases[type] || type;
  return icons[resolved] || icons['note'];
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
