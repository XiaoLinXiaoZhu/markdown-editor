/**
 * 内核 — createEditor()
 *
 * 微内核只做三件事：
 * 1. 创建 CM6 EditorView
 * 2. 管理插件注册表
 * 3. 暴露文档读写接口
 *
 * 所有扩展组装、mock 构造、事件处理均委托给独立模块。
 */
import type { EditorBackend, EditorOptions, EditorInstance, EditorPlugin, PluginContext, SuggestConfig } from './types.js';
import { defaultBackend, defaultOptions } from './defaults.js';
import { createMockOwner, createMockApp, createMockEditor } from './mocks.js';
import { buildExtensions } from './extensions.js';
import { setupLinkClickHandler } from './link-handler.js';
import { setupAttachmentHandler } from './attachment.js';
import { createSuggest } from './suggest.js';

export { autoLoad } from './auto-load.js';
export type { AutoLoadOptions } from './auto-load.js';

export function createEditor(
  container: HTMLElement,
  options: EditorOptions = {},
  backend: EditorBackend = {}
): EditorInstance {
  const opts = { ...defaultOptions, ...options };
  const be = { ...defaultBackend, ...backend } as Required<EditorBackend>;

  // 验证 Obsidian 运行时已加载
  if (!(window as any).__cm6 || !(window as any).__cm6.EditorView) {
    throw new Error(
      'xlxz-markdown-editor: Obsidian runtime not loaded. ' +
      'Ensure vendor scripts are included before calling createEditor().'
    );
  }

  const { EditorView, EditorState } = (window as any).__cm6;

  // ── 容器准备 ──
  const editorEl = container;
  if (!editorEl.classList.contains('markdown-source-view')) {
    editorEl.classList.add('markdown-source-view', 'mod-cm6', 'is-live-preview');
  }
  if (opts.readableLineWidth) {
    editorEl.classList.add('is-readable-line-width');
  }

  // CSS 变量
  if (opts.cssVariables) {
    for (const [key, value] of Object.entries(opts.cssVariables)) {
      const prop = key.startsWith('--') ? key : `--${key}`;
      editorEl.style.setProperty(prop, value as string);
    }
  }

  // 主题
  if (opts.theme === 'light') {
    editorEl.classList.add('theme-light');
    editorEl.classList.remove('theme-dark');
  } else {
    editorEl.classList.add('theme-dark');
    editorEl.classList.remove('theme-light');
  }

  // ── 创建 EditorView ──
  const view = new EditorView({ parent: editorEl });

  // ── Mock 对象 ──
  const mockOwner = createMockOwner(opts.filePath);
  const mockApp = createMockApp(be, opts);
  const mockEditor = createMockEditor(mockApp, mockOwner, view, editorEl);

  // ── 组装扩展 ──
  const extensions = buildExtensions(view, editorEl, mockEditor, mockOwner, opts);
  const fullState = EditorState.create({
    doc: opts.doc || '',
    extensions,
  });
  view.setState(fullState);

  // ── 后初始化挂钩 ──
  // ── 强制语法树重建（解决增量解析不及时的问题） ──
  (function forceRebuild() {
    const { syntaxTree, Transaction } = (window as any).__cm6;
    view.dispatch({ annotations: Transaction.addToHistory.of(false) });
    const tree = syntaxTree(view.state);
    if (tree.length < view.state.doc.length) {
      setTimeout(forceRebuild, 50);
    }
  })();
  setupLinkClickHandler(editorEl, view, opts, be);
  setupAttachmentHandler(view, editorEl, be);

  // ── 插件注册表 ──
  const pluginStates = new Map<string, any>();
  const activePlugins = new Map<string, EditorPlugin>();

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
    const ctx: PluginContext = {
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

    const ext = plugin.install(ctx);
    if (ext) {
      const exts = Array.isArray(ext) ? ext : [ext];
      const { StateEffect } = (window as any).__cm6;
      view.dispatch({ effects: StateEffect.appendConfig.of(exts) });
    }
    activePlugins.set(plugin.id, plugin);
  }

  function unuse(pluginId: string): void {
    const plugin = activePlugins.get(pluginId);
    if (!plugin) return;
    if (plugin.uninstall) {
      const ctx: PluginContext = {
        view,
        options: opts,
        backend: be,
        getState<T>(id: string): T | undefined {
          return pluginStates.get(id) as T | undefined;
        },
        setState<T>(id: string, state: T): void {
          pluginStates.set(id, state);
        },
      };
      plugin.uninstall(ctx);
    }
    activePlugins.delete(pluginId);
    pluginStates.delete(pluginId);
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
      view.destroy();
      editorEl.innerHTML = '';
      activePlugins.clear();
      pluginStates.clear();
    },
    focus() { view.focus(); },
    use,
    unuse,
    registerSuggest(config: SuggestConfig) {
      return createSuggest(view, config);
    },
  };

  return instance;
}
