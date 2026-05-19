/**
 * 内核 — createEditor()
 *
 * 微内核只做三件事：
 * 1. 创建 CM6 EditorView
 * 2. 管理插件注册表
 * 3. 暴露文档读写接口
 */
import type { EditorBackend, EditorOptions, EditorInstance, EditorPlugin, PluginContext, SuggestConfig } from './types.js';

// 默认后端实现
const defaultBackend: Required<EditorBackend> = {
  resolveLinkPath() { return null; },
  getResourceUrl(path: string) { return path; },
  async listLinkTargets() { return []; },
  async readFile() { return ''; },
  openFile() {},
  async saveAttachment() { return ''; },
};

const defaultOptions = {
  tabSize: 4,
  useTab: true,
  readableLineWidth: true,
  showLineNumber: true,
  showIndentGuide: true,
  foldHeading: true,
  foldIndent: true,
  autoPairBrackets: true,
  autoPairMarkdown: true,
  spellcheck: false,
  theme: 'dark' as const,
  cssVariables: {} as Record<string, string>,
};

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
  const { editor: jB, owner: WB, livePreview: KB } = (window as any).__stateFields;
  const { inputHandler: pT, stateField: lT, keymap: fT, markdownSurround: iB } = (window as any).__closeBrackets;

  // 容器 class
  const editorEl = container;
  if (!editorEl.classList.contains('markdown-source-view')) {
    editorEl.classList.add('markdown-source-view', 'mod-cm6', 'is-live-preview');
  }
  if (opts.readableLineWidth) {
    editorEl.classList.add('is-readable-line-width');
  }

  // 应用用户自定义 CSS 变量
  if (opts.cssVariables) {
    for (const [key, value] of Object.entries(opts.cssVariables)) {
      const prop = key.startsWith('--') ? key : `--${key}`;
      editorEl.style.setProperty(prop, value as string);
    }
  }

  // 主题 class
  if (opts.theme === 'light') {
    editorEl.classList.add('theme-light');
    editorEl.classList.remove('theme-dark');
  } else {
    editorEl.classList.add('theme-dark');
    editorEl.classList.remove('theme-light');
  }

  // 创建 EditorView
  const view = new EditorView({ parent: editorEl });

  // State 管理
  const pluginStates = new Map<string, any>();
  const activePlugins = new Map<string, EditorPlugin>();

  // ── 插件注册表（内核核心功能） ──

  function use(plugin: EditorPlugin): void {
    if (activePlugins.has(plugin.id)) {
      console.warn(`Plugin "${plugin.id}" is already registered.`);
      return;
    }
    // 检查依赖
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
      // 使用 StateEffect.appendConfig 动态追加扩展
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

  // ── Mock 对象（最小版本，为后续插件准备） ──

  const mockOwner = {
    file: {
      path: opts.filePath || 'untitled.md',
      name: (opts.filePath || 'untitled.md').split('/').pop()!,
      basename: (opts.filePath || 'untitled.md').split('/').pop()!.replace(/\.md$/, ''),
      extension: 'md',
    },
  };

  const mockApp = {
    vault: {
      getConfig(key: string) {
        const configs: Record<string, any> = {
          tabSize: opts.tabSize,
          useTab: opts.useTab,
          readableLineLength: opts.readableLineWidth,
          showFrontmatter: false,
          livePreview: true,
          autoPairBrackets: opts.autoPairBrackets,
          autoPairMarkdown: opts.autoPairMarkdown,
          rightToLeft: false,
          spellcheck: opts.spellcheck,
          showLineNumber: opts.showLineNumber,
          showIndentGuide: opts.showIndentGuide,
          foldHeading: opts.foldHeading,
          foldIndent: opts.foldIndent,
        };
        return configs[key];
      },
      adapter: {
        getResourcePath(p: string) { return be.getResourceUrl(p); },
      },
      on() { return { id: 0 }; },
      off() {},
      offref() {},
    },
    workspace: {
      openLinkText(link: string) { be.openFile(link); },
      getLeaf() { return { openLinkText(link: string) { be.openFile(link); } }; },
      on() { return { id: 0 }; },
      off() {},
      offref() {},
    },
    metadataCache: {
      getFirstLinkpathDest(link: string, sourcePath: string) {
        const resolved = be.resolveLinkPath(link, sourcePath);
        return resolved ? { path: resolved } : null;
      },
      on() { return { id: 0 }; },
      off() {},
      offref() {},
    },
  };

  const mockEditor = {
    app: mockApp,
    get path() { return mockOwner.file?.path || ''; },
    get file() { return mockOwner.file; },
    cm: view,
    editorEl,
    owner: mockOwner,
    addChild(c: any) { return c; },
    removeChild(_c: any) {},
  };

  // ── 构建基础 State ──

  const { keymap } = (window as any).__cm6;
  const __lineNumbers = (window as any).__lineNumbers;
  const __activeLineGutter = (window as any).__activeLineGutter;
  const __highlightActiveLineGutter = (window as any).__highlightActiveLineGutter;
  const __indentUnit = (window as any).__indentUnit;
  const __indentGuide = (window as any).__indentGuide;
  const { base: ZB } = (window as any).__compartments;

  const stateExtensions: any[] = [];

  // 基础 CM6 扩展
  stateExtensions.push(jB.init(() => view));
  stateExtensions.push(WB.init(() => mockOwner));

  // Tab 配置
  const indent = opts.useTab ? '\t' : ' '.repeat(Math.min(Math.max(opts.tabSize!, 2), 4));
  stateExtensions.push(EditorState.tabSize.of(opts.tabSize));
  if (__indentUnit) stateExtensions.push(__indentUnit.of(indent));

  // 行号
  if (opts.showLineNumber && __lineNumbers) {
    stateExtensions.push(__lineNumbers({ fixed: false }));
    if (__activeLineGutter) stateExtensions.push(__activeLineGutter);
    if (__highlightActiveLineGutter) stateExtensions.push(__highlightActiveLineGutter());
  }

  // 缩进指引
  if (opts.showIndentGuide && __indentGuide) {
    stateExtensions.push(__indentGuide);
  }

  // 挂载语言
  if ((window as any).__language) {
    stateExtensions.push((window as any).__language);
  }
  // 挂载 hanging-indent
  if ((window as any).__hangingIndent) {
    stateExtensions.push((window as any).__hangingIndent);
  }

  // 基础 keymap
  stateExtensions.push(keymap.of([
    {
      key: 'Mod-s',
      run(v: any) {
        if (opts.onSave) opts.onSave(v.state.doc.toString());
        return true;
      },
      preventDefault: true,
    },
  ]));

  // 内容属性
  stateExtensions.push(EditorView.contentAttributes.of({
    spellcheck: String(opts.spellcheck),
    autocorrect: 'on',
    autocapitalize: 'on',
    contenteditable: 'true',
  }));

  // onChange 回调
  stateExtensions.push(EditorView.updateListener.of((update: any) => {
    if (update.docChanged && opts.onChange) {
      opts.onChange(update.state.doc.toString());
    }
  }));

  // 折叠支持
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

  // 自动配对
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

  // Live preview
  const KB_ext = (window as any).__stateFields?.livePreview;
  if (KB_ext) {
    stateExtensions.push(KB_ext.init(() => true));
  }
  const livePreviewExts = (window as any).__kH?.(mockEditor, view);
  if (livePreviewExts) {
    stateExtensions.push(livePreviewExts);
  }

  // Base extensions（Obsidian 基础扩展集）
  if ((window as any).__baseExtensions) {
    const nN = ZB.of((window as any).__baseExtensions);
    stateExtensions.push(nN);
  }

  // 创建 EditorState
  const fullState = EditorState.create({
    doc: opts.doc || '',
    extensions: stateExtensions,
  });
  view.setState(fullState);

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
      // TODO: 阶段 2 实现
      console.warn('registerSuggest not yet implemented');
      return () => {};
    },
  };

  return instance;
}
