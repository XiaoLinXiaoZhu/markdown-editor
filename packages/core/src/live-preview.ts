/**
 * Live Preview 渲染引擎 — 开源替代实现
 *
 * 核心逻辑：遍历语法树，对光标所在行之外的 markdown 格式标记应用 Decoration.replace()
 * 使其在视觉上隐藏，实现"所见即所得"效果。
 *
 * 使用 window.__cm6_packages 获取 vendor 的 CM6 实例，确保 Facet 兼容。
 */

/** 从 vendor CM6 获取运行时依赖 */
function getCM6() {
  const pkgs = (window as any).__cm6_packages;
  if (!pkgs) throw new Error('live-preview: __cm6_packages not available');
  return {
    state: pkgs['@codemirror/state'] as typeof import('@codemirror/state'),
    view: pkgs['@codemirror/view'] as typeof import('@codemirror/view'),
    language: pkgs['@codemirror/language'] as typeof import('@codemirror/language'),
  };
}

/**
 * 判断一个语法节点是否为 "formatting" 标记（需要在 Live Preview 中隐藏）
 */
function isFormattingNode(typeName: string): boolean {
  return typeName.includes('formatting');
}

/**
 * 判断一个语法节点是否为需要整体隐藏 URL 部分的链接结构
 * 例如 [text](url) 中的 "](url)" 部分
 */
function isLinkUrl(typeName: string): boolean {
  return typeName === 'string_url' || typeName.includes('formatting-link-string');
}

/**
 * 创建 Live Preview 扩展。
 * 返回一个 Extension 数组，可直接传入 EditorState.create 的 extensions。
 */
export function createLivePreview(_editor: any, editorView: any) {
  const { state: stateModule, view: viewModule, language: langModule } = getCM6();
  const { StateField, RangeSetBuilder } = stateModule;
  const { EditorView, Decoration } = viewModule;
  const { syntaxTree } = langModule;

  const hideDecoration = Decoration.replace({});

  /**
   * 计算当前状态下的 Live Preview decorations。
   * 核心算法：
   * 1. 找出所有包含光标的行范围
   * 2. 遍历语法树中的 formatting 节点
   * 3. 如果 formatting 节点不在光标行 → 用 replace decoration 隐藏
   */
  function computeDecorations(viewState: any, view: any): any {
    const doc = viewState.doc;
    const tree = syntaxTree(viewState);
    const builder = new RangeSetBuilder();

    // 收集所有有光标的行（行号集合）
    const cursorLines = new Set<number>();
    if (view.hasFocus) {
      for (const range of viewState.selection.ranges) {
        const startLine = doc.lineAt(range.from).number;
        const endLine = doc.lineAt(range.to).number;
        for (let ln = startLine; ln <= endLine; ln++) {
          cursorLines.add(ln);
        }
      }
    }

    // 遍历语法树
    const decorations: { from: number; to: number }[] = [];

    tree.iterate({
      enter: (node: any) => {
        const typeName: string = node.type.name;

        // 只处理 formatting 节点和 link URL 部分
        if (!isFormattingNode(typeName) && !isLinkUrl(typeName)) return;

        // 检查是否在光标行
        const nodeLine = doc.lineAt(node.from).number;
        if (cursorLines.has(nodeLine)) return; // 光标所在行不隐藏

        // 对于多行节点（如代码块），检查所有相关行
        if (node.to > node.from) {
          const endLine = doc.lineAt(node.to).number;
          for (let ln = nodeLine; ln <= endLine; ln++) {
            if (cursorLines.has(ln)) return;
          }
        }

        decorations.push({ from: node.from, to: node.to });
      },
    });

    // RangeSetBuilder 需要按 from 排序
    decorations.sort((a, b) => a.from - b.from || a.to - b.to);

    // 去重和合并重叠
    let prevTo = -1;
    for (const d of decorations) {
      if (d.from >= prevTo && d.from < d.to) {
        builder.add(d.from, d.to, hideDecoration);
        prevTo = d.to;
      }
    }

    return builder.finish();
  }

  // StateField 持有当前的 decoration set
  const livePreviewField = StateField.define({
    create(state: any) {
      return Decoration.none;
    },

    update(_decorations: any, tr: any) {
      // 每次 transaction 都重新计算 decorations
      // 因为选区变化需要实时反映（光标所在行显示原始 markdown）
      return computeDecorations(tr.state, editorView);
    },

    provide(field: any) {
      return EditorView.decorations.from(field);
    },
  });

  return [livePreviewField];
}
