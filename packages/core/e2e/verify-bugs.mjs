// 实测两个 bug 的精确文档输出（含不可见字符），与 Obsidian 基准逐字符对照
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
const cursorEnd = () => page.evaluate(() => { const v = window.__editorView; v.dispatch({ selection: { anchor: v.state.doc.length } }); v.focus(); });
const vis = (s) => JSON.stringify(s).replace(/\\t/g, '⇥').replace(/\\n/g, '↵');

// ── Bug 1: 有序列表 Tab ──
await setDoc('1. 1\n2. 1');
await cursorEnd();
await new Promise(r => setTimeout(r, 150));
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 200));
const afterEnter = await getDoc();
await page.keyboard.press('Tab');
await new Promise(r => setTimeout(r, 200));
const afterTab = await getDoc();
console.log('=== Bug1: 有序列表 ===');
console.log('回车后:', vis(afterEnter));
console.log('Tab后 :', vis(afterTab), '  ← Obsidian 期望: "1. 1↵2. 1↵⇥1. "');

// ── Bug 2: 代码块内 Tab + Enter ──
// 在一个代码块内，光标在内容行，按 Tab 再 Enter
await setDoc('```\n123\n```');
// 光标放到 "123" 行末 (第2行末)
await page.evaluate(() => {
  const v = window.__editorView;
  const line2 = v.state.doc.line(2); // "123"
  v.dispatch({ selection: { anchor: line2.to } });
  v.focus();
});
await new Promise(r => setTimeout(r, 150));
await page.keyboard.press('Tab');
await new Promise(r => setTimeout(r, 150));
const cbAfterTab = await getDoc();
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 150));
const cbAfterEnter = await getDoc();
console.log('\n=== Bug2: 代码块内 Tab+Enter（起点 "```↵123↵```"，光标在123行末） ===');
console.log('Tab后  :', vis(cbAfterTab));
console.log('Enter后 :', vis(cbAfterEnter));

await browser.close();
