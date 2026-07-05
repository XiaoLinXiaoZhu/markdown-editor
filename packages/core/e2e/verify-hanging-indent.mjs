// 悬挂缩进行为验证：测量列表续行的 text-indent / padding-inline-start
// 以及代码块内行是否被正确排除。输出可用于"誊写前 vs 后"数值对比。
import puppeteer from 'puppeteer';

const URL = process.env.E2E_URL || 'http://localhost:3002';

// 构造：长列表项（会换行产生续行）+ 代码块内的伪列表行（不应缩进）
const DOC = [
  '- This is a fairly long unordered list item that should wrap onto a second visual line so that hanging indent applies to the continuation.',
  '1. An ordered list item that is also long enough to wrap onto multiple visual lines for measuring the hanging indent offset value precisely.',
  '',
  '```',
  '- not a real list inside a code block, must NOT get hanging indent',
  '```',
  '',
  'normal paragraph line',
].join('\n');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 700, height: 800 }); // 窄视口强制换行
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForSelector('.cm-editor', { timeout: 15000 });
await page.waitForFunction(() => window.__editorView != null, { timeout: 15000 });

// 设置文档
await page.evaluate((doc) => {
  const v = window.__editorView;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: doc } });
}, DOC);

// 等悬挂缩进的 microtask + DOM 测量完成
await new Promise((r) => setTimeout(r, 600));

const result = await page.evaluate(() => {
  const lines = Array.from(document.querySelectorAll('.cm-editor .cm-line'));
  return lines.map((el, i) => {
    const s = el.style;
    return {
      i,
      text: el.textContent.slice(0, 45),
      textIndent: s.textIndent || '',
      paddingInlineStart: s.paddingInlineStart || '',
      isCodeblock: el.className.includes('codeblock') || el.className.includes('HyperMD-codeblock'),
    };
  });
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
