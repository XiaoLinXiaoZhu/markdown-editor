/**
 * 插件系统内部类型
 *
 * 与 src/types.ts 中的公开类型互补，定义插件注册表内部使用的接口。
 */

export interface PluginRegistry {
  register(plugin: import('../types.js').EditorPlugin): void;
  unregister(pluginId: string): void;
  get(pluginId: string): import('../types.js').EditorPlugin | undefined;
  has(pluginId: string): boolean;
  getAll(): import('../types.js').EditorPlugin[];
}

/**
 * CompletionProvider — Input Prompter 的 provider 接口
 *
 * 每个 provider 声明触发条件和补全逻辑，suggest 插件统一管理 UI。
 */
export interface CompletionProvider {
  /** Provider 唯一标识 */
  id: string;
  /** 触发正则（匹配光标前文本末尾） */
  trigger: RegExp;
  /** 根据匹配到的 query 返回建议列表 */
  getSuggestions(query: string): import('../types.js').SuggestItem[] | Promise<import('../types.js').SuggestItem[]>;
  /** 选中建议后的额外操作（可选） */
  onAccept?(item: import('../types.js').SuggestItem): void;
  /** 插入建议后追加的后缀，如 "]]" */
  suffix?: string;
}
