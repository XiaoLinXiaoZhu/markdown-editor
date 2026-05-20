/**
 * 默认后端实现
 * 所有方法均为空操作（no-op），未提供的后端能力会优雅降级。
 */
import type { EditorBackend, EditorOptions } from './types.js';

export const defaultBackend: Required<EditorBackend> = {
  resolveLinkPath() { return null; },
  getResourceUrl(path: string) { return path; },
  async listLinkTargets() { return []; },
  async readFile() { return ''; },
  openFile() {},
  async saveAttachment() { return ''; },
};

export const defaultOptions: Required<Pick<EditorOptions,
  'tabSize' | 'useTab' | 'readableLineWidth' | 'showLineNumber' |
  'showIndentGuide' | 'foldHeading' | 'foldIndent' | 'autoPairBrackets' |
  'autoPairMarkdown' | 'spellcheck' | 'theme' | 'cssVariables'
>> = {
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
  theme: 'dark',
  cssVariables: {} as Record<string, string>,
};
