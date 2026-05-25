/**
 * cm5-trap.ts — CodeMirror 5 Proxy trap
 *
 * 在 vendor 加载前设置 window.CodeMirror = createCM5Trap()，
 * 拦截所有对 CM5 的访问和调用，记录完整调用栈。
 *
 * 产出：Console 日志中带 [CM5] 前缀的消息，包含调用栈。
 */

export interface Cm5TrapOptions {
  /** 日志回调 */
  onLog?: (msg: string, stack: string) => void;
  /** 是否在 CM5 被访问时抛出错误（true=严格模式，阻断执行） */
  strict?: boolean;
}

function noop(..._args: any[]): any {
  return createCM5Trap();
}

export function createCM5Trap(options: Cm5TrapOptions = {}): any {
  const { onLog, strict } = options;

  function log(accessPath: string) {
    const stack = new Error().stack || '';
    const msg = `[CM5] ${accessPath}`;
    console.warn(msg, '\n' + stack.split('\n').slice(2, 8).join('\n'));
    onLog?.(msg, stack);
    if (strict) throw new Error(`CM5 access blocked: ${accessPath}`);
  }

  return new Proxy(function () {
    log('CodeMirror() called as function');
    return createCM5Trap(options);
  }, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'prototype') return undefined;
      log(`CodeMirror.${String(prop)}`);
      // Return another trap so chained accesses also log
      return createCM5Trap(options);
    },
    apply(_target, _thisArg, args) {
      log(`CodeMirror(${args.length} args) called`);
      return createCM5Trap(options);
    },
    construct(_target, args) {
      log(`new CodeMirror(${args.length} args)`);
      return createCM5Trap(options);
    },
  });
}
