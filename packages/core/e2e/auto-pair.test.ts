/**
 * Phase 1 — 自动配对测试
 *
 * 验证括号、Markdown 标记的自动配对和选中包围行为。
 * 对应 docs/inspection/stage-1.md 步骤 4 的 6 个场景。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { launch, teardown } from './setup';
import {
  setDoc,
  getDoc,
  clickLine,
  setCursor,
  getCursor,
  type as typeText,
  press,
  selectRange,
  waitForStable,
} from './helpers';

describe('自动配对', () => {
  beforeAll(async () => {
    await launch();
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  test('括号配对：输入 ( 自动补 )，光标在中间', async () => {
    await setDoc('');
    await clickLine(1, 0);
    await typeText('(');
    const doc = await getDoc();
    expect(doc).toContain('()');
    // 光标应在括号中间
    const cursor = await getCursor();
    expect(cursor.ch).toBe(1); // 在 ( 和 ) 之间
  });

  test('粗体配对：* 自动配对，输入第二个 * 跳过配对符', async () => {
    await setDoc('');
    await clickLine(1, 0);
    // 输入第一个 * 触发配对，得到 ** 光标在中间
    await typeText('*');
    let doc = await getDoc();
    expect(doc).toBe('**');
    let cursor = await getCursor();
    expect(cursor.ch).toBe(1); // 光标在两个 * 中间
    // 输入第二个 * 跳过配对的闭合符
    await typeText('*');
    doc = await getDoc();
    expect(doc).toBe('**');
    cursor = await getCursor();
    expect(cursor.ch).toBe(2); // 光标跳到末尾
  });

  test('代码配对：输入 ` 自动补 `', async () => {
    await setDoc('');
    await clickLine(1, 0);
    await typeText('`');
    const doc = await getDoc();
    expect(doc).toBe('``');
    const cursor = await getCursor();
    expect(cursor.ch).toBe(1);
  });

  test('代码块配对：输入 ``` 自动补 ```', async () => {
    await setDoc('');
    await clickLine(1, 0);
    await typeText('```');
    const doc = await getDoc();
    // 应该生成配对的代码块围栏
    expect(doc).toContain('```');
    // 计算 ``` 出现次数，应为偶数（开+闭）
    const matches = doc.match(/```/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test('选中包围：选中 hello 后输入 * 变为 *hello*', async () => {
    await setDoc('hello world');
    // 选中 "hello"（行 1，第 0-5 字符）
    await selectRange(1, 0, 1, 5);
    await typeText('*');
    const doc = await getDoc();
    expect(doc).toContain('*hello*');
  });

  test('代码块内配对：在代码块区域内输入 ( 仍然自动补 )', async () => {
    await setDoc('```\n\n```');
    // 光标移到代码块内部（第 2 行）
    await clickLine(2, 0);
    await typeText('(');
    const doc = await getDoc();
    const lines = doc.split('\n');
    // 实际行为：代码块内括号仍然自动配对
    const codeLine = lines[1];
    expect(codeLine).toBe('()');
  });
});
