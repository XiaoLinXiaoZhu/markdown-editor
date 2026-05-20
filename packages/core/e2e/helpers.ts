/**
 * 编辑器操作工具函数
 *
 * 提供对 CM6 编辑器的高层操作原语，屏蔽 Puppeteer 细节。
 */
import type { Page } from 'puppeteer';
import { getPage } from './setup';

/** 等待渲染稳定：连续两帧 DOM 无变化 */
export async function waitForStable(timeout = 2000): Promise<void> {
  const page = getPage();
  await page.evaluate((ms) => {
    return new Promise<void>((resolve) => {
      let prev = '';
      let attempts = 0;
      const maxAttempts = ms / 50;
      function check() {
        const el = document.querySelector('.cm-content');
        const current = el?.innerHTML ?? '';
        if (current === prev && attempts > 0) {
          resolve();
        } else {
          prev = current;
          attempts++;
          if (attempts >= maxAttempts) resolve();
          else setTimeout(check, 50);
        }
      }
      // 先等一帧再开始比较
      requestAnimationFrame(() => setTimeout(check, 50));
    });
  }, timeout);
}

/** 通过 CM6 API 设置文档内容 */
export async function setDoc(content: string): Promise<void> {
  const page = getPage();
  await page.evaluate((text) => {
    const view = (window as any).__editorView;
    if (!view) throw new Error('CM6 view not found');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
  }, content);
  await waitForStable();
}

/** 获取文档全文 */
export async function getDoc(): Promise<string> {
  const page = getPage();
  return page.evaluate(() => {
    const view = (window as any).__editorView;
    if (!view) throw new Error('CM6 view not found');
    return view.state.doc.toString();
  });
}

/** 获取光标位置 { line, ch }（1-based line） */
export async function getCursor(): Promise<{ line: number; ch: number }> {
  const page = getPage();
  return page.evaluate(() => {
    const view = (window as any).__editorView;
    if (!view) throw new Error('CM6 view not found');
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    return { line: line.number, ch: pos - line.from };
  });
}

/** 设置光标到指定位置（1-based line, 0-based ch） */
export async function setCursor(line: number, ch: number): Promise<void> {
  const page = getPage();
  await page.evaluate(
    (l, c) => {
      const view = (window as any).__editorView;
      if (!view) throw new Error('CM6 view not found');
      const lineInfo = view.state.doc.line(l);
      const pos = lineInfo.from + c;
      view.dispatch({ selection: { anchor: pos, head: pos } });
      view.focus();
    },
    line,
    ch,
  );
  await waitForStable();
}

/** 点击指定行（1-based）的指定字符偏移处 */
export async function clickLine(line: number, ch = 0): Promise<void> {
  const page = getPage();
  // 先通过 CM6 API 将光标定位，再触发 focus
  await page.evaluate(
    (l, c) => {
      const view = (window as any).__editorView;
      if (!view) throw new Error('CM6 view not found');
      const lineInfo = view.state.doc.line(l);
      const pos = Math.min(lineInfo.from + c, lineInfo.to);
      view.dispatch({ selection: { anchor: pos, head: pos } });
      view.focus();
    },
    line,
    ch,
  );
  await waitForStable();
}

/** 在当前光标位置输入文本（模拟逐字输入） */
export async function type(text: string): Promise<void> {
  const page = getPage();
  // 先确保编辑器 focused
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view?.focus();
  });
  await page.keyboard.type(text, { delay: 20 });
  await waitForStable();
}

/** 按键（支持组合键如 'Enter', 'Tab', 'Shift+Tab', 'Control+s'） */
export async function press(key: string): Promise<void> {
  const page = getPage();
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view?.focus();
  });
  await page.keyboard.press(key);
  await waitForStable();
}

/** 获取指定行（1-based）的 CSS class 列表 */
export async function getLineClasses(line: number): Promise<string[]> {
  const page = getPage();
  return page.evaluate((l) => {
    const lines = document.querySelectorAll('.cm-content .cm-line');
    const el = lines[l - 1];
    if (!el) return [];
    return Array.from(el.classList);
  }, line);
}

/** 获取指定行（1-based）的可见文本 */
export async function getLineText(line: number): Promise<string> {
  const page = getPage();
  return page.evaluate((l) => {
    const lines = document.querySelectorAll('.cm-content .cm-line');
    const el = lines[l - 1];
    if (!el) return '';
    return el.textContent || '';
  }, line);
}

/** 获取指定行（1-based）的 innerHTML */
export async function getLineHTML(line: number): Promise<string> {
  const page = getPage();
  return page.evaluate((l) => {
    const lines = document.querySelectorAll('.cm-content .cm-line');
    const el = lines[l - 1];
    if (!el) return '';
    return el.innerHTML;
  }, line);
}

/** 检查指定行是否包含某个 CSS class */
export async function lineHasClass(line: number, cls: string): Promise<boolean> {
  const classes = await getLineClasses(line);
  return classes.includes(cls);
}

/** 获取 canonical state（用于 hash 对比） */
export async function getCanonicalState(): Promise<{
  doc: string;
  selection: [number, number];
  lines: Array<{ classes: string[]; text: string }>;
}> {
  const page = getPage();
  return page.evaluate(() => {
    const view = (window as any).__editorView;
    if (!view) throw new Error('CM6 view not found');

    const doc = view.state.doc.toString();
    const sel = view.state.selection.main;

    const lineEls = document.querySelectorAll('.cm-content .cm-line');
    const lines = Array.from(lineEls).map((el) => ({
      classes: Array.from(el.classList).filter((c) => c !== 'cm-line').sort(),
      text: el.textContent || '',
    }));

    return {
      doc,
      selection: [sel.anchor, sel.head] as [number, number],
      lines,
    };
  });
}

/** 选中指定范围（1-based line, 0-based ch） */
export async function selectRange(
  fromLine: number,
  fromCh: number,
  toLine: number,
  toCh: number,
): Promise<void> {
  const page = getPage();
  await page.evaluate(
    (fl, fc, tl, tc) => {
      const view = (window as any).__editorView;
      if (!view) throw new Error('CM6 view not found');
      const from = view.state.doc.line(fl).from + fc;
      const to = view.state.doc.line(tl).from + tc;
      view.dispatch({ selection: { anchor: from, head: to } });
      view.focus();
    },
    fromLine,
    fromCh,
    toLine,
    toCh,
  );
  await waitForStable();
}
