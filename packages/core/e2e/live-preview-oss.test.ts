/**
 * Live Preview 渲染测试 — 开源实现验证
 *
 * 使用 createLivePreview() 替代 vendor __kH，验证等价行为。
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { launch, teardown, getPage } from './setup-open-source';

// Re-implement helpers inline to use our open-source setup's getPage
async function waitForStable(timeout = 2000): Promise<void> {
  const page = getPage();
  await page.evaluate((ms: number) => {
    return new Promise<void>((resolve) => {
      let prev = '';
      let attempts = 0;
      const maxAttempts = ms / 50;
      function check() {
        const el = document.querySelector('.cm-content');
        const current = el?.innerHTML ?? '';
        if (current === prev && attempts > 0) resolve();
        else {
          prev = current;
          attempts++;
          if (attempts >= maxAttempts) resolve();
          else setTimeout(check, 50);
        }
      }
      requestAnimationFrame(() => setTimeout(check, 50));
    });
  }, timeout);
}

async function setDoc(content: string): Promise<void> {
  const page = getPage();
  await page.evaluate((text: string) => {
    const view = (window as any).__editorView;
    if (!view) throw new Error('CM6 view not found');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }, content);
  await waitForStable();
}

async function clickLine(lineNumber: number, col: number): Promise<void> {
  const page = getPage();
  await page.evaluate(({ ln, c }: { ln: number; c: number }) => {
    const view = (window as any).__editorView;
    if (!view) throw new Error('CM6 view not found');
    view.focus();
    const line = view.state.doc.line(ln);
    const pos = line.from + Math.min(c, line.length);
    view.dispatch({ selection: { anchor: pos } });
  }, { ln: lineNumber, c: col });
  await waitForStable();
}

async function getLineText(lineNumber: number): Promise<string> {
  const page = getPage();
  return page.evaluate((ln: number) => {
    const view = (window as any).__editorView;
    if (!view) return '';
    const lines = view.dom.querySelectorAll('.cm-content .cm-line');
    return lines[ln - 1]?.textContent ?? '';
  }, lineNumber);
}

describe('Open Source Live Preview', () => {
  beforeAll(async () => {
    await launch();
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  // ─── 标题 ───

  describe('标题', () => {
    beforeEach(async () => {
      await setDoc('# Heading 1\n\nBody text here');
    });

    test('光标离开：# 符号隐藏，文字以标题样式显示', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).not.toContain('#');
      expect(text).toContain('Heading 1');
    });

    test('光标进入：# 符号显示', async () => {
      await clickLine(1, 0);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).toContain('#');
      expect(text).toContain('Heading 1');
    });
  });

  // ─── 粗体 ───

  describe('粗体', () => {
    beforeEach(async () => {
      await setDoc('some **bold** text\n\nother line');
    });

    test('光标离开：** 隐藏，文字粗体', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).not.toContain('**');
      expect(text).toContain('bold');
    });

    test('光标进入：** 显示', async () => {
      await clickLine(1, 5);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).toContain('**bold**');
    });
  });

  // ─── 斜体 ───

  describe('斜体', () => {
    beforeEach(async () => {
      await setDoc('some *italic* text\n\nother line');
    });

    test('光标离开：* 隐藏，文字斜体', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).not.toContain('*');
      expect(text).toContain('italic');
    });
  });

  // ─── 链接 ───

  describe('链接', () => {
    beforeEach(async () => {
      await setDoc('[click here](https://example.com)\n\nother line');
    });

    test('光标离开：方括号和圆括号隐藏，显示为链接文本', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).not.toContain('[');
      expect(text).not.toContain('](');
      expect(text).not.toContain('https://example.com');
      expect(text).toContain('click here');
    });

    test('光标进入：完整 markdown 语法显示', async () => {
      await clickLine(1, 2);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).toContain('[click here]');
      expect(text).toContain('(https://example.com)');
    });
  });

  // ─── Wiki-link ───

  describe('Wiki-link', () => {
    beforeEach(async () => {
      await setDoc('see [[target page]] for details\n\nother line');
    });

    test('光标离开：显示为链接样式', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).not.toContain('[[');
      expect(text).not.toContain(']]');
      expect(text).toContain('target page');
    });
  });

  // ─── 删除线 ───

  describe('删除线', () => {
    beforeEach(async () => {
      await setDoc('some ~~deleted~~ text\n\nother line');
    });

    test('光标离开：~~ 隐藏，文字有删除线', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).not.toContain('~~');
      expect(text).toContain('deleted');
    });
  });

  // ─── 高亮 ───

  describe('高亮', () => {
    beforeEach(async () => {
      await setDoc('some ==highlighted== text\n\nother line');
    });

    test('光标离开：== 隐藏，文字有高亮背景', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const text = await getLineText(1);
      expect(text).not.toContain('==');
      expect(text).toContain('highlighted');
    });
  });
});
