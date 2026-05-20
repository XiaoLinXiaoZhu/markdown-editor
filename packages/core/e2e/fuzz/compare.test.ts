/**
 * Fuzz 等价性对比测试
 *
 * 同一操作序列分别在 vendor __kH 和开源 Live Preview 上执行，
 * 逐步对比 DOM 状态（class、widget、文本），报告所有差异。
 *
 * 用法：bun test e2e/fuzz/compare.test.ts
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { createPRNG } from './prng';
import { generateAction } from './actions';
import { executeAction, getCanonicalState, type CanonicalState, type LineRenderState } from './executor';

const BASE_URL = process.env.E2E_URL || 'http://localhost:3002';
const FUZZ_STEPS = parseInt(process.env.FUZZ_STEPS || '30', 10);
const FUZZ_SEED = parseInt(process.env.FUZZ_SEED || '12345', 10);

let browser: Browser;
let vendorPage: Page;
let ossPage: Page;

/** 重置编辑器到初始状态 */
async function resetEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    if (!view) return;
    const initDoc = [
      '# Heading Test',
      '',
      'Normal **bold** and *italic* text.',
      '',
      '```javascript',
      'const x = 42;',
      '```',
      '',
      '> Blockquote here',
      '',
      '- List item 1',
      '- List item 2',
      '',
      '$$',
      'E = mc^2',
      '$$',
      '',
      'Inline $x^2$ and [[wiki-link]] here.',
      '',
      '> [!note] Callout',
      '> Content.',
      '',
      'End.',
      '',
    ].join('\n');
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: initDoc },
    });
    const line3 = view.state.doc.line(3);
    view.dispatch({ selection: { anchor: line3.to } });
    view.focus();
  });
  await page.evaluate(() => new Promise<void>(r => setTimeout(r, 300)));
}

/** 对比两个 LineRenderState 数组，返回差异 */
function diffLineStates(vendor: LineRenderState[], oss: LineRenderState[]): string[] {
  const diffs: string[] = [];
  const maxLines = Math.max(vendor.length, oss.length);

  for (let i = 0; i < maxLines; i++) {
    const v = vendor[i];
    const o = oss[i];

    if (!v && o) {
      diffs.push(`L${i + 1}: vendor 无此行, OSS="${o.text.substring(0, 40)}"`);
      continue;
    }
    if (v && !o) {
      diffs.push(`L${i + 1}: OSS 无此行, vendor="${v.text.substring(0, 40)}"`);
      continue;
    }
    if (!v || !o) continue;

    // 对比文本
    if (v.text !== o.text) {
      diffs.push(`L${i + 1} text: vendor="${v.text.substring(0, 50)}" vs oss="${o.text.substring(0, 50)}"`);
    }

    // 对比行 class
    if (v.lineClass !== o.lineClass) {
      diffs.push(`L${i + 1} class: vendor="${v.lineClass}" vs oss="${o.lineClass}"`);
    }

    // 对比 widget 数量
    if (v.widgetCount !== o.widgetCount) {
      diffs.push(`L${i + 1} widgets: vendor=${v.widgetCount} vs oss=${o.widgetCount}`);
    }

    // 对比子元素结构
    const vChildren = v.children.join('|');
    const oChildren = o.children.join('|');
    if (vChildren !== oChildren) {
      diffs.push(`L${i + 1} children: vendor=[${v.children.slice(0, 5).join(', ')}${v.children.length > 5 ? '...' : ''}] vs oss=[${o.children.slice(0, 5).join(', ')}${o.children.length > 5 ? '...' : ''}]`);
    }
  }

  return diffs;
}

describe('Vendor vs OSS Live Preview 对比', () => {
  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Vendor page (默认)
    vendorPage = await browser.newPage();
    await vendorPage.setViewport({ width: 1280, height: 800 });
    await vendorPage.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
    await vendorPage.waitForSelector('.cm-editor', { timeout: 15_000 });
    await vendorPage.waitForFunction(() => (window as any).__editorView != null, { timeout: 15_000 });

    // OSS page (设置 flag)
    ossPage = await browser.newPage();
    await ossPage.setViewport({ width: 1280, height: 800 });
    await ossPage.evaluateOnNewDocument(() => {
      (window as any).__useOpenSourceLivePreview = true;
    });
    await ossPage.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
    await ossPage.waitForSelector('.cm-editor', { timeout: 15_000 });
    await ossPage.waitForFunction(() => (window as any).__editorView != null, { timeout: 15_000 });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  test('初始文档渲染对比', async () => {
    await resetEditor(vendorPage);
    await resetEditor(ossPage);

    const vendorState = await getCanonicalState(vendorPage);
    const ossState = await getCanonicalState(ossPage);

    // 文档文本应相同
    expect(ossState.doc).toBe(vendorState.doc);

    // 渲染差异报告
    const diffs = diffLineStates(vendorState.lineStates, ossState.lineStates);
    if (diffs.length > 0) {
      console.log(`\n=== 初始渲染差异 (${diffs.length} 处) ===`);
      for (const d of diffs) {
        console.log(`  ${d}`);
      }
    }

    // 不 expect 零差异（目前 OSS 实现不完整），只报告
    console.log(`\n差异总计: ${diffs.length} 处（${vendorState.lineStates.length} 行）`);
  }, 30_000);

  test(`fuzz 序列对比 (seed=${FUZZ_SEED}, ${FUZZ_STEPS} steps)`, async () => {
    await resetEditor(vendorPage);
    await resetEditor(ossPage);

    const rng1 = createPRNG(FUZZ_SEED);
    const rng2 = createPRNG(FUZZ_SEED);

    let vendorLineCount = 4;
    let ossLineCount = 4;
    let totalDiffs = 0;
    const divergenceSteps: { step: number; action: string; diffs: string[] }[] = [];

    for (let i = 0; i < FUZZ_STEPS; i++) {
      const action1 = generateAction(rng1, vendorLineCount);
      const action2 = generateAction(rng2, ossLineCount);
      // 因为同 seed 同 lineCount，action 应相同
      // 但 lineCount 可能因实现差异而不同

      try { await executeAction(vendorPage, action1); } catch {}
      try { await executeAction(ossPage, action2); } catch {}

      await vendorPage.evaluate(() => new Promise<void>(r => setTimeout(r, 50)));
      await ossPage.evaluate(() => new Promise<void>(r => setTimeout(r, 50)));

      const vendorState = await getCanonicalState(vendorPage);
      const ossState = await getCanonicalState(ossPage);

      vendorLineCount = vendorState.lineCount;
      ossLineCount = ossState.lineCount;

      // 文档文本差异（逻辑层）
      if (vendorState.doc !== ossState.doc) {
        divergenceSteps.push({
          step: i + 1,
          action: action1.description,
          diffs: [`DOC DIVERGENCE: vendor doc length=${vendorState.doc.length}, oss=${ossState.doc.length}`],
        });
        totalDiffs++;
        // 文档不同就跳出，后续无法比较
        break;
      }

      // 渲染差异
      const diffs = diffLineStates(vendorState.lineStates, ossState.lineStates);
      if (diffs.length > 0) {
        divergenceSteps.push({
          step: i + 1,
          action: action1.description,
          diffs: diffs.slice(0, 5), // 只保留前 5 个差异
        });
        totalDiffs += diffs.length;
      }
    }

    // 输出报告
    console.log(`\n=== Fuzz 对比报告 (seed=${FUZZ_SEED}, ${FUZZ_STEPS} steps) ===`);
    console.log(`步骤中发现渲染差异的次数: ${divergenceSteps.length}/${FUZZ_STEPS}`);
    console.log(`累计差异数: ${totalDiffs}`);

    if (divergenceSteps.length > 0) {
      console.log(`\n前 10 个差异步骤:`);
      for (const d of divergenceSteps.slice(0, 10)) {
        console.log(`  Step ${d.step} [${d.action}]:`);
        for (const diff of d.diffs) {
          console.log(`    ${diff}`);
        }
      }
    }

    // 当前不 assert 零差异，只生成报告
    // 当 OSS 实现追平 vendor 时，改为: expect(totalDiffs).toBe(0);
  }, 120_000);
});
