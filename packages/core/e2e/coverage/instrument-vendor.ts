/**
 * 运行时探针：用 npm @codemirror/* 替换 vendor 内嵌的 CM6，
 * 用 Proxy trap 捕获所有 CM5 调用。
 *
 * 用法：bun run packages/core/e2e/coverage/instrument-vendor.ts
 *
 * 产出：
 *   .temp/cm5-calls.log  — CM5 被访问的调用栈
 *   .temp/cm6-errors.log — CM6 npm 替换后不兼容的调用
 */
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

// ── 确保输出目录 ──
const tempDir = resolve('.temp');
if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

const CM5_LOG = resolve(tempDir, 'cm5-calls.log');
const CM6_LOG = resolve(tempDir, 'cm6-errors.log');

// 清空旧日志
writeFileSync(CM5_LOG, '');
writeFileSync(CM6_LOG, '');

function logCM5(msg: string) {
  appendFileSync(CM5_LOG, msg + '\n');
  console.log('[CM5]', msg);
}

function logCM6(msg: string) {
  appendFileSync(CM6_LOG, msg + '\n');
  console.log('[CM6]', msg);
}

// ── 1. 加载 npm CM6 包并 wrap ──
async function loadNpmCm6() {
  const pkgs: Record<string, any> = {};

  const pkgNames = [
    '@codemirror/state',
    '@codemirror/view',
    '@codemirror/language',
    '@codemirror/commands',
    '@codemirror/autocomplete',
    '@codemirror/search',
    '@codemirror/lint',
    '@codemirror/collab',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
  ];

  for (const name of pkgNames) {
    try {
      const mod = await import(name);
      pkgs[name] = wrapPackage(name, mod);
      console.log(`  [CM6] loaded ${name}: ${Object.keys(mod).length} exports`);
    } catch (e: any) {
      console.error(`  [CM6] FAILED to load ${name}: ${e.message}`);
      pkgs[name] = {};
    }
  }

  return pkgs;
}

function wrapPackage(pkgName: string, exports: any): any {
  const wrapped: any = {};

  for (const key of Object.keys(exports)) {
    const val = exports[key];
    if (typeof val === 'function') {
      // If the export name starts with uppercase, it's likely a class/constructor.
      // ES6 classes throw if called without `new`, so we always use `new`.
      const isClass = /^[A-Z]/.test(key);
      if (isClass) {
        const wrapper = function (...args: any[]) {
          // ES6 classes cannot be called without `new`. Since the vendor's
          // transpiled code doesn't rely on `this` for constructor calls,
          // we always use `new` regardless of call pattern.
          try {
            return new val(...args);
          } catch (e: any) {
            const stack = e.stack || new Error().stack || '';
            logCM6(`[${pkgName}.${key}] ERROR: ${e.message}\n${stack}\n`);
            throw e;
          }
        };
        // Copy all static properties from the original class to the wrapper,
        // so that constructs like Facet.define, StateField.define work correctly
        // when accessed through the instrumented exports.
        for (const staticKey of Object.getOwnPropertyNames(val)) {
          if (staticKey !== 'prototype' && staticKey !== 'length' && staticKey !== 'name') {
            try {
              wrapper[staticKey as keyof typeof wrapper] = val[staticKey];
            } catch (_) {
              // Some static properties may be non-configurable or read-only;
              // skip those silently.
            }
          }
        }
        wrapped[key] = wrapper;
      } else {
        wrapped[key] = function (...args: any[]) {
          try {
            return val.apply(this, args);
          } catch (e: any) {
            const stack = e.stack || new Error().stack || '';
            logCM6(`[${pkgName}.${key}] ERROR: ${e.message}\n${stack}\n`);
            throw e;
          }
        };
      }
    } else if (typeof val === 'object' && val !== null) {
      // For objects like Facet instances, wrap with a Proxy
      wrapped[key] = new Proxy(val, {
        get(target, prop) {
          const v = target[prop as keyof typeof target];
          if (typeof v === 'function') {
            return function (...args: any[]) {
              try {
                return v.apply(target, args);
              } catch (e: any) {
                const stack = e.stack || new Error().stack || '';
                logCM6(`[${pkgName}.${key}.${String(prop)}] ERROR: ${e.message}\n${stack}\n`);
                throw e;
              }
            };
          }
          return v;
        }
      });
    } else {
      wrapped[key] = val;
    }
  }

  return wrapped;
}

// ── 2. 创建 CM5 Proxy trap ──
function createCM5Trap(): any {
  return new Proxy(function () {
    logCM5('CodeMirror CALLED as function\n' + (new Error().stack || ''));
    return createCM5Trap();
  }, {
    get(_, prop) {
      logCM5(`CodeMirror.${String(prop)} ACCESSED\n` + (new Error().stack || ''));
      return createCM5Trap();
    },
    apply(_, thisArg, args) {
      logCM5(`CodeMirror CALLED with ${args.length} args\n` + (new Error().stack || ''));
      return createCM5Trap();
    },
    construct(_, args) {
      logCM5(`new CodeMirror with ${args.length} args\n` + (new Error().stack || ''));
      return createCM5Trap();
    },
  });
}

// ── 3. 设置全局环境并执行 vendor ──
async function run() {
  console.log('=== Instrumentation Setup ===\n');

  // 加载 npm CM6
  console.log('Loading npm CM6 packages...');
  const cm6All = await loadNpmCm6();

  // 暴露给 vendor（externalize 后的 vendor 会通过 window.__cm6_all 引用）
  (globalThis as any).window = globalThis;
  (globalThis as any).__cm6_all = cm6All;

  // CM5 trap
  (globalThis as any).CodeMirror = createCM5Trap();

  // 基础 browser mock
  setupBrowserMocks();

  // 加载并执行 externalized vendor
  console.log('\nLoading externalized vendor...');
  const vendorPath = resolve('vendor/obsidian-app.cm6-external.js');
  const vendorCode = readFileSync(vendorPath, 'utf8');

  try {
    console.log(`Executing vendor (${(vendorCode.length / 1024 / 1024).toFixed(2)} MB)...`);
    new Function('window', vendorCode)(globalThis);
    console.log('✓ Vendor executed successfully');
  } catch (e: any) {
    console.error('✗ Vendor execution FAILED:', e.message);
    logCM6(`VENDOR EXECUTION FAILED: ${e.message}\n${e.stack}\n`);
  }

  // 检查产物
  const w = globalThis as any;
  console.log('\n=== Results ===');
  console.log('__cm6:', typeof w.__cm6, w.__cm6 ? Object.keys(w.__cm6).join(', ') : 'N/A');
  console.log('__kH:', typeof w.__kH);
  console.log('__language:', typeof w.__language);
  console.log('__hangingIndent:', typeof w.__hangingIndent);

  console.log('\n=== Logs ===');
  console.log(`CM5 calls: ${CM5_LOG}`);
  console.log(`CM6 errors: ${CM6_LOG}`);
}

function setupBrowserMocks() {
  const g = globalThis as any;

  // Minimal DOM
  g.document = {
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, setAttribute() {}, appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {} }),
    createDocumentFragment: () => ({ appendChild() {} }),
    body: { classList: { add() {}, remove() {}, contains() { return false; } }, createDiv() { return g.document.createElement('div'); } },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  g.navigator = { clipboard: { writeText() {}, readText() { return Promise.resolve(''); } }, language: 'en', platform: 'Win32' };
  g.location = { href: 'http://localhost/' };
  g.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  g.requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  g.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  g.DOMPurify = { sanitize(h: string) { return h; }, addHook() {}, removeHook() {} };
  g.process = { platform: 'win32', env: {} };
  g.console = console;
  g.setTimeout = setTimeout;
  g.clearTimeout = clearTimeout;
  g.PerformanceObserver = class { observe() {} disconnect() {} };
  g.MutationObserver = class { observe() {} disconnect() {} };
  g.ResizeObserver = class { observe() {} disconnect() {} };
}

run().catch(e => {
  console.error('Fatal error:', e);
  throw e;
});
