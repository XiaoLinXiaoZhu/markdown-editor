/**
 * 动态覆盖率收集器
 *
 * 在全部 E2E 测试运行期间收集 V8 JS Coverage，
 * 分析 obsidian-app.patched.js 的覆盖率，找出活跃代码和死代码。
 *
 * 使用方式：
 *   cd packages/core && bun run e2e/coverage/collect.ts
 *
 * 前提：dev server 在 localhost:3002 运行中
 */
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3002';
const OUTPUT_DIR = join(import.meta.dir, 'output');
const VENDOR_FILE_PATTERN = /obsidian-app\.patched\.js/;

interface CoverageRange {
  start: number;
  end: number;
}

interface CoverageEntry {
  url: string;
  ranges: CoverageRange[];
  text: string;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('[coverage] Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 启用 JS Coverage（精确到函数级别）
  console.log('[coverage] Starting JS coverage...');
  await page.coverage.startJSCoverage({ includeRawScriptCoverage: true });

  // 加载页面
  console.log('[coverage] Loading page...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForSelector('.cm-editor', { timeout: 15_000 });
  await page.waitForFunction(() => (window as any).__editorView != null, { timeout: 15_000 });

  console.log('[coverage] Editor ready. Running scenarios...');

  // ── 执行覆盖率场景 ──
  // 模拟所有关键用户行为，尽可能触发更多代码路径

  await runScenarios(page);

  // 停止 coverage 并收集数据
  console.log('[coverage] Stopping coverage...');
  const coverage = await page.coverage.stopJSCoverage();

  await browser.close();

  // ── 分析 vendor 文件 ──
  console.log('[coverage] Analyzing vendor coverage...');

  const vendorEntries = coverage.filter(entry => VENDOR_FILE_PATTERN.test(entry.url));

  if (vendorEntries.length === 0) {
    console.error('[coverage] ERROR: No vendor file found in coverage data!');
    console.log('[coverage] Available files:', coverage.map(e => e.url).join('\n'));
    process.exit(1);
  }

  for (const entry of vendorEntries) {
    analyzeEntry(entry);
  }
}

async function runScenarios(page: any) {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Helper: set doc
  const setDoc = async (text: string) => {
    await page.evaluate((t: string) => {
      const view = (window as any).__editorView;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
    }, text);
    await wait(200);
  };

  // Helper: click line
  const clickLine = async (line: number, ch = 0) => {
    await page.evaluate((l: number, c: number) => {
      const view = (window as any).__editorView;
      const lineInfo = view.state.doc.line(l);
      const pos = Math.min(lineInfo.from + c, lineInfo.to);
      view.dispatch({ selection: { anchor: pos, head: pos } });
      view.focus();
    }, line, ch);
    await wait(150);
  };

  // Helper: type text
  const typeText = async (text: string) => {
    await page.keyboard.type(text, { delay: 15 });
    await wait(100);
  };

  // Helper: press key
  const press = async (key: string) => {
    const parts = key.split('+');
    if (parts.length > 1) {
      for (const mod of parts.slice(0, -1)) await page.keyboard.down(mod);
      await page.keyboard.press(parts[parts.length - 1]);
      for (const mod of parts.slice(0, -1).reverse()) await page.keyboard.up(mod);
    } else {
      await page.keyboard.press(key);
    }
    await wait(100);
  };

  // ── 场景 1: Live Preview 渲染（触发所有格式的渲染/编辑切换）──
  console.log('[coverage]   Scenario: Live Preview rendering');
  const livePreviewDoc = [
    '# Heading 1',
    '## Heading 2',
    '### Heading 3',
    '',
    'Some **bold** and *italic* and ~~strikethrough~~ and ==highlight== text.',
    '',
    '[External Link](https://example.com)',
    '[[Internal Link]]',
    '[[Link|With Alias]]',
    '',
    '![Image](https://via.placeholder.com/100)',
    '',
    '> Blockquote text',
    '> More quoted text',
    '',
    '> [!NOTE]',
    '> This is a callout',
    '',
    '> [!WARNING]',
    '> This is a warning callout',
    '',
    '- Unordered item 1',
    '- Unordered item 2',
    '  - Nested item',
    '',
    '1. Ordered item 1',
    '2. Ordered item 2',
    '',
    '- [ ] Unchecked task',
    '- [x] Checked task',
    '',
    '```javascript',
    'const x = 1;',
    'function hello() { return "world"; }',
    '```',
    '',
    '`inline code`',
    '',
    '#tag1 #tag2',
    '',
    '---',
    '',
    '| Col 1 | Col 2 |',
    '| ----- | ----- |',
    '| A     | B     |',
    '',
    '---',
    'frontmatter test',
  ].join('\n');

  await setDoc(livePreviewDoc);

  // 逐行点击，触发每行的渲染/编辑切换
  const lineCount = livePreviewDoc.split('\n').length;
  for (let i = 1; i <= Math.min(lineCount, 48); i++) {
    await clickLine(i, 0);
    await wait(50);
  }
  // 点回第一行再离开，确保所有行都经历了"光标离开"
  await clickLine(lineCount, 0);
  await wait(200);

  // ── 场景 2: 列表续行 ──
  console.log('[coverage]   Scenario: List continuation');
  await setDoc('- item 1');
  await clickLine(1, 8);
  await press('Enter');
  await typeText('item 2');
  await press('Enter');
  await press('Enter'); // 退出列表

  await setDoc('1. first');
  await clickLine(1, 8);
  await press('Enter');
  await typeText('second');

  await setDoc('- [ ] task');
  await clickLine(1, 10);
  await press('Enter');
  await typeText('task 2');

  // Tab/Shift-Tab
  await setDoc('- a\n- b');
  await clickLine(2, 2);
  await press('Tab');
  await press('Shift+Tab');

  // ── 场景 3: 自动配对 ──
  console.log('[coverage]   Scenario: Auto-pairing');
  await setDoc('');
  await clickLine(1, 0);
  await typeText('(');
  await typeText(')'); // skip over
  await typeText(' ');
  await typeText('[');
  await typeText(']');
  await typeText(' ');
  await typeText('{');
  await typeText('}');
  await typeText(' ');
  await typeText('`');
  await typeText('`');
  await typeText(' ');
  await typeText('*');
  await typeText('*');

  // Select and surround
  await setDoc('hello world');
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    view.focus();
  });
  await wait(100);
  await typeText('*');

  // ── 场景 4: 中文转换 ──
  console.log('[coverage]   Scenario: Chinese conversion');
  await setDoc('');
  await clickLine(1, 0);
  await typeText('【【');
  await wait(150);
  await typeText('link');
  await typeText('】】');
  await wait(150);

  await setDoc('');
  await clickLine(1, 0);
  await typeText('！【【');
  await wait(150);

  await setDoc('');
  await clickLine(1, 0);
  await typeText('···');
  await wait(150);

  // ── 场景 5: 折叠 ──
  console.log('[coverage]   Scenario: Folding');
  await setDoc('# Section 1\nContent 1\n\n# Section 2\nContent 2');
  await clickLine(1, 0);
  await wait(200);

  // ── 场景 6: Ctrl+S ──
  console.log('[coverage]   Scenario: Save');
  await press('Control+s');

  // ── 场景 7: 大量输入（触发增量解析器）──
  console.log('[coverage]   Scenario: Bulk input');
  await setDoc('');
  await clickLine(1, 0);
  const paragraph = 'The quick brown fox jumps over the lazy dog. ';
  await typeText(paragraph);
  await press('Enter');
  await typeText('# New heading');
  await press('Enter');
  await typeText('- list item with **bold** and *italic*');
  await press('Enter');
  await typeText('> quote with [[link]] and `code`');

  // ── 场景 8: 删除操作 ──
  console.log('[coverage]   Scenario: Deletions');
  for (let i = 0; i < 10; i++) await press('Backspace');
  await press('Control+a'); // select all... actually use select
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    const len = view.state.doc.length;
    view.dispatch({ selection: { anchor: 0, head: len } });
  });
  await press('Delete');

  // ── 场景 9: 光标导航 ──
  console.log('[coverage]   Scenario: Navigation');
  await setDoc('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
  await clickLine(1, 0);
  await press('ArrowDown');
  await press('ArrowDown');
  await press('ArrowRight');
  await press('ArrowRight');
  await press('Home');
  await press('End');
  await press('ArrowUp');

  // ── 场景 10: 链接点击 ──
  console.log('[coverage]   Scenario: Link click');
  await setDoc('See [[target]] for details\n\nOther text');
  await clickLine(3, 0);
  await wait(300);
  // Try to click the internal link
  await page.evaluate(() => {
    const link = document.querySelector('.cm-hmd-internal-link, .internal-link');
    if (link) (link as HTMLElement).click();
  });
  await wait(200);

  console.log('[coverage]   All scenarios complete.');
}

function analyzeEntry(entry: CoverageEntry) {
  const text = entry.text;
  const totalBytes = text.length;

  // Merge overlapping ranges
  const covered = new Uint8Array(totalBytes);
  for (const range of entry.ranges) {
    for (let i = range.start; i < range.end && i < totalBytes; i++) {
      covered[i] = 1;
    }
  }

  const coveredBytes = covered.reduce((sum, v) => sum + v, 0);
  const uncoveredBytes = totalBytes - coveredBytes;
  const coveragePercent = ((coveredBytes / totalBytes) * 100).toFixed(1);

  // Count lines
  const lines = text.split('\n');
  const totalLines = lines.length;
  let coveredLines = 0;
  let uncoveredLines = 0;
  let offset = 0;

  const lineCoverage: boolean[] = [];
  for (const line of lines) {
    const lineEnd = offset + line.length;
    let lineHasCoverage = false;
    for (let i = offset; i < lineEnd; i++) {
      if (covered[i]) { lineHasCoverage = true; break; }
    }
    lineCoverage.push(lineHasCoverage);
    if (lineHasCoverage) coveredLines++;
    else uncoveredLines++;
    offset = lineEnd + 1; // +1 for \n
  }

  // Find largest uncovered blocks
  interface Block { startLine: number; endLine: number; lineCount: number; }
  const uncoveredBlocks: Block[] = [];
  let blockStart = -1;
  for (let i = 0; i < lineCoverage.length; i++) {
    if (!lineCoverage[i]) {
      if (blockStart === -1) blockStart = i;
    } else {
      if (blockStart !== -1) {
        const count = i - blockStart;
        if (count >= 50) { // Only report blocks >= 50 lines
          uncoveredBlocks.push({ startLine: blockStart + 1, endLine: i, lineCount: count });
        }
        blockStart = -1;
      }
    }
  }
  if (blockStart !== -1) {
    const count = lineCoverage.length - blockStart;
    if (count >= 50) {
      uncoveredBlocks.push({ startLine: blockStart + 1, endLine: lineCoverage.length, lineCount: count });
    }
  }
  uncoveredBlocks.sort((a, b) => b.lineCount - a.lineCount);

  // Print report
  console.log('\n' + '='.repeat(70));
  console.log(`COVERAGE REPORT: ${entry.url.split('/').pop()}`);
  console.log('='.repeat(70));
  console.log(`  Total:     ${totalBytes.toLocaleString()} bytes / ${totalLines.toLocaleString()} lines`);
  console.log(`  Covered:   ${coveredBytes.toLocaleString()} bytes / ${coveredLines.toLocaleString()} lines`);
  console.log(`  Uncovered: ${uncoveredBytes.toLocaleString()} bytes / ${uncoveredLines.toLocaleString()} lines`);
  console.log(`  Coverage:  ${coveragePercent}% (bytes)`);
  console.log(`  Coverage:  ${((coveredLines / totalLines) * 100).toFixed(1)}% (lines)`);
  console.log('');
  console.log(`  Dead code blocks (>= 50 lines): ${uncoveredBlocks.length}`);
  console.log(`  Total dead block lines: ${uncoveredBlocks.reduce((s, b) => s + b.lineCount, 0).toLocaleString()}`);

  if (uncoveredBlocks.length > 0) {
    console.log('\n  Top 20 largest dead code blocks:');
    for (const block of uncoveredBlocks.slice(0, 20)) {
      const preview = lines[block.startLine - 1]?.trim().substring(0, 60) || '';
      console.log(`    Lines ${block.startLine}-${block.endLine} (${block.lineCount} lines): ${preview}`);
    }
  }

  // Save detailed data
  const report = {
    file: entry.url,
    totalBytes,
    totalLines,
    coveredBytes,
    coveredLines,
    coveragePercentBytes: parseFloat(coveragePercent),
    coveragePercentLines: parseFloat(((coveredLines / totalLines) * 100).toFixed(1)),
    uncoveredBlocks: uncoveredBlocks.slice(0, 50),
    // Save line-by-line coverage for detailed analysis
    lineCoverageSummary: {
      covered: coveredLines,
      uncovered: uncoveredLines,
    },
  };

  writeFileSync(
    join(OUTPUT_DIR, 'coverage-report.json'),
    JSON.stringify(report, null, 2),
  );

  // Save line coverage bitmap (1 = covered, 0 = not)
  // Compact: each line gets one char
  const bitmap = lineCoverage.map(c => c ? '1' : '0').join('');
  writeFileSync(join(OUTPUT_DIR, 'line-coverage-bitmap.txt'), bitmap);

  console.log(`\n  Reports saved to: ${OUTPUT_DIR}/`);
}

main().catch(e => {
  console.error('[coverage] Fatal error:', e);
  process.exit(1);
});
