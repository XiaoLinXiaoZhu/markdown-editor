/**
 * Phase 1 — 中文输入体验测试
 *
 * 验证全角字符自动转换为对应的 Markdown 语法字符。
 * 对应 docs/inspection/stage-1.md 步骤 5 的 3 个场景。
 *
 * 注意：这些转换由 expand-text 插件处理，直接在文档中插入全角字符后
 * 插件会自动检测并替换。我们通过 CM6 dispatch 模拟输入以触发 inputHandler。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { launch, teardown, getPage } from './setup';
import {
  setDoc,
  getDoc,
  clickLine,
  waitForStable,
} from './helpers';

/**
 * 模拟逐字输入中文字符（通过 page.keyboard.type）
 * expand-text 插件监听 input 事件来做替换
 */
async function typeChars(chars: string): Promise<void> {
  const page = getPage();
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view?.focus();
  });
  // 逐字符输入以触发 inputHandler
  for (const ch of chars) {
    await page.keyboard.type(ch, { delay: 30 });
  }
  await waitForStable();
}

describe('中文输入体验', () => {
  beforeAll(async () => {
    await launch();
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  test('全角转换：输入【【自动变为 [[', async () => {
    await setDoc('');
    await clickLine(1, 0);
    await typeChars('【【');
    const doc = await getDoc();
    expect(doc).toContain('[[');
    expect(doc).not.toContain('【');
  });

  test('全角转换：输入】】自动变为 ]]', async () => {
    await setDoc('[[link');
    await clickLine(1, 6);
    await typeChars('】】');
    const doc = await getDoc();
    expect(doc).toContain(']]');
    expect(doc).not.toContain('】');
  });

  test('带感叹号：输入！【【自动变为 ![[', async () => {
    await setDoc('');
    await clickLine(1, 0);
    await typeChars('！【【');
    const doc = await getDoc();
    expect(doc).toContain('![[');
    expect(doc).not.toContain('！');
    expect(doc).not.toContain('【');
  });
});
