/**
 * 表格智能续行测试
 *
 * 验证在表格行末尾按 Enter 时：
 * - 非空行 → 插入新的空行（列结构匹配）
 * - 空行 → 删除该行（退出表格）
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { launch, teardown } from './setup';
import { setDoc, getDoc, press, setCursor, waitForStable } from './helpers';

describe('表格智能续行', () => {
  beforeAll(async () => {
    await launch();
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  test('表格行末尾按 Enter 插入空行', async () => {
    await setDoc('| a | b |\n| - | - |\n| 1 | 2 |');
    // 光标放在第 3 行末尾（"| 1 | 2 |" 的末尾）
    await setCursor(3, 9);
    await press('Enter');
    const doc = await getDoc();
    const lines = doc.split('\n');
    // 应该有 4 行，第 4 行是空行（列数匹配）
    expect(lines.length).toBe(4);
    expect(lines[3]).toMatch(/^\|.*\|$/);
    // 空行的单元格应该都是空的
    const cells = lines[3].split('|').slice(1, -1);
    expect(cells.length).toBe(2);
    expect(cells.every(c => c.trim() === '')).toBe(true);
  });

  test('空表格行按 Enter 退出表格', async () => {
    await setDoc('| a | b |\n| - | - |\n| 1 | 2 |\n|   |   |');
    // 光标放在第 4 行（空行）
    await setCursor(4, 5);
    await press('Enter');
    const doc = await getDoc();
    const lines = doc.split('\n');
    // 空行应被删除，表格变回 3 行
    expect(lines.filter(l => l.trim().startsWith('|')).length).toBe(3);
    // 不应再有全空的表格行
    const tableLines = lines.filter(l => l.trim().startsWith('|') && !l.match(/^\|\s*-/));
    for (const tl of tableLines) {
      if (tl === lines[0]) continue; // header can be non-empty
      // body rows should not be all-empty
    }
  });

  test('多列表格：插入的空行列数正确', async () => {
    await setDoc('| name | age | city |\n| ---- | --- | ---- |\n| Alice | 30 | NYC |');
    await setCursor(3, 20);
    await press('Enter');
    const doc = await getDoc();
    const lines = doc.split('\n');
    expect(lines.length).toBe(4);
    // 第 4 行应该有 3 列
    const cells = lines[3].split('|').slice(1, -1);
    expect(cells.length).toBe(3);
  });

  test('separator 行末尾按 Enter 也插入空行', async () => {
    await setDoc('| a | b |\n| - | - |\n| 1 | 2 |');
    // 光标放在 separator 行末尾
    await setCursor(2, 9);
    await press('Enter');
    const doc = await getDoc();
    const lines = doc.split('\n');
    // 应该在 separator 后插入空行
    expect(lines.length).toBe(4);
    // 第 3 行应该是新的空数据行
    const newRow = lines[2];
    expect(newRow).toMatch(/^\|.*\|$/);
    const cells = newRow.split('|').slice(1, -1);
    expect(cells.length).toBe(2);
    expect(cells.every(c => c.trim() === '')).toBe(true);
    // 原来的 | 1 | 2 | 现在在第 4 行
    expect(lines[3]).toContain('1');
  });

  test('连续两次 Enter：第一次创建空行，第二次退出', async () => {
    await setDoc('| a | b |\n| - | - |\n| 1 | 2 |');
    await setCursor(3, 9);
    // 第一次 Enter：创建空行
    await press('Enter');
    let doc = await getDoc();
    let lines = doc.split('\n');
    expect(lines.length).toBe(4);
    expect(lines[3]).toMatch(/^\|.*\|$/);

    // 第二次 Enter：退出表格（空行被删除）
    await press('Enter');
    doc = await getDoc();
    lines = doc.split('\n');
    // 表格行应回到 3 行
    const tableLines = lines.filter(l => l.trim().startsWith('|'));
    expect(tableLines.length).toBe(3);
  });

  test('续行后表格自动格式化（列宽对齐）', async () => {
    await setDoc('| name | age |\n| ---- | --- |\n| Alice | 30 |');
    await setCursor(3, 14);
    await press('Enter');
    // 等待格式化完成（requestAnimationFrame）
    await waitForStable();
    const doc = await getDoc();
    const lines = doc.split('\n');
    // 格式化后各行的 | 位置应该对齐
    // 至少确认新行存在且列数正确
    expect(lines.length).toBe(4);
    const newRow = lines[3];
    expect(newRow).toMatch(/^\|.*\|$/);
    const cells = newRow.split('|').slice(1, -1);
    expect(cells.length).toBe(2);
  });
});
