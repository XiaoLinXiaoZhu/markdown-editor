/**
 * Phase 0 冒烟测试 — 验证 E2E 测试基础设施可用
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { launch, teardown } from './setup';
import {
  setDoc,
  getDoc,
  type as typeText,
  press,
  clickLine,
  getCursor,
  getLineClasses,
  getLineText,
  waitForStable,
  getCanonicalState,
} from './helpers';

describe('E2E Smoke Tests', () => {
  beforeAll(async () => {
    await launch();
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  test('编辑器启动：.cm-editor 元素存在', async () => {
    const page = (await import('./setup')).getPage();
    const exists = await page.$('.cm-editor');
    expect(exists).not.toBeNull();
  });

  test('设置文档：getDoc 返回设置的内容', async () => {
    await setDoc('Hello World');
    const doc = await getDoc();
    expect(doc).toBe('Hello World');
  });

  test('输入文本：输入后文档包含输入内容', async () => {
    await setDoc('');
    await clickLine(1, 0);
    await typeText('hello');
    const doc = await getDoc();
    expect(doc).toContain('hello');
  });

  test('Live Preview 渲染：光标离开标题行后 # 被隐藏', async () => {
    await setDoc('# Title\n\nBody text');
    // 将光标移到第 3 行，使第 1 行脱离编辑状态
    await clickLine(3, 0);
    await waitForStable();

    // 光标离开后，# 应该被隐藏，可见文本不包含 #
    const visibleText = await getLineText(1);
    expect(visibleText).not.toContain('#');
    expect(visibleText).toContain('Title');
  });

  test('行号显示：.cm-lineNumbers 元素存在', async () => {
    const page = (await import('./setup')).getPage();
    const exists = await page.$('.cm-lineNumbers');
    expect(exists).not.toBeNull();
  });

  test('Canonical state 可获取', async () => {
    await setDoc('# Test\n\nLine 3');
    await clickLine(3, 0);
    await waitForStable();

    const state = await getCanonicalState();
    expect(state.doc).toBe('# Test\n\nLine 3');
    expect(state.selection).toBeArrayOfSize(2);
    expect(state.lines.length).toBeGreaterThan(0);
  });
});
