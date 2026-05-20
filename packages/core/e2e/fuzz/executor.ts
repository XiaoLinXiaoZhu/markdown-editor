/**
 * Fuzz 操作执行器
 *
 * 在 Puppeteer 页面上执行 fuzz 操作并收集 canonical state。
 * 
 * CanonicalState 包含：
 * - 文档文本 + 选区位置（逻辑层）
 * - 每行的 DOM 类名、子元素结构、widget 数量（渲染层）
 * 
 * 这使得 fuzz 能检测两个实现在渲染行为上的差异，
 * 不仅仅是文本等价性。
 */
import type { Page } from 'puppeteer';
import type { Action } from './actions';

/** 单行的渲染状态 */
export interface LineRenderState {
  /** 文本内容 */
  text: string;
  /** .cm-line 元素的 className */
  lineClass: string;
  /** 是否包含 widget（contenteditable=false 的元素） */
  widgetCount: number;
  /** 子元素摘要：每个直接子元素的 tag+关键class */
  children: string[];
}

export interface CanonicalState {
  /** 文档全文 */
  doc: string;
  /** 主选区 [anchor, head] */
  selection: [number, number];
  /** 文档行数 */
  lineCount: number;
  /** 每行的渲染状态（前 50 行，避免性能问题） */
  lineStates: LineRenderState[];
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

    case 'type_block':
      await page.keyboard.type(action.payload, { delay: 5 });
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

/** 获取 canonical state（含渲染层信息） */
export async function getCanonicalState(page: Page): Promise<CanonicalState> {
  return page.evaluate(() => {
    const view = (window as any).__editorView;
    if (!view) throw new Error('No editor view');
    
    const doc = view.state.doc.toString();
    const sel = view.state.selection.main;
    const lineCount = view.state.doc.lines as number;
    
    // 收集每行的渲染状态
    const lineEls = view.dom.querySelectorAll('.cm-content .cm-line');
    const maxLines = lineEls.length;
    const lineStates: any[] = [];
    
    for (let i = 0; i < maxLines; i++) {
      const el = lineEls[i] as HTMLElement;
      
      // 文本内容
      const text = el.textContent || '';
      
      // 行级 class（排序以确保确定性）
      const lineClass = [...el.classList].sort().join(' ');
      
      // Widget 数量（contenteditable=false 的元素，排除 br）
      const widgets = el.querySelectorAll('[contenteditable="false"]');
      const widgetCount = widgets.length;
      
      // 子元素摘要：所有直接子元素的 tag + 完整 class + widget 标记
      const children: string[] = [];
      const childEls = el.children;
      for (let j = 0; j < childEls.length; j++) {
        const child = childEls[j] as HTMLElement;
        const tag = child.tagName.toLowerCase();
        const cls = [...child.classList].sort().join('.');
        const isWidget = child.getAttribute('contenteditable') === 'false';
        children.push(`${tag}${cls ? '.' + cls : ''}${isWidget ? '[w]' : ''}`);
      }
      
      lineStates.push({ text, lineClass, widgetCount, children });
    }
    
    return {
      doc,
      selection: [sel.anchor, sel.head] as [number, number],
      lineCount,
      lineStates,
    };
  });
}

/** 计算 state 的 hash（包含渲染层信息） */
export function hashState(state: CanonicalState): string {
  // 构建包含渲染信息的字符串
  const parts = [
    state.doc,
    `sel:${state.selection[0]},${state.selection[1]}`,
  ];
  
  // 加入每行的渲染摘要
  for (const line of state.lineStates) {
    parts.push(`L:${line.lineClass}|${line.widgetCount}|${line.children.join(',')}`);
  }
  
  const str = parts.join('\n');
  
  // FNV-1a hash
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
