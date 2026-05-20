/**
 * 深度覆盖率分析：函数级别
 *
 * 使用 V8 raw coverage 的 functions 数据，分析：
 * 1. 哪些函数被执行了（热函数）
 * 2. 哪些函数从未执行（死函数）
 * 3. 热函数的代码量分布
 * 4. 按代码区域聚类
 *
 * 使用：cd packages/core && bun run e2e/coverage/analyze-functions.ts
 */
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3002';
const OUTPUT_DIR = join(import.meta.dir, 'output');

interface V8FunctionCoverage {
  functionName: string;
  ranges: { startOffset: number; endOffset: number; count: number }[];
  isBlockCoverage: boolean;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 启用精确覆盖率（block 级别）
  const client = await page.createCDPSession();
  await client.send('Profiler.enable');
  await client.send('Profiler.startPreciseCoverage', {
    callCount: true,
    detailed: true,
  });

  // 加载并运行场景
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__editorView != null, { timeout: 15_000 });

  console.log('[analyze] Running comprehensive scenarios...');
  await runAllScenarios(page);

  // 收集精确覆盖率
  const { result } = await client.send('Profiler.takePreciseCoverage') as any;
  await client.send('Profiler.stopPreciseCoverage');
  await client.send('Profiler.disable');

  // 找到 vendor 脚本
  const vendorScript = result.find((s: any) => s.url.includes('obsidian-app.patched'));
  if (!vendorScript) {
    console.error('Vendor script not found. Available:', result.map((s: any) => s.url).slice(0, 10));
    await browser.close();
    process.exit(1);
  }

  // 获取源代码文本
  const sourceText = await page.evaluate((url: string) => {
    // 尝试从已加载的脚本中获取
    return fetch(url).then(r => r.text());
  }, vendorScript.url);

  await browser.close();

  console.log(`[analyze] Vendor: ${vendorScript.url}`);
  console.log(`[analyze] Functions: ${vendorScript.functions.length}`);
  console.log(`[analyze] Source length: ${sourceText.length}`);

  // ── 分析函数覆盖率 ──
  const functions: V8FunctionCoverage[] = vendorScript.functions;
  const lines = sourceText.split('\n');

  // 将字节偏移转换为行号
  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1);
  }

  function offsetToLine(offset: number): number {
    let lo = 0, hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lineOffsets[mid] <= offset) lo = mid + 1;
      else hi = mid;
    }
    return lo; // 1-based
  }

  // 分类函数
  const hotFunctions: Array<{
    name: string;
    startLine: number;
    endLine: number;
    lineCount: number;
    maxCount: number;
  }> = [];

  const deadFunctions: Array<{
    name: string;
    startLine: number;
    endLine: number;
    lineCount: number;
  }> = [];

  for (const fn of functions) {
    if (fn.ranges.length === 0) continue;

    const mainRange = fn.ranges[0]; // 函数整体范围
    const startLine = offsetToLine(mainRange.startOffset);
    const endLine = offsetToLine(mainRange.endOffset);
    const lineCount = endLine - startLine;

    if (lineCount < 2) continue; // 跳过单行（太小）

    const maxCount = Math.max(...fn.ranges.map(r => r.count));

    if (maxCount > 0) {
      hotFunctions.push({
        name: fn.functionName || '(anonymous)',
        startLine,
        endLine,
        lineCount,
        maxCount,
      });
    } else {
      deadFunctions.push({
        name: fn.functionName || '(anonymous)',
        startLine,
        endLine,
        lineCount,
      });
    }
  }

  // 排序
  hotFunctions.sort((a, b) => b.lineCount - a.lineCount);
  deadFunctions.sort((a, b) => b.lineCount - a.lineCount);

  // 热函数按调用频次排序
  const byFrequency = [...hotFunctions].sort((a, b) => b.maxCount - a.maxCount);

  // ── 统计 ──
  const hotLines = hotFunctions.reduce((s, f) => s + f.lineCount, 0);
  const deadLines = deadFunctions.reduce((s, f) => s + f.lineCount, 0);

  console.log('\n' + '='.repeat(70));
  console.log('FUNCTION-LEVEL COVERAGE ANALYSIS');
  console.log('='.repeat(70));
  console.log(`  Total functions: ${functions.length}`);
  console.log(`  Hot functions (executed): ${hotFunctions.length} (${hotLines.toLocaleString()} lines)`);
  console.log(`  Dead functions (never executed): ${deadFunctions.length} (${deadLines.toLocaleString()} lines)`);
  console.log('');

  console.log('  Top 30 LARGEST hot functions (by line count):');
  for (const fn of hotFunctions.slice(0, 30)) {
    const preview = lines[fn.startLine - 1]?.trim().substring(0, 50) || '';
    console.log(`    [${fn.maxCount}x] L${fn.startLine}-${fn.endLine} (${fn.lineCount}L) ${fn.name}: ${preview}`);
  }

  console.log('\n  Top 20 MOST CALLED functions:');
  for (const fn of byFrequency.slice(0, 20)) {
    console.log(`    [${fn.maxCount}x] L${fn.startLine}-${fn.endLine} (${fn.lineCount}L) ${fn.name}`);
  }

  console.log('\n  Top 20 LARGEST dead functions:');
  for (const fn of deadFunctions.slice(0, 20)) {
    const preview = lines[fn.startLine - 1]?.trim().substring(0, 50) || '';
    console.log(`    L${fn.startLine}-${fn.endLine} (${fn.lineCount}L) ${fn.name}: ${preview}`);
  }

  // ── 区域聚类：将活跃代码按位置分组 ──
  console.log('\n  Active code regions (contiguous hot functions clustered):');
  
  // 按位置排序热函数
  const hotByPos = [...hotFunctions].sort((a, b) => a.startLine - b.startLine);
  
  // 聚类：相邻 500 行内的热函数合并为一个区域
  interface Region { startLine: number; endLine: number; functions: number; totalLines: number; }
  const regions: Region[] = [];
  let currentRegion: Region | null = null;

  for (const fn of hotByPos) {
    if (!currentRegion || fn.startLine - currentRegion.endLine > 500) {
      if (currentRegion) regions.push(currentRegion);
      currentRegion = { startLine: fn.startLine, endLine: fn.endLine, functions: 1, totalLines: fn.lineCount };
    } else {
      currentRegion.endLine = Math.max(currentRegion.endLine, fn.endLine);
      currentRegion.functions++;
      currentRegion.totalLines += fn.lineCount;
    }
  }
  if (currentRegion) regions.push(currentRegion);

  regions.sort((a, b) => b.totalLines - a.totalLines);
  for (const r of regions.slice(0, 15)) {
    const preview = lines[r.startLine - 1]?.trim().substring(0, 50) || '';
    console.log(`    L${r.startLine}-${r.endLine} (${r.functions} fns, ${r.totalLines}L active): ${preview}`);
  }

  // ── 保存详细报告 ──
  const report = {
    summary: {
      totalFunctions: functions.length,
      hotFunctions: hotFunctions.length,
      deadFunctions: deadFunctions.length,
      hotLines,
      deadLines,
    },
    topHotFunctions: hotFunctions.slice(0, 100).map(f => ({
      ...f,
      firstLine: lines[f.startLine - 1]?.trim().substring(0, 80),
    })),
    topDeadFunctions: deadFunctions.slice(0, 100).map(f => ({
      ...f,
      firstLine: lines[f.startLine - 1]?.trim().substring(0, 80),
    })),
    activeRegions: regions.slice(0, 30),
    mostCalled: byFrequency.slice(0, 50).map(f => ({
      ...f,
      firstLine: lines[f.startLine - 1]?.trim().substring(0, 80),
    })),
  };

  writeFileSync(join(OUTPUT_DIR, 'function-analysis.json'), JSON.stringify(report, null, 2));
  console.log(`\n  Report saved to: ${join(OUTPUT_DIR, 'function-analysis.json')}`);
}

async function runAllScenarios(page: any) {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  const setDoc = async (text: string) => {
    await page.evaluate((t: string) => {
      const view = (window as any).__editorView;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
    }, text);
    await wait(150);
  };
  const clickLine = async (line: number, ch = 0) => {
    await page.evaluate((l: number, c: number) => {
      const view = (window as any).__editorView;
      const lc = view.state.doc.lines;
      const safeLine = Math.min(l, lc);
      const lineInfo = view.state.doc.line(safeLine);
      const pos = Math.min(lineInfo.from + c, lineInfo.to);
      view.dispatch({ selection: { anchor: pos, head: pos } });
      view.focus();
    }, line, ch);
    await wait(80);
  };
  const typeText = async (text: string) => {
    await page.keyboard.type(text, { delay: 10 });
    await wait(80);
  };
  const press = async (key: string) => {
    const parts = key.split('+');
    if (parts.length > 1) {
      for (const mod of parts.slice(0, -1)) await page.keyboard.down(mod);
      await page.keyboard.press(parts[parts.length - 1]);
      for (const mod of parts.slice(0, -1).reverse()) await page.keyboard.up(mod);
    } else {
      await page.keyboard.press(key);
    }
    await wait(80);
  };

  // Comprehensive markdown doc
  const doc = `# Title\n## Subtitle\n\n**bold** *italic* ~~strike~~ ==highlight==\n\n[link](https://x.com) [[wiki]] ![[embed]]\n\n> blockquote\n> [!NOTE]\n> callout content\n\n- ul item\n  - nested\n1. ol item\n- [ ] task\n- [x] done\n\n\`\`\`js\ncode()\n\`\`\`\n\n#tag\n\n---\n\nEnd.`;
  await setDoc(doc);

  // Click through all lines
  const lc = doc.split('\n').length;
  for (let i = 1; i <= lc; i++) { await clickLine(i, 0); await wait(30); }
  await clickLine(lc, 0);

  // Typing
  await setDoc('');
  await clickLine(1, 0);
  await typeText('# Hello\n\nSome **text** with *formatting*\n\n- list\n\n> quote\n\n[[link]]');

  // List continuation
  await setDoc('- item');
  await clickLine(1, 6);
  await press('Enter');
  await typeText('next');
  await press('Enter');
  await press('Enter');

  // Auto-pair
  await setDoc('');
  await clickLine(1, 0);
  await typeText('(hello) [world] `code` *em*');

  // Tab/indent
  await setDoc('- a\n- b');
  await clickLine(2, 2);
  await press('Tab');
  await press('Shift+Tab');

  // Chinese
  await setDoc('');
  await clickLine(1, 0);
  await typeText('【【link】】');

  // Save
  await press('Control+s');

  // Navigation
  await setDoc('Line 1\nLine 2\nLine 3');
  await clickLine(1, 0);
  for (let i = 0; i < 5; i++) await press('ArrowDown');
  for (let i = 0; i < 5; i++) await press('ArrowRight');
  await press('Home');
  await press('End');

  // Select + surround
  await setDoc('hello world');
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    view.focus();
  });
  await typeText('*');

  // Backspace
  await setDoc('delete me');
  await clickLine(1, 9);
  for (let i = 0; i < 5; i++) await press('Backspace');

  console.log('[analyze] Scenarios complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
