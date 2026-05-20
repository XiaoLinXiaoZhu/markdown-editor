/**
 * 表格复制按钮 Widget
 *
 * 样式与 Obsidian 代码块复制按钮统一（copy-code-button 风格）
 * 点击复制 Tab 分隔格式，可直接粘贴到 Excel/Google Sheets
 */

import { isSeparatorLine } from './detect.js';
import { parseCells, cellContent } from './format.js';

export function createCopyButtonWidgetClass(WidgetType: any) {
  return class CopyButtonWidget extends WidgetType {
    tableFrom: number;
    tableTo: number;

    constructor(tableFrom: number, tableTo: number) {
      super();
      this.tableFrom = tableFrom;
      this.tableTo = tableTo;
    }

    toDOM(view: any) {
      const btn = document.createElement('button');
      btn.className = 'cm-table-copy-btn';
      btn.title = '复制表格（Tab 分隔）';

      // Lucide copy icon (inline SVG matching Obsidian style)
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const doc = view.state.doc;
        const text = doc.sliceString(this.tableFrom, this.tableTo);
        const tsv = text.split('\n')
          .filter((l: string) => !isSeparatorLine(l))
          .map((l: string) => parseCells(l).map(cellContent).join('\t'))
          .join('\n');
        navigator.clipboard.writeText(tsv);
        // Switch to check icon
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        btn.style.color = 'var(--text-success)';
        setTimeout(() => {
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          btn.style.color = '';
        }, 1500);
      });
      return btn;
    }

    eq(other: any) {
      return this.tableFrom === other.tableFrom && this.tableTo === other.tableTo;
    }

    ignoreEvent() { return true; }
  };
}
