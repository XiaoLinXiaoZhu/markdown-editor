/**
 * 表格格式化：光标离开时自动对齐列宽
 *
 * 以各列最宽内容为基准补空格，保留对齐模式（:---, :---:, ---:）
 */

import stringWidth from 'string-width';
import { isSeparatorLine, type TableRange } from './detect.js';

function parseCells(text: string): string[] {
  return text.trim().split('|').slice(1, -1);
}

function cellContent(cell: string): string {
  return cell.trim();
}

function isSeparatorCell(text: string): boolean {
  return /^:?-+:?$/.test(text.trim());
}

function formatSeparatorCell(text: string, width: number): string {
  const trimmed = text.trim();
  const leftColon = trimmed.startsWith(':');
  const rightColon = trimmed.endsWith(':');
  const dashCount = width - (leftColon ? 1 : 0) - (rightColon ? 1 : 0);
  return (leftColon ? ':' : '') + '-'.repeat(Math.max(1, dashCount)) + (rightColon ? ':' : '');
}

function padEndVisual(str: string, targetWidth: number): string {
  const currentWidth = stringWidth(str);
  const diff = targetWidth - currentWidth;
  if (diff <= 0) return str;
  return str + ' '.repeat(diff);
}

export function formatTable(doc: any, table: TableRange): { from: number; to: number; insert: string } | null {
  const lines: string[] = [];
  for (let i = table.firstLine; i <= table.lastLine; i++) {
    lines.push(doc.line(i).text);
  }

  const rows = lines.map(l => parseCells(l).map(cellContent));
  if (rows.length < 2) return null;

  const colCount = rows[0].length;
  if (colCount === 0) return null;

  // Calculate max visual width per column (minimum 3)
  const colWidths: number[] = [];
  for (let col = 0; col < colCount; col++) {
    let maxW = 3;
    for (const row of rows) {
      const cell = row[col] || '';
      if (!isSeparatorCell(cell)) {
        maxW = Math.max(maxW, stringWidth(cell));
      }
    }
    colWidths.push(maxW);
  }

  // Rebuild formatted lines
  const formatted = rows.map((row, rowIdx) => {
    const cells: string[] = [];
    for (let col = 0; col < colCount; col++) {
      const raw = row[col] || '';
      const width = colWidths[col];
      if (isSeparatorLine(lines[rowIdx])) {
        cells.push(' ' + formatSeparatorCell(raw, width) + ' ');
      } else {
        cells.push(' ' + padEndVisual(raw, width) + ' ');
      }
    }
    return '|' + cells.join('|') + '|';
  });

  const newText = formatted.join('\n');
  const oldText = doc.sliceString(table.from, table.to);
  if (newText === oldText) return null;

  return { from: table.from, to: table.to, insert: newText };
}

/** 导出给复制按钮用 */
export { parseCells, cellContent };
