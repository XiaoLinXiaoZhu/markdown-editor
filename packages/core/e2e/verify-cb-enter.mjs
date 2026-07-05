// 代码块内 Enter 行为：应保留缩进（代码语义），而非走列表续行清理
import puppeteer from 'puppeteer';
const URL = process.env.E2E_URL || 'http://localhost:3002';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 800 });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForSelector('.cm-editor', { timeout: 15000 });
await page.waitForFunction(() => window.__editorView != null, { timeout: 15000 });

const getDoc = () => page.evaluate(() => window.__editorView.state.doc.toString());
const setDoc = (t) => page.evaluate((x) => { const v = window.__editorView; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: x } }); }, t);
const putCursor = (lineNo, col) => page.evaluate(({ ln, c }) => { const v = window.__editorView; const line = v.state.doc.line(ln); v.dispatch({ selection: { anchor: line.from + c } }); v.focus(); }, { ln: lineNo, c: col });
const vis = (s) => JSON.stringify(s).replace(/\\t/g, '⇥').replace(/\\n/g, '↵');

// 场景：代码块内有一行 "\t1"，光标在行末，按 Enter
// Obsidian 期望: "```↵⇥1↵⇥↵```" (新行保留 tab 缩进)
await setDoc('```\n\t1\n```');
await putCursor(2, 2); // 第2行 "\t1" 末尾 (tab + '1' = 2 chars)
await new Promise(r => setTimeout(r, 150));
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 200));
console.log('场景1: 代码块内 "⇥1" 行末按 Enter');
console.log('  我们   :', vis(await getDoc()));
console.log('  Obsidian:', '"```↵⇥1↵⇥↵```"  (新行保留缩进)');

// 场景2: 代码块内一行只有 "\t"（无内容），按 Enter —— 代码语义应继续保留缩进，而非清理
await setDoc('```\n\t\n```');
await putCursor(2, 1);
await new Promise(r => setTimeout(r, 150));
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 200));
console.log('\n场景2: 代码块内仅 "⇥" 行按 Enter');
console.log('  我们   :', vis(await getDoc()));

await browser.close();
