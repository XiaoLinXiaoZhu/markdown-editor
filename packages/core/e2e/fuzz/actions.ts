/**
 * Fuzz 操作池
 *
 * 定义所有可能的编辑器操作及其权重。
 * PRNG 按权重抽取操作，构成随机测试序列。
 * 
 * 包含激进的 markdown 内容：代码块、公式、表格、图片、callout 等，
 * 确保能暴露 Live Preview 渲染差异。
 */
import type { PRNG } from './prng';

export type ActionType =
  | 'type_char'
  | 'type_markdown'
  | 'type_block'
  | 'enter'
  | 'tab'
  | 'shift_tab'
  | 'backspace'
  | 'delete'
  | 'cursor_move'
  | 'click_line'
  | 'select_and_surround';

export interface Action {
  type: ActionType;
  payload: string;
  description: string;
}

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789 ';
const CHINESE_CHARS = '你好世界测试文本内容编辑器';

// 单行 markdown 标记
const MARKDOWN_TOKENS = [
  '#', '## ', '### ', '#### ',
  '*', '**', '`', '~~', '==',
  '> ', '- ', '1. ', '- [ ] ', '- [x] ',
  '[[', ']]', '![[',
  '[link](url)', '![img](path.png)',
  '---',
  '$', '$$',
  '|', ' | ',
];

// 多行 markdown 块（插入完整块结构）
const BLOCK_INSERTS = [
  // 代码块
  '```js\nconst x = 1;\nconsole.log(x);\n```\n',
  '```python\ndef hello():\n    print("world")\n```\n',
  '```\nplain code block\n```\n',
  // 数学公式块
  '$$\nE = mc^2\n$$\n',
  '$$\n\\int_0^\\infty e^{-x} dx = 1\n$$\n',
  // 行内公式
  'The formula $E=mc^2$ is famous.\n',
  'Solve $\\frac{1}{x} + \\frac{1}{y} = 1$ for x.\n',
  // 表格
  '| Name | Value |\n| --- | --- |\n| foo | 42 |\n| bar | 99 |\n',
  '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n',
  // Callout
  '> [!note] Title\n> This is a callout.\n> Second line.\n',
  '> [!warning] Caution\n> Be careful here.\n',
  '> [!tip]\n> A helpful tip.\n',
  // 嵌入和图片
  '![[embedded-note]]\n',
  '![alt text](https://example.com/image.png)\n',
  '![[image.png|300]]\n',
  // 复杂列表
  '- item 1\n  - nested a\n  - nested b\n- item 2\n',
  '1. first\n2. second\n   1. sub-item\n3. third\n',
  // 脚注
  'Text with footnote[^1].\n\n[^1]: Footnote content.\n',
  // 标签
  '#tag1 #tag2 text with #embedded-tag\n',
  // 水平线
  '---\n',
  '***\n',
  // 前置元数据 (frontmatter)
  '---\ntitle: Test\ntags: [a, b]\n---\n',
];

const ACTION_TYPES: ActionType[] = [
  'type_char',
  'type_markdown',
  'type_block',
  'enter',
  'tab',
  'shift_tab',
  'backspace',
  'delete',
  'cursor_move',
  'click_line',
  'select_and_surround',
];

const ACTION_WEIGHTS = [
  30, // type_char — 基础输入
  15, // type_markdown — 单行 markdown 标记
  12, // type_block — 多行块结构（代码块、公式、表格等）
  10, // enter
  3,  // tab
  2,  // shift_tab
  7,  // backspace
  3,  // delete
  8,  // cursor_move
  5,  // click_line
  5,  // select_and_surround
];

/** 生成一个随机操作 */
export function generateAction(rng: PRNG, docLineCount: number): Action {
  const type = rng.weighted(ACTION_TYPES, ACTION_WEIGHTS);

  switch (type) {
    case 'type_char': {
      const usesChinese = rng.random() < 0.15;
      const char = usesChinese
        ? rng.pick([...CHINESE_CHARS])
        : rng.pick([...CHARS]);
      return { type, payload: char, description: `type '${char}'` };
    }

    case 'type_markdown': {
      const token = rng.pick(MARKDOWN_TOKENS);
      return { type, payload: token, description: `type markdown '${token}'` };
    }

    case 'type_block': {
      const block = rng.pick(BLOCK_INSERTS);
      return { type, payload: block, description: `insert block: ${block.split('\n')[0].substring(0, 30)}...` };
    }

    case 'enter':
      return { type, payload: 'Enter', description: 'press Enter' };

    case 'tab':
      return { type, payload: 'Tab', description: 'press Tab' };

    case 'shift_tab':
      return { type, payload: 'Shift+Tab', description: 'press Shift+Tab' };

    case 'backspace':
      return { type, payload: 'Backspace', description: 'press Backspace' };

    case 'delete':
      return { type, payload: 'Delete', description: 'press Delete' };

    case 'cursor_move': {
      const direction = rng.pick([
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
        'Home', 'End',
        'PageUp', 'PageDown',
      ]);
      return { type, payload: direction, description: `move cursor: ${direction}` };
    }

    case 'click_line': {
      const line = rng.int(1, Math.max(1, docLineCount));
      const ch = rng.int(0, 40);
      return { type, payload: `${line},${ch}`, description: `click line ${line} ch ${ch}` };
    }

    case 'select_and_surround': {
      const surroundChar = rng.pick(['*', '**', '`', '(', '[', '~~', '==', '$$']);
      return { type, payload: surroundChar, description: `select+surround with '${surroundChar}'` };
    }

    default:
      return { type: 'type_char', payload: 'a', description: "type 'a'" };
  }
}

/** 生成 N 步操作序列 */
export function generateSequence(rng: PRNG, steps: number, getLineCount: () => number): Action[] {
  const actions: Action[] = [];
  for (let i = 0; i < steps; i++) {
    actions.push(generateAction(rng, getLineCount()));
  }
  return actions;
}
