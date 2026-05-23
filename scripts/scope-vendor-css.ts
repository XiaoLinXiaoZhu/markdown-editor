/**
 * scope-vendor-css.ts
 *
 * 将 vendor/app.css 中的全局元素选择器转换为 scoped 版本：
 * - button/input/select/textarea → 加 .ob-styled class 限定
 * - body { --vars } → 保持不变（CSS 变量全局可用）
 * - body { styling } → .markdown-source-view { styling }
 * - * { box-sizing } → .markdown-source-view, .markdown-source-view * { ... }
 * - html, body { margin/padding/height } → .markdown-source-view { ... }
 *
 * 用法: bun run scripts/scope-vendor-css.ts
 * 输出: packages/core/vendor/app.scoped.css
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const INPUT = resolve(import.meta.dir, '../packages/core/vendor/app.css');
const OUTPUT = resolve(import.meta.dir, '../packages/core/vendor/app.scoped.css');

const CONTAINER = '.markdown-source-view';
const STYLED_CLASS = 'ob-styled';

// Elements that get .ob-styled via JS hook
const STYLED_ELEMENTS = new Set(['button', 'input', 'select', 'textarea']);

const css = readFileSync(INPUT, 'utf8');

/**
 * Tokenize CSS into top-level blocks (selector + body).
 * Handles nested braces (e.g. @media).
 */
interface CssBlock {
  startLine: number;
  selector: string;   // everything before the opening `{`
  body: string;       // content between `{` and `}`
  raw: string;        // original full text including selector + braces
}

function tokenize(source: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    // Skip whitespace/comments between blocks
    while (i < len && (source[i] === ' ' || source[i] === '\n' || source[i] === '\r' || source[i] === '\t')) i++;
    if (i >= len) break;

    // Skip comments
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }

    // Find opening brace
    const braceStart = source.indexOf('{', i);
    if (braceStart === -1) break;

    const selector = source.slice(i, braceStart).trim();
    const startLine = source.slice(0, i).split('\n').length;

    // Find matching closing brace
    let depth = 1;
    let j = braceStart + 1;
    while (j < len && depth > 0) {
      if (source[j] === '{') depth++;
      else if (source[j] === '}') depth--;
      if (source[j] === '/' && source[j + 1] === '*') {
        const ce = source.indexOf('*/', j + 2);
        if (ce !== -1) j = ce + 1;
      }
      j++;
    }

    const body = source.slice(braceStart + 1, j - 1);
    const raw = source.slice(i, j);
    blocks.push({ startLine, selector, body, raw });
    i = j;
  }

  return blocks;
}

/**
 * Check if a body block contains ONLY CSS variable definitions.
 */
function isVarOnlyBlock(body: string): boolean {
  const lines = body.split('\n');
  let inVarDecl = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip comment lines
    if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.endsWith('*/')) continue;
    if (trimmed === '}') continue;
    // CSS variable declaration start
    if (trimmed.startsWith('--')) {
      inVarDecl = !trimmed.endsWith(';');
      continue;
    }
    // Continuation of a multi-line variable value (no colon = not a new property)
    if (inVarDecl) {
      if (trimmed.endsWith(';')) inVarDecl = false;
      continue;
    }
    // Non-variable property declaration
    return false;
  }
  return true;
}

/**
 * Add .ob-styled to an element selector.
 * Examples:
 *   "button" → "button.ob-styled"
 *   "button:not(.clickable-icon)" → "button.ob-styled:not(.clickable-icon)"
 *   "button.mod-cta" → "button.ob-styled.mod-cta"
 *   "button[disabled]" → "button.ob-styled[disabled]"
 *   "input[type='text']" → "input.ob-styled[type='text']"
 */
function addStyledClass(singleSelector: string): string {
  const trimmed = singleSelector.trim();

  for (const el of STYLED_ELEMENTS) {
    // Match element at the start of selector (could be followed by ., :, [, or nothing)
    const regex = new RegExp(`^(${el})(?=[.:\\[\\s,]|$)`);
    if (regex.test(trimmed)) {
      return trimmed.replace(regex, `$1.${STYLED_CLASS}`);
    }
  }

  return trimmed;
}

/**
 * Process a comma-separated selector list.
 * Returns the transformed selector and flags for special handling.
 */
interface SelectorResult {
  transformed: string;
  action: 'keep' | 'scope-container' | 'scope-elements' | 'remove' | 'scope-universal';
}

function processSelector(selector: string, body: string): SelectorResult {
  const parts = splitSelectorList(selector);

  // Special case: `* { box-sizing: border-box }`
  if (parts.length === 1 && parts[0].trim() === '*') {
    return {
      transformed: `${CONTAINER}, ${CONTAINER} *`,
      action: 'scope-universal',
    };
  }

  // Special case: `html, body { ... }` or `html,\nbody { ... }`
  const normalized = parts.map(p => p.trim());
  const isHtmlBody = normalized.every(p => p === 'html' || p === 'body');
  if (isHtmlBody && !isVarOnlyBlock(body)) {
    return {
      transformed: CONTAINER,
      action: 'scope-container',
    };
  }

  // Special case: standalone `body` selector
  if (normalized.length === 1 && normalized[0] === 'body') {
    if (isVarOnlyBlock(body)) {
      return { transformed: 'body', action: 'keep' };
    }
    return { transformed: CONTAINER, action: 'scope-container' };
  }

  // General case: any selector that starts with body or html (with descendants, qualifiers, etc.)
  const hasBodyOrHtml = normalized.some(p => /^(body|html)(?=[.:\[\s>~+,]|$)/.test(p.trim()));
  if (hasBodyOrHtml) {
    // For var-only blocks, keep as-is
    if (isVarOnlyBlock(body)) {
      return { transformed: selector, action: 'keep' };
    }
    // Replace body/html prefix with container
    const transformedParts = normalized.map(p => {
      const trimmedP = p.trim();
      if (/^body(?=[.:\[\s>~+]|$)/.test(trimmedP)) {
        return trimmedP.replace(/^body/, CONTAINER);
      }
      if (/^html(?=[.:\[\s>~+]|$)/.test(trimmedP)) {
        return trimmedP.replace(/^html/, CONTAINER);
      }
      return trimmedP;
    });
    return { transformed: transformedParts.join(',\n'), action: 'scope-container' };
  }

  // Check if any part starts with a styled element
  const hasStyledElement = normalized.some(p => {
    for (const el of STYLED_ELEMENTS) {
      if (new RegExp(`^${el}(?=[.:\\[\\s]|$)`).test(p)) return true;
    }
    return false;
  });

  if (hasStyledElement) {
    const transformedParts = normalized.map(p => addStyledClass(p));
    return { transformed: transformedParts.join(',\n'), action: 'scope-elements' };
  }

  // Default: keep as-is (class-based selectors, already scoped)
  return { transformed: selector, action: 'keep' };
}

/**
 * Split a selector by commas, respecting parentheses (e.g. :not(...)).
 */
function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of selector) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Process @media and other at-rules that contain nested blocks.
 */
function processAtRule(selector: string, body: string): string {
  // For @media, @supports, etc., process the inner blocks
  const innerBlocks = tokenize(body);
  let result = '';

  let lastEnd = 0;
  for (const block of innerBlocks) {
    // Find this block in the body string
    const blockStart = body.indexOf(block.raw, lastEnd);
    if (blockStart > lastEnd) {
      result += body.slice(lastEnd, blockStart);
    }

    const { transformed } = processSelector(block.selector, block.body);
    result += `${transformed} {${block.body}}`;
    lastEnd = blockStart + block.raw.length;
  }

  // Remaining text after last block
  if (lastEnd < body.length) {
    result += body.slice(lastEnd);
  }

  return `${selector} {${result}}`;
}

// Main transformation
const blocks = tokenize(css);
let output = '';
let lastEnd = 0;

for (const block of blocks) {
  const blockStart = css.indexOf(block.raw, lastEnd);

  // Preserve text between blocks (comments, whitespace)
  if (blockStart > lastEnd) {
    output += css.slice(lastEnd, blockStart);
  }

  // Handle at-rules (@media, @supports, @keyframes, etc.)
  if (block.selector.startsWith('@')) {
    if (block.selector.startsWith('@keyframes') || block.selector.startsWith('@font-face')) {
      // Keep keyframes/font-face as-is
      output += block.raw;
    } else {
      // Process inner blocks of @media/@supports
      output += processAtRule(block.selector, block.body);
    }
  } else {
    const { transformed, action } = processSelector(block.selector, block.body);
    if (action === 'remove') {
      // Skip this block entirely
    } else {
      output += `${transformed} {${block.body}}`;
    }
  }

  lastEnd = blockStart + block.raw.length;
}

// Trailing content
if (lastEnd < css.length) {
  output += css.slice(lastEnd);
}

writeFileSync(OUTPUT, output, 'utf8');

const inputLines = css.split('\n').length;
const outputLines = output.split('\n').length;
console.log(`✓ Scoped CSS written to: ${OUTPUT}`);
console.log(`  Input:  ${inputLines} lines`);
console.log(`  Output: ${outputLines} lines`);

// Report what was changed
let statsElements = 0;
let statsContainer = 0;
let statsUniversal = 0;
let statsKept = 0;

for (const block of blocks) {
  if (block.selector.startsWith('@')) continue;
  const { action } = processSelector(block.selector, block.body);
  if (action === 'scope-elements') statsElements++;
  else if (action === 'scope-container') statsContainer++;
  else if (action === 'scope-universal') statsUniversal++;
  else statsKept++;
}

console.log(`\n  Transformations:`);
console.log(`    Element selectors scoped (.ob-styled): ${statsElements}`);
console.log(`    Body/html rules → ${CONTAINER}: ${statsContainer}`);
console.log(`    Universal (*) → container scoped: ${statsUniversal}`);
console.log(`    Kept unchanged: ${statsKept}`);
