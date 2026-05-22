/**
 * Table 插件
 *
 * 纯文本表格 Live Preview：自动格式化、行装饰、复制按钮。
 */
import type { EditorPlugin, PluginContext } from '../types.js';
import { createTableExtension } from '../table/index.js';

export const tablePlugin: EditorPlugin = {
  id: 'table',

  install(_ctx: PluginContext) {
    return createTableExtension();
  },
};
