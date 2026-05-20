/**
 * E2E 测试基础设施 — Puppeteer 连接与生命周期管理
 *
 * 假设 apps/web dev server 已在 localhost:3002 运行。
 * 测试前需手动启动：cd apps/web && bun run dev
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

  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });

  // 等待编辑器就绪
  await page.waitForSelector('.cm-editor', { timeout: 15_000 });

  // 等待编辑器 view 被暴露到 window
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
