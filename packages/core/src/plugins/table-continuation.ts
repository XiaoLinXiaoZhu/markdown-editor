/**
 * Table Continuation 插件
 *
 * 类似列表续行，在表格行末尾按 Enter 时：
 * - 非空数据行 / separator 行 → 插入一个列数匹配的空行，并格式化表格
 * - 空行（所有单元格为空）→ 删除该行（退出表格）
 */
import type { EditorPlugin, PluginContext } from '../types.js';
import { isTableLine, isSeparatorLine, findTableRanges } from '../table/detect.js';
import { formatTable } from '../table/format.js';

function isEmptyRow(text: string): boolean {
  if (!isTableLine(text)) return false;
  if (isSeparatorLine(text)) return false;
  const cells = text.trim().split('|').slice(1, -1);
  return cells.every(c => c.trim() === '');
}

function getColumnCount(doc: any, table: { firstLine: number; lastLine: number }): number {
  // Use header row to determine column count
  const headerText = doc.line(table.firstLine).text;
  return headerText.trim().split('|').slice(1, -1).length;
}

function getCellWidths(text: string): number[] {
  const cells = text.trim().split('|').slice(1, -1);
  return cells.map(c => Math.max(c.length, 3));
}

function buildEmptyRow(colCount: number, widths: number[]): string {
  const cells: string[] = [];
  for (let i = 0; i < colCount; i++) {
    const w = widths[i] || 3;
    cells.push(' '.repeat(w));
  }
  return '|' + cells.join('|') + '|';
}

export const tableContinuationPlugin: EditorPlugin = {
  id: 'table-continuation',
  deps: ['table'],

  install(_ctx: PluginContext) {
    const { keymap, Prec } = (window as any).__cm6;

    return Prec.high(keymap.of([
      {
        key: 'Enter',
        run(view: any) {
          const state = view.state;
          const { head } = state.selection.main;
          const line = state.doc.lineAt(head);
          const text = line.text;

          // Must be a table line
          if (!isTableLine(text)) return false;

          // Verify cursor is inside a valid table
          const tables = findTableRanges(state.doc);
          const table = tables.find(t =>
            line.number >= t.firstLine && line.number <= t.lastLine
          );
          if (!table) return false;

          // Case 1: Empty data row → remove it (exit table)
          if (isEmptyRow(text)) {
            view.dispatch({
              changes: { from: line.from, to: line.to, insert: '' },
              userEvent: 'input.type',
            });
            return true;
          }

          // Case 2: Non-empty row or separator → insert new empty row + format
          const colCount = getColumnCount(state.doc, table);
          const widths = getCellWidths(text);
          const emptyRow = buildEmptyRow(colCount, widths);
          const insert = '\n' + emptyRow;

          // Insert at end of current line
          view.dispatch({
            changes: { from: line.to, insert },
            selection: { anchor: line.to + insert.length },
            userEvent: 'input.type',
          });

          // Format the table after insertion
          requestAnimationFrame(() => {
            const newState = view.state;
            const newTables = findTableRanges(newState.doc);
            // Find the table that contains our cursor
            const cursor = newState.selection.main.head;
            const curLine = newState.doc.lineAt(cursor);
            const targetTable = newTables.find((t: any) =>
              curLine.number >= t.firstLine && curLine.number <= t.lastLine
            );
            if (targetTable) {
              const cursorLineNum = curLine.number;
              const change = formatTable(newState.doc, targetTable);
              if (change) {
                view.dispatch({ changes: change });
                // Restore cursor to end of the same line number
                const restoredLine = view.state.doc.line(cursorLineNum);
                view.dispatch({
                  selection: { anchor: restoredLine.to },
                });
              }
            }
          });

          return true;
        },
        preventDefault: true,
      },
    ]));
  },
};
