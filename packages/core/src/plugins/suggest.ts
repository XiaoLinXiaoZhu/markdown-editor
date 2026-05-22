/**
 * Suggest 插件 — Input Prompter
 *
 * 通用输入提示框架，支持多个 CompletionProvider 注册。
 * 每个 provider 声明自己的 trigger 和补全逻辑，suggest 插件统一管理：
 * - 弹窗 UI（位置计算、渲染、滚动）
 * - 键盘导航（ArrowUp/Down/Enter/Tab/Escape）
 * - 多 provider 优先级（先匹配先响应）
 *
 * 用法：
 *   editor.use(suggestPlugin);
 *   editor.registerSuggest({ trigger: /\[\[(.*)$/, getSuggestions, suffix: ']]' });
 *   editor.registerSuggest({ trigger: /#(.*)$/, getSuggestions });
 */
import type { EditorPlugin, PluginContext, SuggestItem } from '../types.js';
import type { CompletionProvider } from './types.js';

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

interface SuggestState {
  providers: CompletionProvider[];
  addProvider(provider: CompletionProvider): () => void;
  removeProvider(id: string): void;
  destroy(): void;
}

export const suggestPlugin: EditorPlugin = {
  id: 'suggest',

  install(ctx: PluginContext): any {
    const { EditorView, Prec, keymap, StateEffect } = (window as any).__cm6;
    const { view } = ctx;

    const providers: CompletionProvider[] = [];
    let suggestEl: HTMLElement | null = null;
    let suggestItems: SuggestItem[] = [];
    let selectedIdx = 0;
    let triggerFrom = -1;
    let activeProvider: CompletionProvider | null = null;

    function createSuggestEl() {
      if (suggestEl) return suggestEl;
      suggestEl = document.createElement('div');
      suggestEl.className = 'xlxz-suggest';
      suggestEl.style.cssText =
        'position:fixed;z-index:1000;' +
        'background:var(--background-secondary,#252526);' +
        'border:1px solid var(--background-modifier-border,#454545);' +
        'border-radius:4px;max-height:200px;overflow-y:auto;min-width:200px;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;display:none;';
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
      activeProvider = null;
    }

    function isVisible() {
      return suggestEl && suggestEl.style.display !== 'none';
    }

    function updateSelection(idx: number) {
      if (!suggestEl) return;
      selectedIdx = Math.max(0, Math.min(idx, suggestItems.length - 1));
      const items = suggestEl.querySelectorAll('[data-idx]');
      items.forEach((el, i) => {
        (el as HTMLElement).style.background = i === selectedIdx
          ? 'var(--background-modifier-hover,#04395e)' : '';
      });
      items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
    }

    function acceptSuggestion(idx: number) {
      if (idx < 0 || idx >= suggestItems.length || !activeProvider) return;
      const item = suggestItems[idx];
      const cursor = view.state.selection.main.head;
      const insertText = item.insertText + (activeProvider.suffix || '');
      view.dispatch({
        changes: { from: triggerFrom, to: cursor, insert: insertText },
        selection: { anchor: triggerFrom + insertText.length },
        userEvent: 'input.type',
      });
      const provider = activeProvider;
      hideSuggest();
      view.focus();
      if (provider.onAccept) provider.onAccept(item);
    }

    function getCoords(update: any) {
      const cursor = update.state.selection.main.head;
      let coords = update.view.coordsAtPos(cursor);
      if (!coords) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          if (rect.height > 0) coords = { left: rect.left, bottom: rect.bottom };
        }
      }
      if (!coords) {
        const cursorEl = update.view.dom.querySelector('.cm-cursor');
        if (cursorEl) {
          const r = cursorEl.getBoundingClientRect();
          coords = { left: r.left, bottom: r.bottom };
        }
      }
      if (!coords) {
        const r = update.view.dom.getBoundingClientRect();
        coords = { left: r.left + 50, bottom: r.top + 30 };
      }
      return coords;
    }

    // Update listener: check all providers on doc/selection change
    const listener = EditorView.updateListener.of((update: any) => {
      if (!update.docChanged && !update.selectionSet) return;
      if (providers.length === 0) { hideSuggest(); return; }

      const state = update.state;
      const cursor = state.selection.main.head;
      const line = state.doc.lineAt(cursor);
      const textBefore = line.text.slice(0, cursor - line.from);

      // Try each provider in registration order
      let matched = false;
      for (const provider of providers) {
        const match = textBefore.match(provider.trigger);
        if (match) {
          matched = true;
          const query = match[1] || '';
          triggerFrom = cursor - query.length;
          activeProvider = provider;

          const result = provider.getSuggestions(query);
          const handleItems = (items: SuggestItem[]) => {
            if (items.length === 0) { hideSuggest(); return; }
            const coords = getCoords(update);
            showSuggest(coords, items);
          };

          if (result instanceof Promise) { result.then(handleItems); }
          else { handleItems(result); }
          break;
        }
      }

      if (!matched) hideSuggest();
    });

    // Keyboard navigation (highest priority)
    const suggestKeymap = Prec.highest(keymap.of([
      {
        key: 'ArrowDown',
        run() {
          if (!isVisible()) return false;
          updateSelection(selectedIdx + 1);
          return true;
        },
      },
      {
        key: 'ArrowUp',
        run() {
          if (!isVisible()) return false;
          updateSelection(selectedIdx - 1);
          return true;
        },
      },
      {
        key: 'Enter',
        run() {
          if (!isVisible()) return false;
          acceptSuggestion(selectedIdx);
          return true;
        },
      },
      {
        key: 'Tab',
        run() {
          if (!isVisible()) return false;
          acceptSuggestion(selectedIdx);
          return true;
        },
      },
      {
        key: 'Escape',
        run() {
          if (!isVisible()) return false;
          hideSuggest();
          return true;
        },
      },
    ]));

    // Build suggest state for external access
    const suggestState: SuggestState = {
      providers,
      addProvider(provider: CompletionProvider) {
        providers.push(provider);
        return () => this.removeProvider(provider.id);
      },
      removeProvider(id: string) {
        const idx = providers.findIndex(p => p.id === id);
        if (idx !== -1) providers.splice(idx, 1);
      },
      destroy() {
        providers.length = 0;
        if (suggestEl) { suggestEl.remove(); suggestEl = null; }
      },
    };

    ctx.setState('suggest', suggestState);

    return [listener, suggestKeymap];
  },

  uninstall(ctx: PluginContext) {
    const state = ctx.getState<SuggestState>('suggest');
    if (state) state.destroy();
  },
};
