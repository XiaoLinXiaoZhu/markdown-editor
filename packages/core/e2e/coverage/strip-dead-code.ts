/**
 * Dead Code Stripper
 *
 * 基于 V8 精确覆盖率数据，将 vendor 中从未执行的函数体替换为空 stub。
 * 产出一份精简版 vendor JS，大幅缩小体积，便于后续逆向分析。
 *
 * 原理：
 * - 用 CDP Profiler 收集 block-level coverage
 * - 找出所有 count=0 的函数（整体从未执行）
 * - 将其函数体替换为空 stub
 * - 保留函数签名和导出，不破坏引用关系
 *
 * 使用：cd packages/core && bun run e2e/coverage/strip-dead-code.ts
 */
import puppeteer from 'puppeteer';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3002';
const OUTPUT_DIR = join(import.meta.dir, 'output');
const VENDOR_PATH = join(import.meta.dir, '../../vendor/obsidian-app.patched.js');

interface FunctionRange {
  startOffset: number;
  endOffset: number;
  count: number;
}

interface V8Function {
  functionName: string;
  ranges: FunctionRange[];
  isBlockCoverage: boolean;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('[strip] Reading vendor source...');
  const source = readFileSync(VENDOR_PATH, 'utf-8');
  console.log(`[strip] Source: ${source.length.toLocaleString()} bytes, ${source.split('\n').length.toLocaleString()} lines`);

  console.log('[strip] Launching browser to collect precise coverage...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 启用精确覆盖率
  const client = await page.createCDPSession();
  await client.send('Profiler.enable');
  await client.send('Profiler.startPreciseCoverage', {
    callCount: true,
    detailed: true,
  });

  // 加载并运行所有场景
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__editorView != null, { timeout: 15_000 });

  console.log('[strip] Running scenarios to maximize coverage...');
  await runScenarios(page);

  // 收集覆盖率
  const { result } = await client.send('Profiler.takePreciseCoverage') as any;
  await client.send('Profiler.stopPreciseCoverage');
  await client.send('Profiler.disable');
  await browser.close();

  // 找到 vendor 脚本的覆盖率
  const vendorCov = result.find((s: any) => s.url.includes('obsidian-app.patched'));
  if (!vendorCov) {
    console.error('[strip] ERROR: vendor coverage not found');
    process.exit(1);
  }

  const functions: V8Function[] = vendorCov.functions;
  console.log(`[strip] Total functions: ${functions.length}`);

  // 分类函数
  const deadFunctions: Array<{ start: number; end: number; name: string }> = [];
  const liveFunctions: Array<{ start: number; end: number; name: string }> = [];

  for (const fn of functions) {
    if (fn.ranges.length === 0) continue;
    const mainRange = fn.ranges[0];
    const bodySize = mainRange.endOffset - mainRange.startOffset;

    // 跳过太小的函数（< 50 字节，不值得 strip）
    if (bodySize < 50) continue;

    // 跳过顶级包裹函数（整个文件或大 IIFE）
    if (bodySize > source.length * 0.5) continue;

    const maxCount = Math.max(...fn.ranges.map(r => r.count));
    if (maxCount === 0) {
      deadFunctions.push({
        start: mainRange.startOffset,
        end: mainRange.endOffset,
        name: fn.functionName || '(anonymous)',
      });
    } else {
      liveFunctions.push({
        start: mainRange.startOffset,
        end: mainRange.endOffset,
        name: fn.functionName || '(anonymous)',
      });
    }
  }

  console.log(`[strip] Live functions: ${liveFunctions.length}`);
  console.log(`[strip] Dead functions (>50 bytes): ${deadFunctions.length}`);

  // 排序：从后往前替换（避免偏移变化）
  deadFunctions.sort((a, b) => b.start - a.start);

  // 计算 dead code 总字节数
  const deadBytes = deadFunctions.reduce((s, f) => s + (f.end - f.start), 0);
  console.log(`[strip] Dead code to strip: ${deadBytes.toLocaleString()} bytes`);

  // ── 执行替换 ──
  // 策略：找到函数体的 { ... } 部分，替换内容为空
  // 保留函数声明行（签名），只清空函数体内容
  let stripped = source;
  let replacements = 0;
  let savedBytes = 0;

  for (const dead of deadFunctions) {
    const fnText = stripped.substring(dead.start, dead.end);

    // 找到函数体的第一个 { 和最后一个 }
    const bodyStart = findFunctionBodyStart(fnText);
    if (bodyStart === -1) continue;

    const bodyEnd = findMatchingBrace(fnText, bodyStart);
    if (bodyEnd === -1 || bodyEnd <= bodyStart + 1) continue;

    // 提取函数体内容（{ 和 } 之间的部分）
    const bodyContent = fnText.substring(bodyStart + 1, bodyEnd);

    // 跳过已经很短的函数体
    if (bodyContent.length < 30) continue;

    // 替换函数体为空（保留 { }）
    const replacement = '{ /* stripped */ }';
    const fullReplacement = fnText.substring(0, bodyStart) + replacement;

    const globalStart = dead.start;
    const globalEnd = dead.start + bodyEnd + 1;

    // 安全检查：不要替换太大的范围（可能是误匹配）
    if (globalEnd - globalStart > 50000) continue;

    stripped = stripped.substring(0, globalStart) + fullReplacement + stripped.substring(globalEnd);
    replacements++;
    savedBytes += (globalEnd - globalStart) - fullReplacement.length;
  }

  console.log(`[strip] Replacements made: ${replacements}`);
  console.log(`[strip] Bytes saved: ${savedBytes.toLocaleString()}`);
  console.log(`[strip] Original: ${source.length.toLocaleString()} bytes`);
  console.log(`[strip] Stripped: ${stripped.length.toLocaleString()} bytes`);
  console.log(`[strip] Reduction: ${((savedBytes / source.length) * 100).toFixed(1)}%`);

  // 保存精简版
  const outputPath = join(OUTPUT_DIR, 'obsidian-app.stripped.js');
  writeFileSync(outputPath, stripped);
  console.log(`[strip] Saved to: ${outputPath}`);

  // 也输出行数统计
  const strippedLines = stripped.split('\n').length;
  console.log(`[strip] Lines: ${source.split('\n').length} → ${strippedLines}`);

  // 保存元数据
  const meta = {
    originalBytes: source.length,
    strippedBytes: stripped.length,
    reduction: parseFloat(((savedBytes / source.length) * 100).toFixed(1)),
    originalLines: source.split('\n').length,
    strippedLines,
    totalFunctions: functions.length,
    liveFunctions: liveFunctions.length,
    deadFunctions: deadFunctions.length,
    replacementsMade: replacements,
    bytesSaved: savedBytes,
  };
  writeFileSync(join(OUTPUT_DIR, 'strip-meta.json'), JSON.stringify(meta, null, 2));
}

/** 找到函数文本中函数体 { 的位置（跳过参数列表） */
function findFunctionBodyStart(fnText: string): number {
  // 对于 function(...) { 格式
  // 对于 (...) => { 格式
  // 对于 method(...) { 格式
  // 都是找第一个不在字符串/注释内的 {
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = 0; i < fnText.length; i++) {
    const ch = fnText[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }

    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }

    // 在所有括号都闭合后遇到第一个 {
    if (ch === '{' && depth <= 0) {
      return i;
    }
  }
  return -1;
}

/** 找到匹配的闭合花括号 */
function findMatchingBrace(text: string, openPos: number): number {
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = openPos; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }

    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

async function runScenarios(page: any) {
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
      const lineInfo = view.state.doc.line(Math.min(l, view.state.doc.lines));
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

  // 全面的场景覆盖
  const doc = `# Title\n## Subtitle\n### H3\n\n**bold** *italic* ~~strike~~ ==highlight==\n\n[link](https://x.com) [[wiki]] ![[embed]]\n\n> blockquote\n> [!NOTE]\n> callout\n\n- ul 1\n  - nested\n1. ol 1\n- [ ] task\n- [x] done\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n#tag\n---\nEnd.`;
  await setDoc(doc);

  // Click through all lines (trigger live preview on every line)
  const lc = doc.split('\n').length;
  for (let i = 1; i <= lc; i++) { await clickLine(i); await wait(30); }
  await clickLine(lc);

  // Typing scenarios
  await setDoc('');
  await clickLine(1, 0);
  await typeText('# Hello World\n\n**bold** and *italic*\n\n- list item\n\n> quote\n\n[[link]] `code`');

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
  await typeText('(hello) [world] {obj} `code` *em*');

  // Tab/Shift+Tab
  await setDoc('- a\n- b\n- c');
  await clickLine(2, 2);
  await press('Tab');
  await press('Shift+Tab');

  // Chinese conversion
  await setDoc('');
  await clickLine(1, 0);
  await typeText('【【link】】 ！【【img');

  // Backspace/Delete
  await setDoc('delete this text');
  await clickLine(1, 16);
  for (let i = 0; i < 8; i++) await press('Backspace');

  // Ctrl+S
  await press('Control+s');

  // Navigation
  await setDoc('AAA\nBBB\nCCC\nDDD');
  await clickLine(1, 0);
  await press('ArrowDown');
  await press('ArrowDown');
  await press('End');
  await press('Home');
  await press('ArrowUp');

  // Select + surround
  await setDoc('hello world');
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    view.focus();
  });
  await typeText('*');

  // Link click
  await setDoc('Click [[target]] here\n\nOther');
  await clickLine(3, 0);
  await wait(200);
  await page.evaluate(() => {
    const link = document.querySelector('.cm-hmd-internal-link, .internal-link');
    if (link) (link as HTMLElement).click();
  });

  console.log('[strip] Scenarios complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
