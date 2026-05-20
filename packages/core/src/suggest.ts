/**
 * 自动补全实现
 *
 * 基于 CM6 updateListener + DOM 弹窗的轻量 suggest 系统。
 * 支持 keyboard 导航（ArrowDown/ArrowUp/Enter/Tab/Escape）。
 */
import type { SuggestConfig, SuggestItem } from './types.js';

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

export function createSuggest(
  view: any,
  config: SuggestConfig,
): () => void {
  const { EditorView: EV, StateEffect, Prec, keymap: km } = (window as any).__cm6;

  let suggestEl: HTMLElement | null = null;
  let suggestItems: SuggestItem[] = [];
  let selectedIdx = 0;
  let triggerFrom = -1;
  let active = true;

  function createSuggestEl() {
    if (suggestEl) return suggestEl;
    suggestEl = document.createElement('div');
    suggestEl.className = 'xlxz-suggest';
    suggestEl.style.cssText = 'position:fixed;z-index:1000;background:var(--background-secondary,#252526);border:1px solid var(--background-modifier-border,#454545);border-radius:4px;max-height:200px;overflow-y:auto;min-width:200px;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;display:none;';
    document.body.appendChild(suggestEl);
    suggestEl.addEventListener('mousedown', (e) => e.preventDefault());
    suggestEl.addEventListener('click', (e) => {
      const itemEl = (e.target as HTMLElement).closest('[data-idx]');
      if (itemEl) acceptSuggestion(parseInt(itemEl.getAttribute('data-idx')!));
    });
    return suggestEl;
  }

  function showSuggest(coords: { left: number; bottom: number }, items: SuggestItem[]) {
    const el = createSuggestEl();
    suggestItems = items;
    selectedIdx = 0;
    el.innerHTML = items.map((item, i) =>
      `<div data-idx="${i}" style="padding:4px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${i === 0 ? 'background:var(--background-modifier-hover,#04395e);' : ''}">${escapeHtml(item.label)}</div>`
    ).join('');
    el.style.left = coords.left + 'px';
    el.style.top = (coords.bottom + 2) + 'px';
    el.style.display = 'block';
  }

  function hideSuggest() {
    if (suggestEl) suggestEl.style.display = 'none';
    suggestItems = [];
    triggerFrom = -1;
  }

  function updateSelection(idx: number) {
    if (!suggestEl) return;
    selectedIdx = Math.max(0, Math.min(idx, suggestItems.length - 1));
    const items = suggestEl.querySelectorAll('[data-idx]');
    items.forEach((el, i) => {
      (el as HTMLElement).style.background = i === selectedIdx ? 'var(--background-modifier-hover,#04395e)' : '';
    });
    items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
  }

  function acceptSuggestion(idx: number) {
    if (idx < 0 || idx >= suggestItems.length) return;
    const item = suggestItems[idx];
    const cursor = view.state.selection.main.head;
    const insertText = item.insertText + (config.suffix || '');
    view.dispatch({
      changes: { from: triggerFrom, to: cursor, insert: insertText },
      selection: { anchor: triggerFrom + insertText.length },
      userEvent: 'input.type',
    });
    hideSuggest();
    view.focus();
    if (config.onAccept) config.onAccept(item);
  }

  const listener = EV.updateListener.of((update: any) => {
    if (!active) return;
    if (!update.docChanged && !update.selectionSet) return;
    const state = update.state;
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);
    const textBefore = line.text.slice(0, cursor - line.from);
    const match = textBefore.match(config.trigger);
    if (!match) { hideSuggest(); return; }
    const query = match[1] || '';
    triggerFrom = cursor - query.length;
    const result = config.getSuggestions(query);
    const handleItems = (items: SuggestItem[]) => {
      if (items.length === 0) { hideSuggest(); return; }
      let coords = update.view.coordsAtPos(cursor);
      if (!coords) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          if (rect.height > 0) coords = { left: rect.left, bottom: rect.bottom };
        }
        if (!coords) {
          const cursorEl = update.view.dom.querySelector('.cm-cursor');
          if (cursorEl) { const r = cursorEl.getBoundingClientRect(); coords = { left: r.left, bottom: r.bottom }; }
          else { const r = update.view.dom.getBoundingClientRect(); coords = { left: r.left + 50, bottom: r.top + 30 }; }
        }
      }
      showSuggest(coords, items);
    };
    if (result instanceof Promise) { result.then(handleItems); }
    else { handleItems(result); }
  });

  const suggestKeymap = Prec.highest(km.of([
    {
      key: 'ArrowDown',
      run() {
        if (!suggestEl || suggestEl.style.display === 'none') return false;
        updateSelection(selectedIdx + 1);
        return true;
      },
    },
    {
      key: 'ArrowUp',
      run() {
        if (!suggestEl || suggestEl.style.display === 'none') return false;
        updateSelection(selectedIdx - 1);
        return true;
      },
    },
    {
      key: 'Enter',
      run() {
        if (!suggestEl || suggestEl.style.display === 'none') return false;
        acceptSuggestion(selectedIdx);
        return true;
      },
    },
    {
      key: 'Tab',
      run() {
        if (!suggestEl || suggestEl.style.display === 'none') return false;
        acceptSuggestion(selectedIdx);
        return true;
      },
    },
    {
      key: 'Escape',
      run() {
        if (!suggestEl || suggestEl.style.display === 'none') return false;
        hideSuggest();
        return true;
      },
    },
  ]));

  view.dispatch({ effects: StateEffect.appendConfig.of([listener, suggestKeymap]) });

  return () => {
    active = false;
    if (suggestEl) { suggestEl.remove(); suggestEl = null; }
  };
}
