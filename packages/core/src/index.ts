/**
 * xlxz-markdown-editor — 公开 API 入口
 *
 * @example
 *   import { createEditor } from 'xlxz-markdown-editor';
 *   const editor = createEditor(container, { doc: '# Hello' });
 *
 * @example 自定义插件组合
 *   import { createEditor, suggestPlugin, tablePlugin } from 'xlxz-markdown-editor';
 *   const editor = createEditor(container, { doc: '' });
 *   editor.use(tablePlugin);
 *
 * @example 注册补全 provider
 *   editor.registerSuggest({
 *     trigger: /\[\[(.*)$/,
 *     getSuggestions: (query) => backend.listLinkTargets().then(items => items.filter(...)),
 *     suffix: ']]',
 *   });
 */

export { createEditor, autoLoad } from './kernel.js';
export type {
  EditorBackend,
  EditorOptions,
  EditorInstance,
  EditorMode,
  EditorPlugin,
  PluginContext,
  LinkTarget,
  SuggestConfig,
  SuggestItem,
  I18nProvider,
  AssetLoader,
  AutoLoadOptions,
} from './types.js';

// ── 内置插件（供高级用户单独组合） ──
export {
  livePreviewPlugin,
  markdownLanguagePlugin,
  hangingIndentPlugin,
  listContinuationPlugin,
  closeBracketsPlugin,
  expandTextPlugin,
  foldPlugin,
  lineNumbersPlugin,
  indentGuidePlugin,
  suggestPlugin,
  linkHandlerPlugin,
  attachmentPlugin,
  tablePlugin,
  tableContinuationPlugin,
  themePlugin,
  baseExtensionsPlugin,
  keymapPlugin,
  onChangePlugin,
} from './plugins/index.js';

// ── 插件系统类型 ──
export type { CompletionProvider } from './plugins/types.js';
