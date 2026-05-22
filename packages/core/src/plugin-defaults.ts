/**
 * 默认插件集
 *
 * 根据 EditorOptions 决定加载哪些内置插件。
 * 插件按依赖顺序排列——base-extensions 必须在最前，live-preview 依赖 language。
 */
import type { EditorOptions, EditorPlugin } from './types.js';
import {
  baseExtensionsPlugin,
  themePlugin,
  markdownLanguagePlugin,
  hangingIndentPlugin,
  livePreviewPlugin,
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
  keymapPlugin,
  onChangePlugin,
} from './plugins/index.js';

export function getDefaultPlugins(opts: Partial<EditorOptions>): EditorPlugin[] {
  const plugins: EditorPlugin[] = [];

  // 基础设施（必须最先加载）
  plugins.push(baseExtensionsPlugin);
  plugins.push(themePlugin);

  // 核心渲染
  plugins.push(markdownLanguagePlugin);
  plugins.push(hangingIndentPlugin);
  plugins.push(livePreviewPlugin);

  // 输入处理
  plugins.push(listContinuationPlugin);
  plugins.push(keymapPlugin);
  plugins.push(expandTextPlugin);

  // 自动配对（条件加载）
  if (opts.autoPairBrackets !== false || opts.autoPairMarkdown !== false) {
    plugins.push(closeBracketsPlugin);
  }

  // UI 功能（条件加载）
  if (opts.showLineNumber !== false) {
    plugins.push(lineNumbersPlugin);
  }
  if (opts.showIndentGuide !== false) {
    plugins.push(indentGuidePlugin);
  }
  if (opts.foldHeading !== false || opts.foldIndent !== false) {
    plugins.push(foldPlugin);
  }

  // 功能插件
  plugins.push(suggestPlugin);
  plugins.push(linkHandlerPlugin);
  plugins.push(attachmentPlugin);
  plugins.push(tablePlugin);
  plugins.push(tableContinuationPlugin);

  // 回调
  plugins.push(onChangePlugin);

  return plugins;
}
