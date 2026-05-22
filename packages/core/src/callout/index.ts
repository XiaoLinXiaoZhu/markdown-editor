/**
 * Callout Live Preview 扩展 — 入口
 *
 * 设计：
 * - 首行（`> [!TYPE] title`）：
 *   非激活：icon + 标题文字（正常字号、加粗、类型颜色），上下各半行 padding
 *   激活：显示原始 `> [!TYPE] title`，保持相同 padding
 * - 中间行：带底色，非激活时 `> ` 前缀透明但占位
 * - 末行：额外 padding-bottom 半行
 * - 所有行正常显示行号
 * - 去掉 blockquote 竖条（通过 CSS 隐藏 ::before）
 */

import { findCalloutRanges, cursorInCallout, cursorOnLine } from './detect.js';
import { createCalloutTheme } from './theme.js';

export function createCalloutExtension() {
  const { EditorView, ViewPlugin, Decoration, WidgetType } = (window as any).__cm6;

  // --- Header widget: icon + optional type label ---
  class CalloutHeaderWidget extends WidgetType {
    type: string;
    label: string;
    constructor(type: string, label: string) {
      super();
      this.type = type;
      this.label = label;
    }
    toDOM() {
      const wrapper = document.createElement('span');
      wrapper.className = 'cm-callout-header-widget';
      wrapper.setAttribute('aria-hidden', 'true');
      // Icon — use Obsidian's icon registry
      const iconEl = document.createElement('span');
      iconEl.className = 'cm-callout-icon';
      const iconName = getCalloutIconName(this.type);
      const setIcon = (window as any).__obsidian?.setIcon;
      if (setIcon) {
        setIcon(iconEl, iconName);
      }
      wrapper.appendChild(iconEl);
      // Label
      if (this.label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'cm-callout-title-label';
        labelEl.textContent = this.label;
        wrapper.appendChild(labelEl);
      }
      return wrapper;
    }
    eq(other: CalloutHeaderWidget) {
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
            // Non-active first line: replace entire content with header widget
            const text = line.text;
            const match = text.match(/^>\s*\[!\w+\]\s*(.*)?$/);
            if (match) {
              const title = match[1]?.trim();
              const label = title || capitalizeFirst(callout.type);
              // Hide `> ` prefix (transparent but occupies space) — same as body lines
              const prefixMatch = text.match(/^>\s?/);
              const prefixLen = prefixMatch ? prefixMatch[0].length : 0;
              if (prefixLen > 0) {
                builder.push(
                  Decoration.mark({ class: 'cm-callout-hide' }).range(line.from, line.from + prefixLen)
                );
              }
              // Widget replaces only the content after prefix
              builder.push(
                Decoration.replace({
                  widget: new CalloutHeaderWidget(callout.type, label),
                }).range(line.from + prefixLen, line.to)
              );
            }
          } else if (lineNum !== callout.firstLine && !isLineActive) {
            // Non-active body/last line: hide `> ` with mark (transparent but occupies space)
            const text = line.text;
            const match = text.match(/^>\s?/);
            if (match) {
              const prefixEnd = line.from + match[0].length;
              builder.push(
                Decoration.mark({ class: 'cm-callout-hide' }).range(line.from, prefixEnd)
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

function getCalloutIconName(type: string): string {
  const icons: Record<string, string> = {
    note: 'lucide-pencil',
    info: 'lucide-info',
    tip: 'lucide-flame',
    warning: 'lucide-alert-triangle',
    danger: 'lucide-zap',
    error: 'lucide-zap',
    bug: 'lucide-bug',
    example: 'lucide-list',
    question: 'help-circle',
    success: 'lucide-check',
    abstract: 'lucide-clipboard-list',
    todo: 'lucide-check-circle-2',
    important: 'lucide-flame',
    quote: 'quote-glyph',
    fail: 'lucide-x',
  };
  const aliases: Record<string, string> = {
    hint: 'tip', caution: 'warning', attention: 'warning',
    failure: 'fail', missing: 'fail',
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
