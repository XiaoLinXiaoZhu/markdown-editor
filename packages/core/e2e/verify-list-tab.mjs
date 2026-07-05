// 复现：有序列表 Tab 缩进后的重新编号行为
import puppeteer from 'puppeteer';
const URL = process.env.E2E_URL || 'http://localhost:3002';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 800 });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForSelector('.cm-editor', { timeout: 15000 });
await page.waitForFunction(() => window.__editorView != null, { timeout: 15000 });

async function getDoc() {
  return await page.evaluate(() => window.__editorView.state.doc.toString());
}
async function setDoc(text) {
  await page.evaluate((t) => {
    const v = window.__editorView;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
  }, text);
}
async function cursorToEnd() {
  await page.evaluate(() => {
    const v = window.__editorView;
    const end = v.state.doc.length;
    v.dispatch({ selection: { anchor: end } });
    v.focus();
  });
}

// 起点
await setDoc('1. 1\n2. 1');
await cursorToEnd();
await new Promise((r) => setTimeout(r, 150));
console.log('=== 起点 ===\n' + JSON.stringify(await getDoc()));

// 回车
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 200));
console.log('\n=== 回车后（期望末行 "3. "） ===\n' + JSON.stringify(await getDoc()));

// Tab
await page.keyboard.press('Tab');
await new Promise((r) => setTimeout(r, 200));
console.log('\n=== Tab 后（期望末行缩进 + "1. "） ===\n' + JSON.stringify(await getDoc()));

await browser.close();
