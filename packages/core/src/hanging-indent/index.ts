/**
 * Hanging Indent — 列表悬挂缩进引擎
 *
 * 1:1 逆向自 Obsidian vendor 的 `window.__hangingIndent`（混淆符号 lD / sD）。
 * 底本：webcrack deobfuscated.js（sD 类 L62378-62616 + 辅助 oD/aD/Tt/Ql/Uf）。
 *
 * 行为：对列表项的续行做悬挂缩进——首行标记之后的换行文本，
 * 通过 text-indent（负）+ padding-inline-start（正）对齐到标记之后的位置。
 * 代码块内的行不参与（由 NodeProp 检测）。
 *
 * 实现保留原逻辑的两阶段结构：
 *  1. buildDeco：基于字符宽度的估算装饰（快速、视口级）
 *  2. updateDomInternal：基于真实 DOM 测量的精确装饰（MutationObserver 触发，修正字体/连字差异）
 *
 * 跨边界依赖：代码块检测所用的两个 NodeProp 实例由 vendor 创建，
 * 引用身份必须与 __language 产出的语法树一致，故通过 window.__nodeProps 注入，
 * 而非在此重建（重建会得到不同实例，prop 查询永远落空）。
 */

interface IndentCacheEntry {
  text: string;
  size: number;
  dirty: boolean;
}

// oD — 提取行首的"列表前缀"（blockquote + 列表标记 + 可选 checkbox）；无则返回 null
const LIST_PREFIX_REGEX = /^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/;
function extractListPrefix(text: string): string | null {
  const m = LIST_PREFIX_REGEX.exec(text);
  if (m && m[0]) return m[0];
  return null;
}

// Tt — 计算字符串在给定 tabSize 下展开的列宽（制表符按 tab stop 对齐）
function visualColumnWidth(text: string, tabSize: number, end: number = text.length): number {
  let col = 0;
  for (let i = 0; i < end; ) {
    if (text.charCodeAt(i) === 9 /* \t */) {
      col += tabSize - (col % tabSize);
      i++;
    } else {
      col++;
      // 推进一个码点（处理代理对）
      i = nextCodePoint(text, i);
    }
  }
  return col;
}

// ee — 推进到下一个码点边界（处理 UTF-16 代理对）
function nextCodePoint(text: string, i: number): number {
  const code = text.charCodeAt(i);
  if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
    const next = text.charCodeAt(i + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return i + 2;
  }
  return i + 1;
}

export function createHangingIndentExtension() {
  const cm6 = (window as any).__cm6;
  const pkgs = (window as any).__cm6_packages;
  const nodeProps = (window as any).__nodeProps;

  const { ViewPlugin, Decoration, syntaxTree, StateEffect } = cm6;
  const { RangeSetBuilder } = pkgs['@codemirror/state'];
  const { Direction } = pkgs['@codemirror/view'];

  // mp / fp — 代码块检测用的 NodeProp 实例（由 vendor 注入，不可重建）
  const hmdCodeblockProp = nodeProps?.hmdCodeblock;
  const hmdIndentedCodeProp = nodeProps?.hmdIndentedCode;

  // aD — 判断 [from, to) 范围是否落在代码块内（代码块行不加悬挂缩进）
  function inCodeBlock(tree: any, from: number, to: number): boolean {
    let found = false;
    tree.iterate({
      from,
      to,
      enter(node: any) {
        const type = node.type;
        if (hmdCodeblockProp) {
          const v = type.prop(hmdCodeblockProp);
          if (v && v.contains('HyperMD-codeblock')) found = true;
        }
        if (hmdIndentedCodeProp) {
          const v = type.prop(hmdIndentedCodeProp);
          if (v && v.contains('hmd-indented-code')) found = true;
        }
      },
    });
    return found;
  }

  // Ql — 把回调节流到下一个 microtask（合并连续调用，保留最后一次 this/args）
  const scheduleMicrotask: (cb: () => void) => void =
    (window as any).queueMicrotask?.bind(window) ?? ((cb: () => void) => setTimeout(cb, 0));

  function throttleToMicrotask<T extends (...args: any[]) => void>(fn: T): T {
    let savedThis: any = null;
    let savedArgs: any[] | null = null;
    let scheduled = false;
    function flush() {
      scheduled = false;
      const t = savedThis;
      const a = savedArgs;
      savedThis = null;
      savedArgs = null;
      fn.apply(t, a as any[]);
    }
    return function (this: any, ...args: any[]) {
      savedThis = this;
      savedArgs = args;
      if (!scheduled) {
        scheduled = true;
        scheduleMicrotask(flush);
      }
    } as T;
  }

  // Uf — 判断 transactions 中是否存在某个 StateEffect
  function hasEffect(transactions: readonly any[], effectType: any): boolean {
    return transactions.some((tr) => tr.effects.some((e: any) => e.is(effectType)));
  }

  // clearCache — 清空缓存的信号 effect
  const clearCacheEffect = StateEffect.define();

  // sD — 悬挂缩进 ViewPlugin 的核心类
  class HangingIndentPlugin {
    decorations: any;
    indentCache: Map<number, IndentCacheEntry>;
    markCache: Map<number, any>;
    requestUpdateDom: () => void;
    view: any;
    observer: MutationObserver;
    tree: any;

    constructor(view: any) {
      this.decorations = Decoration.none;
      this.indentCache = new Map();
      this.markCache = new Map();
      this.requestUpdateDom = throttleToMicrotask(this.updateDom.bind(this));
      this.view = view;
      this.observer = new MutationObserver((mutations) => this.checkMutations(mutations));
      this.observe();
      this.buildDeco(view);
    }

    destroy() {
      this.observer.disconnect();
    }

    update(update: any) {
      const cache = this.indentCache;
      if (hasEffect(update.transactions, clearCacheEffect)) {
        cache.clear();
        this.markCache.clear();
      }
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.geometryChanged ||
        update.selectionSet ||
        update.focusChanged ||
        this.tree !== syntaxTree(update.view.state)
      ) {
        this.buildDeco(update.view);
        this.requestUpdateDom();
      }
    }

    // 第一阶段：基于字符宽度的估算装饰（line decoration，视口级）
    buildDeco(view: any) {
      const cache = this.indentCache;
      const charWidth = view.defaultCharacterWidth;
      const builder = new RangeSetBuilder();
      const markCache = this.markCache;
      const tree = syntaxTree(view.state);
      this.tree = tree;

      for (const block of view.viewportLineBlocks) {
        const line = view.state.doc.lineAt(block.from);
        const lineNum = line.number;
        const prefix = extractListPrefix(line.text);

        if (prefix && !inCodeBlock(tree, line.from, line.from + prefix.length)) {
          let entry = this.getCached(lineNum, prefix);
          entry ||= {
            text: prefix,
            size: Math.floor(visualColumnWidth(prefix, view.state.tabSize) * charWidth),
            dirty: false,
          };
          const size = entry.size;
          if (size > 0) {
            let mark = markCache.get(size);
            if (!mark) {
              mark = Decoration.line({
                attributes: {
                  style: `text-indent:${-size}px;padding-inline-start:${size}px`,
                },
              });
              markCache.set(size, mark);
            }
            builder.add(line.from, line.from, mark);
          }
        } else {
          cache.delete(lineNum);
        }
      }
      this.decorations = builder.finish();
    }

    observe() {
      this.observer.observe(this.view.contentDOM, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }

    checkMutations(mutations: MutationRecord[]) {
      const view = this.view;
      const contentDOM = view.contentDOM;
      const touched = new Set<Element>();
      for (const mutation of mutations) {
        let node: Node = mutation.target;
        while (node.parentNode && node.parentNode !== contentDOM) {
          node = node.parentNode;
        }
        if (node && contentDOM.contains(node)) {
          touched.add(node as Element);
        }
      }
      let dirty = false;
      for (const el of Array.from(touched)) {
        if (el instanceof HTMLElement && el.classList.contains('cm-line')) {
          const pos = view.posAtDOM(el);
          const line = view.state.doc.lineAt(pos);
          const entry = this.indentCache.get(line.number);
          if (entry) {
            entry.dirty = true;
            dirty = true;
          }
        }
      }
      if (dirty) {
        this.requestUpdateDom();
      }
    }

    getCached(lineNum: number, text: string): IndentCacheEntry | null {
      const cache = this.indentCache;
      const cur = cache.get(lineNum);
      if (cur && cur.text === text) return cur;
      const prev = cache.get(lineNum - 1);
      if (prev && prev.text === text) return prev;
      const next = cache.get(lineNum + 1);
      if (next && next.text === text) return next;
      if (cur && cur.text.length === text.length) return cur;
      return null;
    }

    // updateDom — 在冻结 scrollTop 的前提下做精确 DOM 测量（避免测量过程引发滚动跳动）
    updateDom() {
      const saved = this.requestUpdateDom;
      const scrollDOM = this.view.scrollDOM;
      this.view.coordsAtPos(0);
      const scrollTop = scrollDOM.scrollTop;
      try {
        this.requestUpdateDom = () => {};
        Object.defineProperty(scrollDOM, 'scrollTop', {
          configurable: true,
          get() {
            return scrollTop;
          },
          set() {
            return;
          },
        });
        const pending = this.observer.takeRecords();
        this.observer.disconnect();
        if (pending.length > 0) {
          this.checkMutations(pending);
        }
        this.updateDomInternal();
      } finally {
        this.requestUpdateDom = saved;
        this.observe();
        delete (scrollDOM as any).scrollTop;
      }
    }

    // 第二阶段：基于真实 coordsAtPos 测量的精确缩进（直接写 inline style）
    updateDomInternal() {
      const view = this.view;
      const cache = this.indentCache;
      const contentDOM = view.contentDOM;
      if (!contentDOM.offsetParent) return;

      const tree = this.tree;
      const candidates: { lineEl: HTMLElement; pos: number; line: number; text: string }[] = [];

      for (const child of Array.from(contentDOM.childNodes)) {
        if (child instanceof HTMLElement && child.classList.contains('cm-line')) {
          const pos = view.posAtDOM(child);
          const line = view.state.doc.lineAt(pos);
          if (tree.length < line.to) break;
          const prefix = extractListPrefix(line.text);
          if (prefix && !inCodeBlock(tree, line.from, line.from + prefix.length)) {
            const cached = cache.get(line.number);
            if (!cached || cached.text !== prefix || cached.dirty) {
              candidates.push({ lineEl: child, pos: line.from, line: line.number, text: prefix });
            }
          }
        }
      }

      if (candidates.length === 0) return;

      // 先清空待测量行的 inline style，确保 coordsAtPos 测的是未缩进的真实位置
      for (const c of candidates) {
        c.lineEl.style.textIndent = '';
        c.lineEl.style.paddingInlineStart = '';
      }

      const results: { lineEl: HTMLElement; size: number }[] = [];
      let cacheChanged = false;

      for (const cand of candidates) {
        const { lineEl, pos, line, text } = cand;
        const startCoords = view.coordsAtPos(pos, 1);
        let endCoords = view.coordsAtPos(pos + text.length, 1);
        if (startCoords && endCoords) {
          const dir = view.textDirectionAt(pos);
          const rect = lineEl.getBoundingClientRect();
          const style = getComputedStyle(lineEl);
          const base =
            dir === Direction.LTR
              ? rect.left + parseFloat(style.borderLeft)
              : rect.right - parseFloat(style.borderRight);

          let size = Math.floor(
            Math.abs((dir === Direction.LTR ? endCoords.right : endCoords.left) - base),
          );

          // 若测出的偏移过大（超过半行宽），换用 bias=-1 重测一次
          if (size && size > lineEl.offsetWidth / 2) {
            endCoords = view.coordsAtPos(pos + text.length, -1);
            if (!endCoords) continue;
            size = Math.floor(
              Math.abs((dir === Direction.LTR ? endCoords.right : endCoords.left) - base),
            );
          }

          if (size) {
            const cached = cache.get(line);
            if (cached && cached.size === size) {
              cached.text = text;
              cached.dirty = false;
            } else {
              cache.set(line, { text, size, dirty: false });
              cacheChanged = true;
            }
            results.push({ lineEl, size });
          }
        }
      }

      for (const r of results) {
        r.lineEl.style.textIndent = `${-r.size}px`;
        r.lineEl.style.paddingInlineStart = `${r.size}px`;
      }

      // 缓存有更新 → 重建估算装饰，使下次 buildDeco 用上精确值
      if (cacheChanged) {
        this.buildDeco(this.view);
      }
    }
  }

  // lD — ViewPlugin.define(view => new sD(view), { decorations })
  return ViewPlugin.define((view: any) => new HangingIndentPlugin(view), {
    decorations: (plugin: HangingIndentPlugin) => plugin.decorations,
  });
}
