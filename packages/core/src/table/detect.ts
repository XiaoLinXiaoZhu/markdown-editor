/**
 * 表格检测：识别文档中的 Markdown 表格区域
 *
 * 规则：连续的 | 开头/结尾行，且必须包含 separator 行（|---|）
 */

export interface TableRange {
  from: number;
  to: number;
  firstLine: number;
  lastLine: number;
}

export function isTableLine(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1;
}

export function isSeparatorLine(text: string): boolean {
  return /^\|(\s*:?-+:?\s*\|)+$/.test(text.trim());
}

export function findTableRanges(doc: any): TableRange[] {
  const ranges: TableRange[] = [];
  let blockStart: number | null = null;
  let blockFirstLine = 0;
  let blockLastLine = 0;
  let hasSeparator = false;
  const lineCount = doc.lines;

  for (let i = 1; i <= lineCount; i++) {
    const line = doc.line(i);
    if (isTableLine(line.text)) {
      if (blockStart === null) {
        blockStart = line.from;
        blockFirstLine = i;
      }
      blockLastLine = i;
      if (isSeparatorLine(line.text)) {
        hasSeparator = true;
      }
    } else {
      if (blockStart !== null && hasSeparator && blockLastLine - blockFirstLine >= 1) {
        ranges.push({
          from: blockStart,
          to: doc.line(blockLastLine).to,
          firstLine: blockFirstLine,
          lastLine: blockLastLine,
        });
      }
      blockStart = null;
      hasSeparator = false;
    }
  }
  if (blockStart !== null && hasSeparator && blockLastLine - blockFirstLine >= 1) {
    ranges.push({
      from: blockStart,
      to: doc.line(blockLastLine).to,
      firstLine: blockFirstLine,
      lastLine: blockLastLine,
    });
  }
  return ranges;
}

export function cursorInTable(state: any, table: TableRange): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= table.to && range.to >= table.from) return true;
  }
  return false;
}
