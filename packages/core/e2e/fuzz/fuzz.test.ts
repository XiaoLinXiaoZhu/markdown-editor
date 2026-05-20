/**
 * Phase 1.5 — 随机等价性测试 (Fuzz Equivalence Testing)
 *
 * 录制模式（默认）：用随机 seed 生成操作序列，在 vendor 版本执行，
 *   记录每步 canonical state hash 到 golden file。
 *
 * 回放模式（Phase 3 使用）：读取 golden hashes，用同一 seed 回放，
 *   检查每步 hash 是否匹配。
 *
 * 环境变量：
 *   FUZZ_SEED     — 指定 seed（复现用），不设则随机
 *   FUZZ_STEPS    — 每序列步数，默认 200
 *   FUZZ_RUNS     — 运行序列数，默认 3
 *   FUZZ_MODE     — "record" | "replay"，默认 "record"
 *   FUZZ_GOLDEN   — golden 文件路径（replay 模式需要）
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { launch, teardown, getPage } from '../setup';
import { runFuzz, formatDivergence, type FuzzRunResult } from './runner';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const FUZZ_STEPS = parseInt(process.env.FUZZ_STEPS || '200', 10);
const FUZZ_RUNS = parseInt(process.env.FUZZ_RUNS || '3', 10);
const FUZZ_MODE = (process.env.FUZZ_MODE || 'record') as 'record' | 'replay';
const GOLDEN_DIR = join(import.meta.dir, 'golden');

function getSeed(index: number): number {
  if (process.env.FUZZ_SEED) {
    return parseInt(process.env.FUZZ_SEED, 10) + index;
  }
  return Date.now() + index * 1000;
}

describe('Fuzz Equivalence Testing', () => {
  beforeAll(async () => {
    await launch();
    if (!existsSync(GOLDEN_DIR)) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
    }
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  for (let i = 0; i < FUZZ_RUNS; i++) {
    test(`fuzz sequence #${i + 1} (${FUZZ_STEPS} steps)`, async () => {
      const page = getPage();
      const seed = getSeed(i);
      const goldenPath = join(GOLDEN_DIR, `sequence-${seed}.json`);

      if (FUZZ_MODE === 'replay') {
        // 回放模式：与 golden 对比
        if (!existsSync(goldenPath)) {
          throw new Error(`Golden file not found: ${goldenPath}. Run in record mode first.`);
        }
        const golden = JSON.parse(readFileSync(goldenPath, 'utf-8')) as FuzzRunResult;
        const result = await runFuzz(page, {
          seed,
          steps: FUZZ_STEPS,
          golden: golden.hashes,
          bailOnDivergence: true,
        });

        if (result.divergence) {
          console.error(formatDivergence(result));
          expect(result.divergence).toBeUndefined();
        }
      } else {
        // 录制模式：执行并保存 golden
        const result = await runFuzz(page, {
          seed,
          steps: FUZZ_STEPS,
        });

        // 保存 golden
        writeFileSync(goldenPath, JSON.stringify(result, null, 2));
        console.log(`[fuzz] Recorded golden: seed=${seed}, ${result.hashes.length} states`);

        // 录制模式下：验证序列执行完成无崩溃
        expect(result.hashes.length).toBeGreaterThan(0);
        expect(result.hashes.length).toBeLessThanOrEqual(FUZZ_STEPS + 1);
      }
    }, 120_000); // 单序列最多 120s
  }
});
