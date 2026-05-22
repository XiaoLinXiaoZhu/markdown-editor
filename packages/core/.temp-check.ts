import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3002', { waitUntil: 'networkidle0', timeout: 15000 });
  await page.waitForFunction(() => (window as any).__editorView != null, { timeout: 10000 });

  // Set a simple table and move cursor away
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# Title\n\n| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n| 7 | 8 |\n\nEnd' } });
    // Move cursor to "End" to exit table
    const lastLine = view.state.doc.line(view.state.doc.lines);
    view.dispatch({ selection: { anchor: lastLine.from } });
    view.focus();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Check classes on each line
  const result = await page.evaluate(() => {
    const lines = document.querySelectorAll('.cm-content .cm-line');
    return Array.from(lines).map((el, i) => ({
      idx: i,
      text: (el.textContent || '').slice(0, 30),
      classes: Array.from(el.classList).filter(c => c.startsWith('cm-table') || c.startsWith('HyperMD')).join(' '),
    }));
  });

  for (const r of result) {
    console.log(`Line ${r.idx}: [${r.classes}] "${r.text}"`);
  }

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
