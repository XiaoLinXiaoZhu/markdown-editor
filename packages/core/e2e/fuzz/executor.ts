/**
 * Fuzz 操作执行器
 *
 * 在 Puppeteer 页面上执行 fuzz 操作并收集 canonical state。
 */
import type { Page } from 'puppeteer';
import type { Action } from './actions';

export interface CanonicalState {
  doc: string;
  selection: [number, number];
  lineCount: number;
}

/** 在页面上执行单个操作 */
export async function executeAction(page: Page, action: Action): Promise<void> {
  // 确保编辑器 focused
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view?.focus();
  });

  switch (action.type) {
    case 'type_char':
    case 'type_markdown':
      await page.keyboard.type(action.payload, { delay: 10 });
      break;

    case 'enter':
    case 'tab':
    case 'backspace':
    case 'delete':
      await page.keyboard.press(action.payload as any);
      break;

    case 'shift_tab':
      await page.keyboard.down('Shift');
      await page.keyboard.press('Tab');
      await page.keyboard.up('Shift');
      break;

    case 'cursor_move':
      await page.keyboard.press(action.payload as any);
      break;

    case 'click_line': {
      const [line, ch] = action.payload.split(',').map(Number);
      await page.evaluate(
        (l: number, c: number) => {
          const view = (window as any).__editorView;
          if (!view) return;
          const lineCount = view.state.doc.lines;
          const safeLine = Math.min(l, lineCount);
          const lineInfo = view.state.doc.line(safeLine);
          const pos = Math.min(lineInfo.from + c, lineInfo.to);
          view.dispatch({ selection: { anchor: pos, head: pos } });
          view.focus();
        },
        line,
        ch,
      );
      break;
    }

    case 'select_and_surround': {
      // 选中当前行从行首开始最多 5 个字符，然后输入包围字符
      await page.evaluate(() => {
        const view = (window as any).__editorView;
        if (!view) return;
        const head = view.state.selection.main.head;
        const line = view.state.doc.lineAt(head);
        const lineLen = line.to - line.from;
        if (lineLen > 0) {
          const selLen = Math.min(3, lineLen);
          view.dispatch({ selection: { anchor: line.from, head: line.from + selLen } });
        }
      });
      await page.keyboard.type(action.payload, { delay: 10 });
      break;
    }
  }

  // 短暂等待让编辑器处理输入
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 20))));
}

/** 获取 canonical state */
export async function getCanonicalState(page: Page): Promise<CanonicalState> {
  return page.evaluate(() => {
    const view = (window as any).__editorView;
    if (!view) throw new Error('No editor view');
    const doc = view.state.doc.toString();
    const sel = view.state.selection.main;
    return {
      doc,
      selection: [sel.anchor, sel.head] as [number, number],
      lineCount: view.state.doc.lines as number,
    };
  });
}

/** 计算 state 的 hash（用于快速比较） */
export function hashState(state: CanonicalState): string {
  // 使用简单的 FNV-1a hash
  const str = `${state.doc}|${state.selection[0]},${state.selection[1]}`;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
