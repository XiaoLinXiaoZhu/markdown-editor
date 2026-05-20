/**
 * Fuzz 操作池
 *
 * 定义所有可能的编辑器操作及其权重。
 * PRNG 按权重抽取操作，构成随机测试序列。
 */
import type { PRNG } from './prng';

export type ActionType =
  | 'type_char'
  | 'type_markdown'
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
const MARKDOWN_TOKENS = ['#', '##', '###', '*', '**', '`', '```', '>', '- ', '1. ', '[[', ']]', '~~', '==', '---', '- [ ] '];

const ACTION_TYPES: ActionType[] = [
  'type_char',
  'type_markdown',
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
  40, // type_char
  20, // type_markdown
  10, // enter
  3,  // tab
  2,  // shift_tab
  7,  // backspace
  3,  // delete
  5,  // cursor_move
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
      const direction = rng.pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
      return { type, payload: direction, description: `move cursor: ${direction}` };
    }

    case 'click_line': {
      const line = rng.int(1, Math.max(1, docLineCount));
      const ch = rng.int(0, 20);
      return { type, payload: `${line},${ch}`, description: `click line ${line} ch ${ch}` };
    }

    case 'select_and_surround': {
      const surroundChar = rng.pick(['*', '**', '`', '(', '[']);
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
