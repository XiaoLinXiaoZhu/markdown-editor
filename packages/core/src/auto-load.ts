/**
 * Vendor 脚本自动加载
 *
 * 按 Obsidian 运行时依赖顺序加载 vendor 脚本。
 * 可在调用 createEditor() 前使用，也可以依赖页面已有的脚本标签。
 */

export interface AutoLoadOptions {
  /** 基础路径，vendor 脚本从此路径加载，默认 '/' */
  basePath?: string;
  /** 是否加载 MathJax（默认 false，按需加载） */
  math?: boolean;
  /** 自定义脚本路径映射（覆写默认路径） */
  overrides?: Record<string, string>;
}

const SCRIPT_ORDER = [
  'lib/i18next.min.js',
  'lib/codemirror.js',
  'lib/meta.min.js',
  'lib/modes.min.js',
  'lib/markdown.js',
  'lib/turndown.js',
  'enhance.js',
  'mock.js',
  'obsidian-app.patched.js',
];

const MATH_SCRIPTS = [
  'lib/mathjax/tex-chtml-full.js',
];

export function autoLoad(options: AutoLoadOptions = {}): Promise<void> {
  const base = options.basePath || '/vendor/';
  const overrides = options.overrides || {};

  const scripts = [...SCRIPT_ORDER];
  if (options.math) {
    scripts.push(...MATH_SCRIPTS);
  }

  return scripts.reduce((promise, script) => {
    return promise.then(() => {
      return new Promise<void>((resolve, reject) => {
        const src = overrides[script] || (base + script);
        const el = document.createElement('script');
        el.src = src;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('Failed to load: ' + src));
        document.head.appendChild(el);
      });
    });
  }, Promise.resolve());
}
