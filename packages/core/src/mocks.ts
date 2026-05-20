/**
 * Mock 对象构造
 *
 * 为 Obsidian 运行时提供最小 mock 对象，模拟 Obsidian 的 App/Editor/File 环境。
 * 这些 mock 对象通过 CM6 StateField 注入，供所有 vendor 扩展使用。
 */
import type { EditorBackend, EditorOptions } from './types.js';

export function createMockOwner(filePath?: string) {
  return {
    file: {
      path: filePath || 'untitled.md',
      name: (filePath || 'untitled.md').split('/').pop()!,
      basename: (filePath || 'untitled.md').split('/').pop()!.replace(/\.md$/, ''),
      extension: 'md',
    },
    saveImmediately(fn?: () => void) {
      if (fn) fn();
    },
  };
}

export function createMockApp(backend: Required<EditorBackend>, opts: EditorOptions) {
  return {
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
        getResourcePath(p: string) { return backend.getResourceUrl(p); },
      },
      on() { return { id: 0 }; },
      off() {},
      offref() {},
    },
    workspace: {
      openLinkText(link: string) { backend.openFile(link); },
      getLeaf() { return { openLinkText(link: string) { backend.openFile(link); } }; },
      on() { return { id: 0 }; },
      off() {},
      offref() {},
    },
    metadataCache: {
      getFirstLinkpathDest(link: string, sourcePath: string) {
        const resolved = backend.resolveLinkPath(link, sourcePath);
        return resolved ? { path: resolved } : null;
      },
      on() { return { id: 0 }; },
      off() {},
      offref() {},
    },
  };
}

export function createMockEditor(
  mockApp: ReturnType<typeof createMockApp>,
  mockOwner: ReturnType<typeof createMockOwner>,
  view: any,
  editorEl: HTMLElement,
) {
  return {
    app: mockApp,
    get path() { return mockOwner.file?.path || ''; },
    get file() { return mockOwner.file; },
    cm: view,
    editorEl,
    owner: mockOwner,
    addChild(c: any) { return c; },
    removeChild(_c: any) {},
    editTableCell(table: any, cell: any) {
      return this.tableCell ||= {
        table,
        cell,
        editor: { cm: view },
        cm: view,
        setReadonly() {},
        onContextMenu() {},
      };
    },
    destroyTableCell() { this.tableCell = null; },
    tableCell: null as any,
  };
}
