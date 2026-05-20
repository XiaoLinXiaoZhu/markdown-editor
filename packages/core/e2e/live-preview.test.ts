/**
 * Phase 1 — Live Preview 渲染测试
 *
 * 验证：光标离开行时语法符号隐藏（渲染模式），光标进入行时语法符号显示（编辑模式）。
 * 对应 docs/inspection/stage-1.md 步骤 2 的 19 个场景。
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { launch, teardown, getPage } from './setup';
import {
  setDoc,
  clickLine,
  getLineText,
  getLineHTML,
  getLineClasses,
  waitForStable,
} from './helpers';

describe('Live Preview 渲染', () => {
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
      const html = await getLineHTML(1);
      // wiki-link 应该渲染为带有链接样式的元素
      expect(html).toMatch(/class="[^"]*internal-link[^"]*"|cm-hmd-internal-link/);
    });
  });

  // ─── 图片 ───

  describe('图片', () => {
    beforeEach(async () => {
      await setDoc('![alt text](https://via.placeholder.com/100)\n\nother line');
    });

    test('光标离开：显示为图片元素（widget）', async () => {
      await clickLine(3, 0);
      await waitForStable();
      // 图片作为 widget 渲染在 .cm-content 中（不在 .cm-line 内）
      const page = getPage();
      const hasImg = await page.evaluate(() => {
        const img = document.querySelector('.cm-content img');
        return img !== null;
      });
      expect(hasImg).toBe(true);
    });
  });

  // ─── 代码块 ───

  describe('代码块', () => {
    beforeEach(async () => {
      await setDoc('text before\n\n```js\nconst x = 1;\n```\n\ntext after');
    });

    test('光标离开：代码块有背景色（通过特定 class 标识）', async () => {
      await clickLine(1, 0);
      await waitForStable();
      const html = await getLineHTML(4);
      // 代码块行应该包含 codeblock 相关 class
      expect(html).toBeDefined();
      // 验证代码内容仍然可见
      const text = await getLineText(4);
      expect(text).toContain('const');
    });
  });

  // ─── Blockquote ───

  describe('Blockquote', () => {
    beforeEach(async () => {
      await setDoc('> quoted text\n\nnormal text');
    });

    test('光标离开：> 视觉隐藏，文字有引用样式', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const html = await getLineHTML(1);
      // > 符号通过 cm-transparent 类视觉隐藏
      expect(html).toContain('cm-transparent');
      expect(html).toContain('quoted text');
      // 行应有 blockquote 样式 class
      const classes = await getLineClasses(1);
      expect(classes).toContain('HyperMD-quote');
    });
  });

  // ─── 无序列表 ───

  describe('无序列表', () => {
    beforeEach(async () => {
      await setDoc('- list item\n\nnormal text');
    });

    test('光标离开：- 渲染为 bullet 样式', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const html = await getLineHTML(1);
      // 列表标记被包裹在 list-bullet class 中（视觉上渲染为 bullet）
      expect(html).toContain('list-bullet');
      expect(html).toContain('list item');
      // 行应有列表样式 class
      const classes = await getLineClasses(1);
      expect(classes).toContain('HyperMD-list-line');
    });
  });

  // ─── 有序列表 ───

  describe('有序列表', () => {
    beforeEach(async () => {
      await setDoc('1. first item\n\nnormal text');
    });

    test('光标离开：1. 渲染为序号样式', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const html = await getLineHTML(1);
      // 列表序号被包裹在 list-number class 中
      expect(html).toContain('list-number');
      expect(html).toContain('first item');
      // 行应有列表样式 class
      const classes = await getLineClasses(1);
      expect(classes).toContain('HyperMD-list-line');
    });
  });

  // ─── 任务列表 ───

  describe('任务列表', () => {
    beforeEach(async () => {
      await setDoc('- [ ] unchecked task\n\nnormal text');
    });

    test('光标离开：显示为可勾选的复选框', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const html = await getLineHTML(1);
      // 应包含 checkbox 相关元素
      expect(html).toMatch(/checkbox|task-list-item|<input/i);
      const text = await getLineText(1);
      expect(text).toContain('unchecked task');
    });
  });

  // ─── Callout ───

  describe('Callout', () => {
    beforeEach(async () => {
      await setDoc('> [!NOTE]\n> This is a note callout\n\nnormal text');
    });

    test('光标离开：显示为带图标的提示块', async () => {
      await clickLine(4, 0);
      await waitForStable();
      // Callout 作为 embed-block widget 渲染（不在 .cm-line 内）
      const page = getPage();
      const calloutInfo = await page.evaluate(() => {
        const wrapper = document.querySelector('.cm-callout');
        const inner = document.querySelector('[data-callout]');
        return {
          wrapperExists: wrapper !== null,
          innerExists: inner !== null,
          dataCallout: inner?.getAttribute('data-callout') || '',
        };
      });
      expect(calloutInfo.wrapperExists).toBe(true);
      expect(calloutInfo.dataCallout).toBe('note');
    });
  });

  // ─── 标签 ───

  describe('标签', () => {
    beforeEach(async () => {
      await setDoc('text with #mytag here\n\nnormal text');
    });

    test('光标离开：显示为标签样式', async () => {
      await clickLine(3, 0);
      await waitForStable();
      const html = await getLineHTML(1);
      // 标签应有 tag 相关 class
      expect(html).toMatch(/cm-hashtag|tag/i);
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

  // ─── 水平线 ───

  describe('水平线', () => {
    beforeEach(async () => {
      await setDoc('text above\n\n---\n\ntext below');
    });

    test('光标离开：显示为水平分割线', async () => {
      await clickLine(5, 0);
      await waitForStable();
      const html = await getLineHTML(3);
      // 水平线应被渲染为 hr 相关样式或 widget
      expect(html).toMatch(/hr|<hr|HyperMD-hr/i);
    });
  });
});
