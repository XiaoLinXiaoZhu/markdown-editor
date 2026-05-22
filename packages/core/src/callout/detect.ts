/**
 * Callout 检测：识别文档中的 Obsidian callout 区域
 *
 * 规则：连续的 `> ` 开头行，首行匹配 `> [!TYPE]` 格式
 */

export interface CalloutRange {
  from: number;
  to: number;
  firstLine: number;
  lastLine: number;
  type: string; // e.g. "NOTE", "WARNING", "TIP"
}

const CALLOUT_HEADER_RE = /^>\s*\[!(\w+)\]\s*(.*)$/;
const QUOTE_LINE_RE = /^>\s?(.*)$/;

export function isCalloutHeader(text: string): boolean {
  return CALLOUT_HEADER_RE.test(text.trim());
}

export function parseCalloutType(text: string): string {
  const m = text.trim().match(CALLOUT_HEADER_RE);
  return m ? m[1].toLowerCase() : '';
}

export function isQuoteLine(text: string): boolean {
  return QUOTE_LINE_RE.test(text.trim());
}

export function findCalloutRanges(doc: any): CalloutRange[] {
  const ranges: CalloutRange[] = [];
  const lineCount = doc.lines;
  let i = 1;

  while (i <= lineCount) {
    const line = doc.line(i);
    if (isCalloutHeader(line.text)) {
      const type = parseCalloutType(line.text);
      const firstLine = i;
      let lastLine = i;

      // Extend to subsequent quote lines
      let j = i + 1;
      while (j <= lineCount) {
        const nextLine = doc.line(j);
        if (isQuoteLine(nextLine.text)) {
          lastLine = j;
          j++;
        } else {
          break;
        }
      }

      ranges.push({
        from: line.from,
        to: doc.line(lastLine).to,
        firstLine,
        lastLine,
        type,
      });

      i = lastLine + 1;
    } else {
      i++;
    }
  }

  return ranges;
}

export function cursorInCallout(state: any, callout: CalloutRange): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= callout.to && range.to >= callout.from) return true;
  }
  return false;
}

export function cursorOnLine(state: any, lineFrom: number, lineTo: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= lineTo && range.to >= lineFrom) return true;
  }
  return false;
}
