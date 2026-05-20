/**
 * CM6 扩展组装
 *
 * 组装所有 CM6 扩展（keymap、行号、折叠、自动配对、Live Preview、表格、中文转换等），
 * 返回完整的 Extension 数组供 EditorState.create 使用。
 */
import { createTableExtension } from './table/index.js';

export function buildExtensions(
  view: any,
  editorEl: HTMLElement,
  mockEditor: any,
  mockOwner: any,
  opts: Record<string, any>,
) {
  const cm6 = (window as any).__cm6;
  const { EditorView, EditorState, keymap } = cm6;
  const { editor: jB, owner: WB, livePreview: KB } = (window as any).__stateFields;
  const { inputHandler: pT, stateField: lT, keymap: fT, markdownSurround: iB } = (window as any).__closeBrackets;
  const { base: ZB } = (window as any).__compartments;

  // Vendor 扩展（可能为 undefined）
  const __indentMore = (window as any).__commands?.indentMore;
  const __indentLess = (window as any).__commands?.indentLess;
  const __newlineAndIndent = (window as any).__commands?.newlineAndIndent;
  const __lineNumbers = (window as any).__lineNumbers;
  const __activeLineGutter = (window as any).__activeLineGutter;
  const __highlightActiveLineGutter = (window as any).__highlightActiveLineGutter;
  const __indentUnit = (window as any).__indentUnit;
  const __indentGuide = (window as any).__indentGuide;

  const stateExtensions: any[] = [];

  // ── 基础 CM6 StateField ──
  stateExtensions.push(jB.init(() => mockEditor));
  stateExtensions.push(WB.init(() => mockOwner));

  // ── Tab / 缩进 ──
  const indent = opts.useTab ? '\t' : ' '.repeat(Math.min(Math.max(opts.tabSize ?? 4, 2), 4));
  stateExtensions.push(EditorState.tabSize.of(opts.tabSize));
  if (__indentUnit) stateExtensions.push(__indentUnit.of(indent));

  // ── 行号 ──
  if (opts.showLineNumber && __lineNumbers) {
    stateExtensions.push(__lineNumbers({ fixed: false }));
    if (__activeLineGutter) stateExtensions.push(__activeLineGutter);
    if (__highlightActiveLineGutter) stateExtensions.push(__highlightActiveLineGutter());
  }

  // ── 缩进指引 ──
  if (opts.showIndentGuide && __indentGuide) {
    stateExtensions.push(__indentGuide);
  }

  // ── 语言 / 悬挂缩进 ──
  if ((window as any).__language) {
    stateExtensions.push((window as any).__language);
  }
  if ((window as any).__hangingIndent) {
    stateExtensions.push((window as any).__hangingIndent);
  }

  // ── Keymap：Enter 列表续行 + Tab 缩进 + Ctrl+S ──
  const __listRegex = /^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?/;
  stateExtensions.push(keymap.of([
    {
      key: 'Enter',
      run(v: any) {
        const state = v.state;
        const { head } = state.selection.main;
        const line = state.doc.lineAt(head);
        const match = __listRegex.exec(line.text);
        if (!match) return false;
        const prefix = match[0];
        const blockquote = match[1] || '';
        const listMarker = match[2] || '';

        if (!blockquote && !listMarker) return false;

        // 空列表项：删除标记
        if (line.text.slice(prefix.length).trim() === '') {
          v.dispatch({
            changes: { from: line.from, to: line.to, insert: '' },
            userEvent: 'input.type',
          });
          return true;
        }

        if (listMarker) {
          let newMarker = listMarker;
          const ordNum = match[4];
          if (ordNum) {
            const sep = match[5];
            newMarker = (parseInt(ordNum) + 1) + sep;
          }
          const checkbox = match[6] !== undefined ? '[ ] ' : '';
          if (checkbox) newMarker = newMarker.replace(/\[.\] $/, '');
          const insert = '\n' + blockquote + newMarker + checkbox;
          v.dispatch({
            changes: { from: head, insert },
            selection: { anchor: head + insert.length },
            userEvent: 'input.type',
          });
        } else {
          const insert = '\n' + blockquote;
          v.dispatch({
            changes: { from: head, insert },
            selection: { anchor: head + insert.length },
            userEvent: 'input.type',
          });
        }
        return true;
      },
      shift(v: any) {
        if (__newlineAndIndent) return __newlineAndIndent(v);
        return false;
      },
      preventDefault: true,
    },
    {
      key: 'Tab',
      run(v: any) {
        if (__indentMore) return __indentMore(v);
        return false;
      },
      shift(v: any) {
        if (__indentLess) return __indentLess(v);
        return false;
      },
    },
    {
      key: 'Mod-s',
      run(v: any) {
        if (opts.onSave) opts.onSave(v.state.doc.toString());
        return true;
      },
      preventDefault: true,
    },
  ]));

  // ── 内容属性 ──
  stateExtensions.push(EditorView.contentAttributes.of({
    spellcheck: String(opts.spellcheck),
    autocorrect: 'on',
    autocapitalize: 'on',
    contenteditable: 'true',
  }));

  // ── onChange 回调 ──
  stateExtensions.push(EditorView.updateListener.of((update: any) => {
    if (update.docChanged && opts.onChange) {
      opts.onChange(update.state.doc.toString());
    }
  }));

  // ── 折叠支持 ──
  if (opts.foldHeading || opts.foldIndent) {
    const foldGutter = (window as any).__foldGutter;
    const foldExtensions = (window as any).__foldExtensions;
    const foldHeading = (window as any).__foldHeading;
    const foldIndent = (window as any).__foldIndent;
    const foldEffect = (window as any).__foldEffect;
    if (foldGutter && foldExtensions) {
      editorEl.classList.add('is-folding');
      stateExtensions.push(foldGutter());
      stateExtensions.push(...foldExtensions);
      if (opts.foldHeading && foldHeading) stateExtensions.push(foldHeading);
      if (opts.foldIndent && foldIndent) stateExtensions.push(foldIndent);
      if (foldEffect) stateExtensions.push(foldEffect);
    }
  }

  // ── 自动配对 ──
  if (opts.autoPairBrackets || opts.autoPairMarkdown) {
    const brackets: string[] = [];
    if (opts.autoPairBrackets) brackets.push('(', '[', '{', "'", '"');
    if (opts.autoPairMarkdown) brackets.push('*', '_', '`', '```');
    if (pT && lT && fT && iB) {
      stateExtensions.push(pT, lT);
      stateExtensions.push(keymap.of(fT));
      stateExtensions.push(EditorState.languageData.of(() => [{ closeBrackets: { brackets } }]));
      stateExtensions.push(iB);
      if ((window as any).__frontmatterHandler) {
        stateExtensions.push((window as any).__frontmatterHandler);
      }
    }
  }

  // ── Live Preview ──
  const KB_ext = (window as any).__stateFields?.livePreview;
  if (KB_ext) {
    stateExtensions.push(KB_ext.init(() => true));
  }
  const livePreviewExts = (window as any).__kH?.(mockEditor, view);
  if (livePreviewExts) {
    stateExtensions.push(livePreviewExts);
  }

  // ── Base extensions（Obsidian 基础扩展集） ──
  if ((window as any).__baseExtensions) {
    stateExtensions.push(ZB.of((window as any).__baseExtensions));
  }

  // ── 纯文本表格扩展 ──
  stateExtensions.push(...createTableExtension());

  // ── 中文括号自动转换：【【→[[, 】】→]], ···→``` ──
  const rules = [
    { regex: /(！)?【【$/, replace: (m: RegExpMatchArray) => m[1] ? '![[' : '[[' },
    { regex: /】】$/, replace: () => ']]' },
    { regex: /···$/, replace: () => '```' },
  ];
  stateExtensions.push(EditorView.updateListener.of((update: any) => {
    if (!update.docChanged) return;
    const isUserInput = update.transactions.some((tr: any) => tr.isUserEvent('input'));
    if (!isUserInput) return;
    const state = update.state;
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);
    const textBefore = line.text.slice(0, cursor - line.from);
    for (const rule of rules) {
      const match = textBefore.match(rule.regex);
      if (match) {
        const replaceText = rule.replace(match);
        const from = cursor - match[0].length;
        setTimeout(() => {
          view.dispatch({
            changes: { from, to: cursor, insert: replaceText },
            selection: { anchor: from + replaceText.length },
            userEvent: 'input.type',
          });
        }, 0);
        break;
      }
    }
  }));

  return stateExtensions;
}


