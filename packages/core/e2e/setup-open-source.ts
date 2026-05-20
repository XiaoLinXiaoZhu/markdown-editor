/**
 * E2E 测试基础设施 — 开源 Live Preview 版本
 * 
 * 与 setup.ts 相同，但在页面加载前设置 __useOpenSourceLivePreview = true
 * 使编辑器使用开源 Live Preview 实现而非 vendor __kH。
 */
import puppeteer, { type Browser, type Page } from 'puppeteer';

let browser: Browser | null = null;
let page: Page | null = null;

const BASE_URL = process.env.E2E_URL || 'http://localhost:3002';
const HEADLESS = process.env.E2E_HEADLESS !== 'false';

export async function launch(): Promise<Page> {
  if (page) return page;

  browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 关键：在页面加载前启用开源 Live Preview
  await page.evaluateOnNewDocument(() => {
    (window as any).__useOpenSourceLivePreview = true;
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });

  // 等待编辑器就绪
  await page.waitForSelector('.cm-editor', { timeout: 15_000 });
  await page.waitForFunction(
    () => (window as any).__editorView != null,
    { timeout: 15_000 },
  );

  return page;
}

export async function teardown(): Promise<void> {
  if (page) {
    await page.close().catch(() => {});
    page = null;
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

export function getPage(): Page {
  if (!page) throw new Error('Page not initialized. Call launch() first.');
  return page;
}
