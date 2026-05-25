/**
 * cm6-runtime.ts — npm @codemirror/* 运行时
 *
 * 在 vendor 加载前 import 此模块，它会：
 * 1. 加载所有 @codemirror/* 和 @lezer/* npm 包
 * 2. 用 ES5/ES6 compat wrapper 包裹所有 class
 * 3. 设置 window.__cm6_all，供 externalized vendor 引用
 *
 * 用法：
 *   <script type="module">
 *     import { initCm6Runtime } from './cm6-runtime.ts';
 *     await initCm6Runtime();
 *     // 然后加载 externalized vendor
 *   </script>
 */

export interface Cm6RuntimeOptions {
  /** 日志回调，默认 console.log */
  onLog?: (msg: string, level: 'info' | 'warn' | 'error') => void;
}

// ── ES5/ES6 class compat wrapper ──
function wrapClass(OriginalClass: any): any {
  const wrapper = function (this: any, ...args: any[]) {
    return new OriginalClass(...args);
  };
  // 拷贝静态属性
  for (const key of Object.getOwnPropertyNames(OriginalClass)) {
    if (key !== 'prototype' && key !== 'length' && key !== 'name') {
      try {
        (wrapper as any)[key] = OriginalClass[key];
      } catch (_) {
        // 某些属性可能不可写，跳过
      }
    }
  }
  return wrapper;
}

function wrapPackage(pkgName: string, exports: any, log: (msg: string, level: string) => void): any {
  const wrapped: any = {};
  for (const key of Object.keys(exports)) {
    const val = exports[key];
    if (typeof val === 'function') {
      const isClass = /^[A-Z]/.test(key);
      wrapped[key] = isClass ? wrapClass(val) : val;
    } else {
      wrapped[key] = val;
    }
  }
  return wrapped;
}

const PKG_NAMES = [
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

export async function initCm6Runtime(options: Cm6RuntimeOptions = {}): Promise<void> {
  const log = options.onLog || (() => {});

  log('初始化 CM6 npm 运行时...', 'info');

  const cm6All: Record<string, any> = {};

  for (const name of PKG_NAMES) {
    try {
      const mod = await import(/* @vite-ignore */ name);
      cm6All[name] = wrapPackage(name, mod, log);
      log(`  ${name}: ${Object.keys(mod).length} exports`, 'info');
    } catch (e: any) {
      log(`  ${name}: FAILED — ${e.message}`, 'error');
      cm6All[name] = {};
    }
  }

  (window as any).__cm6_all = cm6All;
  log('CM6 npm 运行时就绪', 'info');
}
