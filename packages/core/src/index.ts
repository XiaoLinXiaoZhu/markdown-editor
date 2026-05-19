/**
 * xlxz-markdown-editor — 公开 API 入口
 *
 * @example
 *   import { createEditor } from 'xlxz-markdown-editor';
 *   const editor = createEditor(container, { doc: '# Hello' });
 */

export { createEditor, autoLoad } from './kernel.js';
export type {
  EditorBackend,
  EditorOptions,
  EditorInstance,
  EditorPlugin,
  PluginContext,
  LinkTarget,
  SuggestConfig,
  SuggestItem,
  I18nProvider,
  AssetLoader,
  AutoLoadOptions,
} from './types.js';
