/**
 * AST-based Dead Code Stripper
 *
 * 用 Babel AST 安全地将未执行的函数体替换为空 block。
 * 产出一份可运行的精简 vendor（保留所有声明和引用，只清空函数体逻辑）。
 *
 * 使用：cd packages/core && bun run e2e/coverage/ast-strip.ts
 */
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import puppeteer from 'puppeteer';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3002';
const OUTPUT_DIR = join(import.meta.dir, 'output');
const VENDOR_PATH = join(import.meta.dir, '../../vendor/obsidian-app.patched.js');

interface V8Function {
  functionName: string;
  ranges: { startOffset: number; endOffset: number; count: number }[];
  isBlockCoverage: boolean;
}

async function collectCoverage(): Promise<V8Function[]> {
  console.log('[ast-strip] Collecting coverage...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const client = await page.createCDPSession();
  await client.send('Profiler.enable');
  await client.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__editorView != null, { timeout: 15_000 });

  // 运行场景以最大化覆盖率
  await runScenarios(page);

  const { result } = await client.send('Profiler.takePreciseCoverage') as any;
  await client.send('Profiler.stopPreciseCoverage');
  await client.send('Profiler.disable');
  await browser.close();

  const vendorCov = result.find((s: any) => s.url.includes('obsidian-app.patched'));
  if (!vendorCov) throw new Error('Vendor coverage not found');
  return vendorCov.functions;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. 收集覆盖率
  const functions = await collectCoverage();
  console.log(`[ast-strip] Coverage: ${functions.length} functions`);

  // 2. 构建死函数偏移集合
  // 死函数 = ranges[0].count === 0（函数入口从未执行）
  const deadRanges = new Set<string>();
  let deadCount = 0;
  for (const fn of functions) {
    if (fn.ranges.length === 0) continue;
    const main = fn.ranges[0];
    if (main.count === 0 && (main.endOffset - main.startOffset) > 30) {
      // 以 "start-end" 为 key
      deadRanges.add(`${main.startOffset}-${main.endOffset}`);
      deadCount++;
    }
  }
  console.log(`[ast-strip] Dead functions: ${deadCount}`);

  // 3. 读取源码并解析 AST
  console.log('[ast-strip] Reading and parsing vendor (this may take a while)...');
  const source = readFileSync(VENDOR_PATH, 'utf-8');
  console.log(`[ast-strip] Source: ${(source.length / 1024 / 1024).toFixed(1)} MB`);

  const ast = parse(source, {
    sourceType: 'script',
    plugins: ['dynamicImport'],
    ranges: true,
    // 不解析注释以节省内存
    attachComment: false,
  });
  console.log('[ast-strip] AST parsed successfully');

  // 4. 遍历 AST，替换死函数的 body
  let stripped = 0;
  let skippedSmall = 0;

  // @ts-ignore - traverse default export compatibility
  const traverseFn = (traverse as any).default || traverse;
  traverseFn(ast, {
    'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod'(
      path: any
    ) {
      const node = path.node;
      if (!node.start || !node.end) return;

      // 检查这个函数是否在死函数集合中
      const key = `${node.start}-${node.end}`;
      if (!deadRanges.has(key)) return;

      // 跳过太小的函数（不值得）
      if ((node.end - node.start) < 100) {
        skippedSmall++;
        return;
      }

      // 替换函数体为空 block
      if (node.body && node.body.type === 'BlockStatement') {
        node.body.body = [];
        // 如果原来有 return，不需要加（空函数返回 undefined）
        stripped++;
      } else if (node.body && node.type === 'ArrowFunctionExpression') {
        // 箭头函数可能是表达式体 () => expr
        // 替换为 () => {}
        node.body = t.blockStatement([]);
        stripped++;
      }
    },
  });

  console.log(`[ast-strip] Stripped: ${stripped} function bodies`);
  console.log(`[ast-strip] Skipped (too small): ${skippedSmall}`);

  // 5. 生成代码
  console.log('[ast-strip] Generating code...');
  // @ts-ignore
  const generateFn = (generate as any).default || generate;
  const output = generateFn(ast, {
    compact: false,
    concise: false,
    retainLines: true,
  });

  const outputPath = join(OUTPUT_DIR, 'obsidian-app.stripped.js');
  writeFileSync(outputPath, output.code);

  const originalLines = source.split('\n').length;
  const strippedLines = output.code.split('\n').length;
  const originalBytes = source.length;
  const strippedBytes = output.code.length;

  console.log('\n' + '='.repeat(60));
  console.log('AST STRIP RESULTS');
  console.log('='.repeat(60));
  console.log(`  Original: ${originalBytes.toLocaleString()} bytes / ${originalLines.toLocaleString()} lines`);
  console.log(`  Stripped: ${strippedBytes.toLocaleString()} bytes / ${strippedLines.toLocaleString()} lines`);
  console.log(`  Reduction: ${((1 - strippedBytes / originalBytes) * 100).toFixed(1)}% bytes`);
  console.log(`  Functions stripped: ${stripped}`);
  console.log(`  Output: ${outputPath}`);

  // 保存元数据
  writeFileSync(join(OUTPUT_DIR, 'ast-strip-meta.json'), JSON.stringify({
    originalBytes, strippedBytes, originalLines, strippedLines,
    reduction: parseFloat(((1 - strippedBytes / originalBytes) * 100).toFixed(1)),
    functionsStripped: stripped,
    deadFunctions: deadCount,
  }, null, 2));
}

async function runScenarios(page: any) {
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  const setDoc = async (text: string) => {
    await page.evaluate((t: string) => {
      const view = (window as any).__editorView;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } });
    }, text);
    await wait(120);
  };
  const clickLine = async (line: number, ch = 0) => {
    await page.evaluate((l: number, c: number) => {
      const view = (window as any).__editorView;
      const lineInfo = view.state.doc.line(Math.min(l, view.state.doc.lines));
      view.dispatch({ selection: { anchor: Math.min(lineInfo.from + c, lineInfo.to) } });
      view.focus();
    }, line, ch);
    await wait(60);
  };
  const typeText = async (text: string) => { await page.keyboard.type(text, { delay: 8 }); await wait(60); };
  const press = async (key: string) => {
    const parts = key.split('+');
    if (parts.length > 1) { for (const m of parts.slice(0,-1)) await page.keyboard.down(m); await page.keyboard.press(parts.at(-1)!); for (const m of parts.slice(0,-1).reverse()) await page.keyboard.up(m); }
    else await page.keyboard.press(key);
    await wait(60);
  };

  const doc = `# Title\n## Sub\n### H3\n\n**bold** *it* ~~s~~ ==h==\n\n[l](https://x.com) [[w]] ![[e]]\n\n> bq\n> [!NOTE]\n> callout\n\n- a\n  - b\n1. c\n- [ ] d\n- [x] e\n\n\`\`\`js\nx()\n\`\`\`\n\n#tag\n---\nEnd.`;
  await setDoc(doc);
  const lc = doc.split('\n').length;
  for (let i = 1; i <= lc; i++) { await clickLine(i); await wait(20); }
  await clickLine(lc);

  // Image/embed scenario - ensure embed rendering code paths are exercised
  await setDoc('![alt](https://via.placeholder.com/1)\n\n![[embed.png]]\n\ntext');
  await clickLine(5); await wait(300);
  await clickLine(1); await wait(200);
  await clickLine(5); await wait(200);

  await setDoc(''); await clickLine(1); await typeText('# H\n\n**b** *i*\n- l\n> q\n[[k]] `c`');
  await setDoc('- x'); await clickLine(1,3); await press('Enter'); await typeText('y'); await press('Enter'); await press('Enter');
  await setDoc('1. a'); await clickLine(1,4); await press('Enter'); await typeText('b');
  await setDoc('- [ ] t'); await clickLine(1,7); await press('Enter');
  await setDoc(''); await clickLine(1); await typeText('(a) [b] {c} `d` *e*');
  await setDoc('- a\n- b'); await clickLine(2,2); await press('Tab'); await press('Shift+Tab');
  await setDoc(''); await clickLine(1); await typeText('【【lk】】');
  await setDoc(''); await clickLine(1); await typeText('！【【img');
  await press('Control+s');
  await setDoc('delete me'); await clickLine(1,9); for (let i=0;i<5;i++) await press('Backspace');
  await setDoc('hello'); await page.evaluate(()=>{const v=(window as any).__editorView;v.dispatch({selection:{anchor:0,head:5}});v.focus();}); await typeText('*');
  await setDoc('[[target]]\n\nother'); await clickLine(3); await wait(200);
  await page.evaluate(()=>{ const l=document.querySelector('.cm-hmd-internal-link,.internal-link'); if(l)(l as HTMLElement).click(); });

  console.log('[ast-strip] Scenarios complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
