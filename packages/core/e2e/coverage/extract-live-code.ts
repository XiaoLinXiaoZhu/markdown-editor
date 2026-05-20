/**
 * 活跃代码提取器
 *
 * 基于 V8 Coverage，生成两种输出：
 * 1. annotated 版本：原文件 + 行号标注（L=live, D=dead），方便阅读
 * 2. live-only 版本：只保留执行过的行，用于集中分析
 *
 * 使用：cd packages/core && bun run e2e/coverage/extract-live-code.ts
 */
import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3002';
const OUTPUT_DIR = join(import.meta.dir, 'output');

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('[extract] Launching browser...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.coverage.startJSCoverage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__editorView != null, { timeout: 15_000 });

  console.log('[extract] Running scenarios...');
  await runScenarios(page);

  const coverage = await page.coverage.stopJSCoverage();
  await browser.close();

  // 找到 vendor
  const vendor = coverage.find(e => e.url.includes('obsidian-app.patched'));
  if (!vendor) { console.error('Vendor not found'); process.exit(1); }

  const text = vendor.text;
  const totalBytes = text.length;

  // 标记覆盖字节
  const covered = new Uint8Array(totalBytes);
  for (const range of vendor.ranges) {
    for (let i = (range as any).start; i < (range as any).end && i < totalBytes; i++) {
      covered[i] = 1;
    }
  }

  // 按行分析
  const lines = text.split('\n');
  const lineCov: boolean[] = [];
  let offset = 0;
  for (const line of lines) {
    const lineEnd = offset + line.length;
    let hasAnyCoverage = false;
    for (let i = offset; i < lineEnd; i++) {
      if (covered[i]) { hasAnyCoverage = true; break; }
    }
    lineCov.push(hasAnyCoverage);
    offset = lineEnd + 1;
  }

  const liveLines = lineCov.filter(c => c).length;
  const deadLines = lineCov.filter(c => !c).length;
  console.log(`[extract] Total: ${lines.length} lines`);
  console.log(`[extract] Live: ${liveLines} lines (${((liveLines/lines.length)*100).toFixed(1)}%)`);
  console.log(`[extract] Dead: ${deadLines} lines`);

  // ── 输出 1: live-only（只有执行过的行，保留行号作为注释） ──
  const liveOnly: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lineCov[i]) {
      liveOnly.push(`/* ${String(i + 1).padStart(6)} */ ${lines[i]}`);
    }
  }
  const liveOnlyPath = join(OUTPUT_DIR, 'vendor-live-only.js');
  writeFileSync(liveOnlyPath, liveOnly.join('\n'));
  console.log(`[extract] Live-only: ${liveOnlyPath} (${liveOnly.length} lines)`);

  // ── 输出 2: 段落摘要（连续活跃代码块的起止和首行预览） ──
  interface Segment { startLine: number; endLine: number; lines: number; preview: string; }
  const segments: Segment[] = [];
  let segStart = -1;
  for (let i = 0; i < lineCov.length; i++) {
    if (lineCov[i]) {
      if (segStart === -1) segStart = i;
    } else {
      if (segStart !== -1) {
        const count = i - segStart;
        if (count >= 10) {
          segments.push({
            startLine: segStart + 1,
            endLine: i,
            lines: count,
            preview: lines[segStart].trim().substring(0, 80),
          });
        }
        segStart = -1;
      }
    }
  }
  if (segStart !== -1) {
    const count = lineCov.length - segStart;
    if (count >= 10) {
      segments.push({
        startLine: segStart + 1,
        endLine: lineCov.length,
        lines: count,
        preview: lines[segStart].trim().substring(0, 80),
      });
    }
  }

  segments.sort((a, b) => b.lines - a.lines);
  console.log(`\n[extract] Top 20 active code segments:`);
  for (const seg of segments.slice(0, 20)) {
    console.log(`  L${seg.startLine}-${seg.endLine} (${seg.lines} lines): ${seg.preview}`);
  }

  // 保存段落信息
  writeFileSync(join(OUTPUT_DIR, 'live-segments.json'), JSON.stringify(segments, null, 2));
  console.log(`\n[extract] Segments saved: ${segments.length} segments`);
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
      view.dispatch({ selection: { anchor: Math.min(lineInfo.from + c, lineInfo.to) } });
      view.focus();
    }, line, ch);
    await wait(60);
  };
  const typeText = async (text: string) => { await page.keyboard.type(text, { delay: 10 }); await wait(60); };
  const press = async (key: string) => {
    const parts = key.split('+');
    if (parts.length > 1) { for (const m of parts.slice(0,-1)) await page.keyboard.down(m); await page.keyboard.press(parts.at(-1)!); for (const m of parts.slice(0,-1).reverse()) await page.keyboard.up(m); }
    else await page.keyboard.press(key);
    await wait(60);
  };

  const doc = `# Title\n## Sub\n\n**bold** *it* ~~s~~ ==h==\n\n[l](https://x.com) [[w]]\n\n> bq\n> [!NOTE]\n> c\n\n- a\n  - b\n1. c\n- [ ] d\n- [x] e\n\n\`\`\`js\nx()\n\`\`\`\n\n#tag\n---`;
  await setDoc(doc);
  const lc = doc.split('\n').length;
  for (let i = 1; i <= lc; i++) { await clickLine(i); await wait(20); }
  await clickLine(lc);

  await setDoc(''); await clickLine(1); await typeText('# H\n\n**b** *i*\n- l\n> q\n[[k]]');
  await setDoc('- x'); await clickLine(1,3); await press('Enter'); await typeText('y'); await press('Enter'); await press('Enter');
  await setDoc(''); await clickLine(1); await typeText('(a) [b] `c` *d*');
  await setDoc('- a\n- b'); await clickLine(2,2); await press('Tab'); await press('Shift+Tab');
  await setDoc(''); await clickLine(1); await typeText('【【lk】】');
  await press('Control+s');
  await setDoc('abc'); await clickLine(1,3); await press('Backspace'); await press('Backspace');
  await setDoc('hello'); await page.evaluate(() => { const v=(window as any).__editorView; v.dispatch({selection:{anchor:0,head:5}}); v.focus(); }); await typeText('*');
}

main().catch(e => { console.error(e); process.exit(1); });
