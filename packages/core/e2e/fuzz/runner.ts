/**
 * Fuzz 测试运行器
 *
 * 录制模式：执行随机操作序列，记录每步的 canonical state hash → golden file
 * 回放模式：用同一 seed 执行操作序列，与 golden 对比找分歧点
 */
import type { Page } from 'puppeteer';
import { createPRNG } from './prng';
import { generateAction } from './actions';
import { executeAction, getCanonicalState, hashState, type CanonicalState } from './executor';

export interface FuzzRunResult {
  seed: number;
  steps: number;
  hashes: string[];
  /** 仅在 replay 模式发现分歧时填充 */
  divergence?: {
    step: number;
    action: string;
    expected: string;
    actual: string;
    expectedState?: CanonicalState;
    actualState?: CanonicalState;
  };
}

export interface FuzzOptions {
  /** 随机种子 */
  seed: number;
  /** 操作步数 */
  steps: number;
  /** Golden hashes（回放模式时提供） */
  golden?: string[];
  /** 出错时是否提前终止 */
  bailOnDivergence?: boolean;
}

/** 重置编辑器到初始状态 */
async function resetEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    if (!view) return;
    // 设置一个简单的初始文档
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '# Fuzz Test\n\nStart typing here.\n' },
    });
    // 将光标放在第 3 行末尾
    const line3 = view.state.doc.line(3);
    view.dispatch({ selection: { anchor: line3.to, head: line3.to } });
    view.focus();
  });
  // 等待稳定
  await page.evaluate(() => new Promise<void>(r => setTimeout(r, 100)));
}

/** 执行一轮 fuzz 测试 */
export async function runFuzz(page: Page, options: FuzzOptions): Promise<FuzzRunResult> {
  const { seed, steps, golden, bailOnDivergence = true } = options;
  const rng = createPRNG(seed);
  const hashes: string[] = [];

  await resetEditor(page);

  // 记录初始状态
  const initState = await getCanonicalState(page);
  hashes.push(hashState(initState));
  let currentLineCount = initState.lineCount;

  for (let i = 0; i < steps; i++) {
    const action = generateAction(rng, currentLineCount);

    try {
      await executeAction(page, action);
    } catch (e) {
      // 操作执行失败不中断 fuzz（如越界点击），状态不变但仍记录 hash
    }

    // 等待编辑器稳定
    await page.evaluate(() => new Promise<void>(r => setTimeout(r, 30)));

    const state = await getCanonicalState(page);
    const hash = hashState(state);
    hashes.push(hash);
    currentLineCount = state.lineCount;

    // 回放模式：检查分歧
    if (golden && golden[i + 1] !== undefined && golden[i + 1] !== hash) {
      if (bailOnDivergence) {
        return {
          seed,
          steps: i + 1,
          hashes,
          divergence: {
            step: i + 1,
            action: action.description,
            expected: golden[i + 1],
            actual: hash,
            actualState: state,
          },
        };
      }
    }
  }

  return { seed, steps, hashes };
}

/** 格式化分歧报告 */
export function formatDivergence(result: FuzzRunResult): string {
  if (!result.divergence) return 'No divergence';
  const d = result.divergence;
  const lines = [
    `DIVERGENCE DETECTED (seed=${result.seed})`,
    `  Step ${d.step}: ${d.action}`,
    `  Expected hash: ${d.expected}`,
    `  Actual hash:   ${d.actual}`,
  ];
  if (d.actualState) {
    const docPreview = d.actualState.doc.length > 100
      ? d.actualState.doc.substring(0, 100) + '...'
      : d.actualState.doc;
    lines.push(`  Doc: ${JSON.stringify(docPreview)}`);
    lines.push(`  Selection: [${d.actualState.selection}]`);
  }
  lines.push(`\nReproduce: FUZZ_SEED=${result.seed} bun test e2e/fuzz/`);
  return lines.join('\n');
}
