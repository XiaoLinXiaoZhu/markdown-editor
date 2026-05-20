/**
 * 纯文本表格 Live Preview 扩展 — 入口
 *
 * 组合检测、格式化、复制按钮和主题，返回 CM6 Extension 数组
 */

import { findTableRanges, cursorInTable, isSeparatorLine } from './detect.js';
import { formatTable } from './format.js';
import { createCopyButtonWidgetClass } from './copy-widget.js';
import { createTableTheme } from './theme.js';

export function createTableExtension() {
  const { EditorView, ViewPlugin, Decoration, WidgetType } = (window as any).__cm6;

  const CopyButtonWidget = createCopyButtonWidgetClass(WidgetType);

  // Line decorations
  const tableHeaderDeco = Decoration.line({ class: 'cm-table-header' });
  const tableSepDeco = Decoration.line({ class: 'cm-table-separator' });
  const tableRowEvenDeco = Decoration.line({ class: 'cm-table-row-even' });
  const tableRowOddDeco = Decoration.line({ class: 'cm-table-row-odd' });

  const tableHeaderActiveDeco = Decoration.line({ class: 'cm-table-header cm-table-active' });
  const tableSepActiveDeco = Decoration.line({ class: 'cm-table-separator cm-table-active' });
  const tableRowEvenActiveDeco = Decoration.line({ class: 'cm-table-row-even cm-table-active' });
  const tableRowOddActiveDeco = Decoration.line({ class: 'cm-table-row-odd cm-table-active' });

  // ViewPlugin
  const tablePlugin = ViewPlugin.fromClass(class {
    decorations: any;
    private formatPending = false;

    constructor(view: any) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: any) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }

      // Defer format dispatch to avoid nested update error
      if (update.selectionSet && !update.docChanged && !this.formatPending) {
        this.formatPending = true;
        const view = update.view;
        requestAnimationFrame(() => {
          this.formatPending = false;
          this.maybeFormatTables(view);
        });
      }
    }

    maybeFormatTables(view: any) {
      const { state } = view;
      const doc = state.doc;
      const tables = findTableRanges(doc);
      const changes: any[] = [];

      for (const table of tables) {
        if (!cursorInTable(state, table)) {
          const change = formatTable(doc, table);
          if (change) changes.push(change);
        }
      }

      if (changes.length > 0) {
        view.dispatch({ changes });
      }
    }

    buildDecorations(view: any) {
      const { state } = view;
      const doc = state.doc;
      const tables = findTableRanges(doc);
      const builder: any[] = [];

      for (const table of tables) {
        const isActive = cursorInTable(state, table);
        let bodyRowIndex = 0;

        for (let lineNum = table.firstLine; lineNum <= table.lastLine; lineNum++) {
          const line = doc.line(lineNum);
          const text = line.text;

          if (lineNum === table.firstLine) {
            builder.push((isActive ? tableHeaderActiveDeco : tableHeaderDeco).range(line.from));
          } else if (isSeparatorLine(text)) {
            builder.push((isActive ? tableSepActiveDeco : tableSepDeco).range(line.from));
          } else {
            const even = bodyRowIndex % 2 === 0;
            const deco = isActive
              ? (even ? tableRowEvenActiveDeco : tableRowOddActiveDeco)
              : (even ? tableRowEvenDeco : tableRowOddDeco);
            builder.push(deco.range(line.from));
            bodyRowIndex++;
          }
        }

        // Copy button (only when not editing)
        if (!isActive) {
          const widget = Decoration.widget({
            widget: new CopyButtonWidget(table.from, table.to),
            side: 1,
          });
          builder.push(widget.range(doc.line(table.firstLine).from));
        }
      }

      builder.sort((a: any, b: any) => a.from - b.from);
      return Decoration.set(builder);
    }
  }, {
    decorations: (v: any) => v.decorations,
  });

  const tableTheme = createTableTheme(EditorView);

  return [tablePlugin, tableTheme];
}
