/**
 * 插件集合 — 按功能分类导出所有内置插件
 */

// Core rendering
export { livePreviewPlugin } from './live-preview.js';
export { markdownLanguagePlugin } from './markdown-language.js';
export { hangingIndentPlugin } from './hanging-indent.js';

// Input handling
export { listContinuationPlugin } from './list-continuation.js';
export { closeBracketsPlugin } from './close-brackets.js';
export { expandTextPlugin } from './expand-text.js';

// UI features
export { foldPlugin } from './fold.js';
export { lineNumbersPlugin } from './line-numbers.js';
export { indentGuidePlugin } from './indent-guide.js';

// Functional
export { suggestPlugin } from './suggest.js';
export { linkHandlerPlugin } from './link-handler.js';
export { attachmentPlugin } from './attachment.js';
export { tablePlugin } from './table.js';

// Infrastructure
export { themePlugin } from './theme.js';
export { baseExtensionsPlugin } from './base-extensions.js';
export { keymapPlugin } from './keymap.js';
export { onChangePlugin } from './on-change.js';

// Types
export type { CompletionProvider } from './types.js';
