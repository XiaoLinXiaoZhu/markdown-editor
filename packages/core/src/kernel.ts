/**
 * 微内核 — createEditor()
 *
 * 职责严格限定：
 * 1. 创建 CM6 EditorView
 * 2. 管理插件注册表（use/unuse）
 * 3. 暴露文档读写接口
 * 4. 根据 options 组装默认插件集
 *
 * 所有编辑功能通过插件实现，内核不包含任何具体功能逻辑。
 */
import type { EditorBackend, EditorOptions, EditorInstance, EditorPlugin, PluginContext, SuggestConfig } from './types.js';
import type { CompletionProvider } from './plugins/types.js';
import { defaultBackend, defaultOptions } from './defaults.js';
import { createMockOwner, createMockApp, createMockEditor } from './mocks.js';
import { getDefaultPlugins } from './plugin-defaults.js';

export { autoLoad } from './auto-load.js';
export type { AutoLoadOptions } from './auto-load.js';

export function createEditor(
  container: HTMLElement,
  options: EditorOptions = {},
  backend: EditorBackend = {}
): EditorInstance {
  const opts = { ...defaultOptions, ...options } as EditorOptions & typeof defaultOptions;
  const be = { ...defaultBackend, ...backend } as Required<EditorBackend>;

  // 验证 Obsidian 运行时已加载
  if (!(window as any).__cm6 || !(window as any).__cm6.EditorView) {
    throw new Error(
      'xlxz-markdown-editor: Obsidian runtime not loaded. ' +
      'Ensure vendor scripts are included before calling createEditor().'
    );
  }

  const { EditorView, EditorState, StateEffect } = (window as any).__cm6;

  // ── 创建 EditorView ──
  const view = new EditorView({ parent: container });

  // ── Mock 对象（供 vendor 扩展使用） ──
  const mockOwner = createMockOwner(opts.filePath);
  const mockApp = createMockApp(be, opts);
  const mockEditor = createMockEditor(mockApp, mockOwner, view, container);

  // ── 插件注册表 ──
  const pluginStates = new Map<string, any>();
  const activePlugins = new Map<string, EditorPlugin>();

  // 预设内部状态供 base-extensions 插件访问
  pluginStates.set('__mockEditor', mockEditor);
  pluginStates.set('__mockOwner', mockOwner);

  function makeContext(): PluginContext {
    return {
      view,
      options: opts,
      backend: be,
      getState<T>(pluginId: string): T | undefined {
        return pluginStates.get(pluginId) as T | undefined;
      },
      setState<T>(pluginId: string, state: T): void {
        pluginStates.set(pluginId, state);
      },
    };
  }

  function use(plugin: EditorPlugin): void {
    if (activePlugins.has(plugin.id)) {
      console.warn(`Plugin "${plugin.id}" is already registered.`);
      return;
    }
    if (plugin.deps) {
      for (const dep of plugin.deps) {
        if (!activePlugins.has(dep)) {
          console.warn(`Plugin "${plugin.id}" depends on "${dep}" which is not registered.`);
        }
      }
    }
    const ctx = makeContext();
    const ext = plugin.install(ctx);
    if (ext) {
      const exts = Array.isArray(ext) ? ext : [ext];
      if (exts.length > 0) {
        view.dispatch({ effects: StateEffect.appendConfig.of(exts) });
      }
    }
    activePlugins.set(plugin.id, plugin);
  }

  function unuse(pluginId: string): void {
    const plugin = activePlugins.get(pluginId);
    if (!plugin) return;
    if (plugin.uninstall) {
      plugin.uninstall(makeContext());
    }
    activePlugins.delete(pluginId);
    pluginStates.delete(pluginId);
  }

  // ── 安装默认插件集 ──
  const defaultPlugins = getDefaultPlugins(opts);
  const initialExtensions: any[] = [];

  for (const plugin of defaultPlugins) {
    if (activePlugins.has(plugin.id)) continue;
    const ctx = makeContext();
    const ext = plugin.install(ctx);
    if (ext) {
      const exts = Array.isArray(ext) ? ext : [ext];
      initialExtensions.push(...exts);
    }
    activePlugins.set(plugin.id, plugin);
  }

  // 用完整的初始扩展创建 state（避免逐个 dispatch 的性能损耗）
  const fullState = EditorState.create({
    doc: opts.doc || '',
    extensions: initialExtensions,
  });
  view.setState(fullState);

  // ── 后初始化：强制语法树重建 ──
  (function forceRebuild() {
    const { syntaxTree, Transaction } = (window as any).__cm6;
    view.dispatch({ annotations: Transaction.addToHistory.of(false) });
    const tree = syntaxTree(view.state);
    if (tree.length < view.state.doc.length) {
      setTimeout(forceRebuild, 50);
    }
  })();

  // ── registerSuggest 语法糖 ──
  function registerSuggest(config: SuggestConfig): () => void {
    const suggestState = pluginStates.get('suggest') as { addProvider: (p: CompletionProvider) => () => void } | undefined;
    if (!suggestState) {
      console.warn('registerSuggest: suggest plugin not installed. Call editor.use(suggestPlugin) first.');
      return () => {};
    }
    const provider: CompletionProvider = {
      id: `suggest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trigger: config.trigger,
      getSuggestions: config.getSuggestions,
      onAccept: config.onAccept,
      suffix: config.suffix,
    };
    return suggestState.addProvider(provider);
  }

  // ── 返回实例 ──
  const instance: EditorInstance = {
    view,
    getDoc() { return view.state.doc.toString(); },
    setDoc(content: string) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
      });
    },
    getSelection() {
      const { from, to } = view.state.selection.main;
      return view.state.doc.sliceString(from, to);
    },
    destroy() {
      // Uninstall all plugins in reverse order
      const ids = [...activePlugins.keys()].reverse();
      for (const id of ids) unuse(id);
      view.destroy();
      container.innerHTML = '';
      pluginStates.clear();
    },
    focus() { view.focus(); },
    use,
    unuse,
    registerSuggest,
    setTheme(theme: 'dark' | 'light') {
      if (theme === 'light') {
        container.classList.add('theme-light');
        container.classList.remove('theme-dark');
      } else {
        container.classList.add('theme-dark');
        container.classList.remove('theme-light');
      }
      document.body.classList.toggle('theme-dark', theme === 'dark');
      document.body.classList.toggle('theme-light', theme === 'light');
    },
  };

  return instance;
}
