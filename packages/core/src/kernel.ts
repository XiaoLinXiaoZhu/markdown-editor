/**
 * 内核 — createEditor()
 *
 * 微内核只做三件事：
 * 1. 创建 CM6 EditorView
 * 2. 管理插件注册表
 * 3. 暴露文档读写接口
 */
import type { EditorBackend, EditorOptions, EditorInstance, EditorPlugin, PluginContext, SuggestConfig, SuggestItem } from './types.js';

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

// ── Vendor 自动加载 ──

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
  const __listRegex = (window as any).__listRegex;
  const __indentMore = (window as any).__commands?.indentMore;
  const __indentLess = (window as any).__commands?.indentLess;
  const __newlineAndIndent = (window as any).__commands?.newlineAndIndent;
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

  // 完整 keymap：列表续行 + Tab缩进 + 保存
  stateExtensions.push(keymap.of([
    {
      key: 'Enter',
      run(v: any) {
        if (!__listRegex) return false;
        const state = v.state;
        const { head } = state.selection.main;
        const line = state.doc.lineAt(head);
        const match = __listRegex.exec(line.text);
        if (!match) return false;
        const prefix = match[0];
        const blockquote = match[1] || '';
        const listMarker = match[2] || '';

        if (!blockquote && !listMarker) return false;

        // Empty list item: remove the marker
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

  // ── 强制语法树重建（解决标签等增量解析不及时的问题） ──
  (function forceRebuild() {
    const { syntaxTree, Transaction } = (window as any).__cm6;
    view.dispatch({ annotations: Transaction.addToHistory.of(false) });
    const tree = syntaxTree(view.state);
    if (tree.length < view.state.doc.length) {
      setTimeout(forceRebuild, 50);
    }
  })();

  // ── 中文括号自动转换：【【→[[, 】】→]] ──
  (function setupExpandText() {
    const { EditorView: EV, StateEffect } = (window as any).__cm6;
    const rules = [
      { regex: /(！)?【【$/, replace: (m: RegExpMatchArray) => m[1] ? '![[' : '[[' },
      { regex: /】】$/, replace: () => ']]' },
      { regex: /···$/, replace: () => '```' },
    ];
    const listener = EV.updateListener.of((update: any) => {
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
    });
    view.dispatch({ effects: StateEffect.appendConfig.of(listener) });
  })();

  // ── 链接点击处理 ──
  editorEl.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target?.closest) return;

    const internalLink = target.closest('.internal-link, .cm-hmd-internal-link');
    if (internalLink) {
      e.preventDefault();
      e.stopPropagation();
      const linkText = (internalLink as HTMLElement).getAttribute('data-href')
        || (internalLink as HTMLElement).getAttribute('href')
        || (internalLink as HTMLElement).textContent?.trim() || '';
      if (linkText) {
        if (opts.onLinkClick) {
          opts.onLinkClick(linkText, opts.filePath || '');
        } else {
          be.openFile(linkText);
        }
      }
      return;
    }

    const externalLink = target.closest('.external-link') as HTMLElement;
    if (externalLink) {
      const href = externalLink.getAttribute('href') || externalLink.getAttribute('data-href') || '';
      if (href && /^https?:|^mailto:/.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        if (opts.onExternalLinkClick) {
          opts.onExternalLinkClick(href);
        } else {
          window.open(href, '_blank');
        }
      }
      return;
    }

    const underline = target.closest('.cm-underline') as HTMLElement;
    if (underline) {
      const linkParent = underline.closest('.cm-hmd-internal-link');
      if (linkParent) {
        e.preventDefault();
        e.stopPropagation();
        const pos = view.posAtDOM(underline);
        const doc = view.state.doc.toString();
        const before = doc.lastIndexOf('[[', pos);
        if (before !== -1 && before >= pos - 200) {
          const after = doc.indexOf(']]', before + 2);
          if (after !== -1 && after < pos + 200) {
            const content = doc.slice(before + 2, after);
            const pipeIdx = content.indexOf('|');
            const linkContent = pipeIdx !== -1 ? content.slice(0, pipeIdx) : content;
            if (opts.onLinkClick) {
              opts.onLinkClick(linkContent, opts.filePath || '');
            } else {
              be.openFile(linkContent);
            }
          }
        }
        return;
      }
      const extParent = underline.closest('.cm-link');
      if (extParent) {
        e.preventDefault();
        e.stopPropagation();
        // Try DOM first
        const urlEl = extParent.parentElement?.querySelector('.cm-url, .cm-string') as HTMLElement;
        let url = '';
        if (urlEl) {
          url = urlEl.textContent?.replace(/^\(|\)$/g, '') || '';
        }
        // Fallback: extract from markdown source
        if (!url || !/^https?:/.test(url)) {
          const pos = view.posAtDOM(underline);
          const line = view.state.doc.lineAt(pos);
          const linkMatch = line.text.match(/\[([^\]]*)\]\(([^)]+)\)/g);
          if (linkMatch) {
            for (const m of linkMatch) {
              const urlMatch = m.match(/\(([^)]+)\)/);
              if (urlMatch && /^https?:/.test(urlMatch[1])) {
                url = urlMatch[1];
                break;
              }
            }
          }
        }
        if (/^https?:/.test(url)) {
          if (opts.onExternalLinkClick) {
            opts.onExternalLinkClick(url);
          } else {
            window.open(url, '_blank');
          }
        }
      }
    }
  });

  // ── 附件处理：粘贴图片 / 拖拽文件 ──
  const { EditorView: EV2 } = (window as any).__cm6;
  view.dispatch({
    effects: (window as any).__cm6.StateEffect.appendConfig.of(
      EV2.domEventHandlers({
        dragover(e: DragEvent) {
          e.preventDefault();
          editorEl.classList.add('is-drop-target');
        },
        dragleave(_e: DragEvent) {
          editorEl.classList.remove('is-drop-target');
        },
        async drop(e: DragEvent) {
          editorEl.classList.remove('is-drop-target');
          const files = e.dataTransfer?.files;
          if (!files || files.length === 0) return;
          e.preventDefault();
          for (const file of Array.from(files)) {
            const buf = await file.arrayBuffer();
            const savedPath = await be.saveAttachment(file.name, buf);
            if (savedPath) {
              const insert = file.type.startsWith('image/') ? '![' + savedPath + '](' + savedPath + ')' : '[[' + savedPath + ']]';
              const { from, to } = view.state.selection.main;
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + insert.length },
                userEvent: 'input.drop',
              });
            }
          }
        },
        paste(e: ClipboardEvent) {
          const items = e.clipboardData?.items;
          if (items) {
            for (const item of Array.from(items)) {
              if (item.type.startsWith('image/')) {
                e.preventDefault();
                const blob = item.getAsFile();
                if (!blob) return;
                blob.arrayBuffer().then(async (buf) => {
                  const name = 'paste-' + Date.now() + '.' + (blob.type.split('/')[1] || 'png');
                  const savedPath = await be.saveAttachment(name, buf);
                  if (savedPath) {
                    const insert = '![' + savedPath + '](' + savedPath + ')';
                    const { from, to } = view.state.selection.main;
                    view.dispatch({
                      changes: { from, to, insert },
                      selection: { anchor: from + insert.length },
                      userEvent: 'input.paste',
                    });
                  }
                });
                return;
              }
            }
          }
          // HTML paste → Markdown
          const html = e.clipboardData?.getData('text/html');
          if (!html) return;
          if (!(window as any).TurndownService) return;
          try {
            const td = new (window as any).TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            const md = td.turndown(html);
            if (!md || !md.trim()) return;
            e.preventDefault();
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: md },
              selection: { anchor: from + md.length },
              userEvent: 'input.paste',
            });
          } catch (err) {
            console.warn('Paste conversion failed:', err);
          }
        },
      })
    ),
  });

  // ── 工具函数 ──

  function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
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
      const { EditorView: EV, StateEffect } = (window as any).__cm6;
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

      const { Prec, keymap: km } = (window as any).__cm6;
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
    },
  };

  return instance;
}
