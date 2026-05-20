/**
 * Phase 1 — 列表智能续行测试
 *
 * 验证列表续行、退出、缩进行为。
 * 对应 docs/inspection/stage-1.md 步骤 3 的 7 个场景。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { launch, teardown } from './setup';
import {
  setDoc,
  getDoc,
  clickLine,
  setCursor,
  press,
  waitForStable,
} from './helpers';

describe('列表智能续行', () => {
  beforeAll(async () => {
    await launch();
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  test('无序列表续行：- item 末尾按 Enter 自动插入 - ', async () => {
    await setDoc('- first item');
    // 将光标移到行末
    await setCursor(1, 12);
    await press('Enter');
    const doc = await getDoc();
    // 应该有两行，第二行以 "- " 开头
    const lines = doc.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toMatch(/^- /);
  });

  test('有序列表续行：1. item 末尾按 Enter 自动插入 2. ', async () => {
    await setDoc('1. first item');
    await setCursor(1, 13);
    await press('Enter');
    const doc = await getDoc();
    const lines = doc.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toMatch(/^2\. /);
  });

  test('任务列表续行：- [ ] task 末尾按 Enter 自动插入 - [ ] ', async () => {
    await setDoc('- [ ] first task');
    await setCursor(1, 16);
    await press('Enter');
    const doc = await getDoc();
    const lines = doc.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toMatch(/^- \[ \] /);
  });

  test('空列表退出：- （无内容）按 Enter 删除 - ', async () => {
    await setDoc('- first item\n- ');
    // 光标在第二行末尾（"- " 后面）
    await setCursor(2, 2);
    await press('Enter');
    const doc = await getDoc();
    // 空列表项应被删除，不应再有 "- " 开头的空行
    // 结果应该是 "- first item\n" + 新行（无列表标记）
    const lines = doc.split('\n');
    const lastNonEmpty = lines.filter(l => l.trim() !== '');
    // 第一行保留，第二行不应以 "- " 开头
    expect(lines[1]).not.toMatch(/^- /);
  });

  test('嵌套列表 Tab：列表项按 Tab 缩进一级', async () => {
    await setDoc('- first item\n- second item');
    // 光标在第二行
    await setCursor(2, 2);
    await press('Tab');
    const doc = await getDoc();
    const lines = doc.split('\n');
    // 第二行应该有缩进（空格或 tab + "-"）
    expect(lines[1]).toMatch(/^(\t|  +)- /);
  });

  test('嵌套列表 Shift-Tab：缩进列表项按 Shift-Tab 减少一级', async () => {
    await setDoc('- first item\n\t- nested item');
    // 光标在第二行（缩进的列表项）
    await setCursor(2, 3);
    await press('Shift+Tab');
    const doc = await getDoc();
    const lines = doc.split('\n');
    // 第二行应该去掉缩进
    expect(lines[1]).toMatch(/^- /);
    expect(lines[1]).not.toMatch(/^\t/);
  });

  test('Blockquote 续行：> text 末尾按 Enter 自动插入 > ', async () => {
    await setDoc('> quoted text');
    await setCursor(1, 13);
    await press('Enter');
    const doc = await getDoc();
    const lines = doc.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[1]).toMatch(/^> /);
  });
});
