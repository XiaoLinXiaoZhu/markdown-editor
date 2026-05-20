/**
 * strip-ebml.ts — Remove EBML/ts-ebml module chain from vendor bundle
 * 
 * Removes 13 modules exclusively reachable from module 8246 (audio recorder metadata),
 * and stubs module 8246 with a pass-through (returns blob unchanged).
 * 
 * Saves ~6000 lines / ~150 KB from vendor/obsidian-app.patched.js
 * 
 * Usage: bun run packages/core/e2e/coverage/strip-ebml.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const VENDOR_PATH = resolve(__dirname, '../../vendor/obsidian-app.patched.js');
const content = readFileSync(VENDOR_PATH, 'utf8');
const lines = content.split('\n');

// Modules to completely remove (only reachable from 8246)
const MODULES_TO_REMOVE = [
  '9742',  // base64-js
  '645',   // ieee754
  '8166',  // buffer polyfill
  '4370',  // EBML schema definitions
  '1166',  // int64-buffer
  '3210',  // ts-ebml tools
  '8031',  // ts-ebml Encoder
  '190',   // ts-ebml helper
  '2800',  // ts-ebml Decoder
  '1381',  // ts-ebml Reader
  '1384',  // ts-ebml barrel
  '4990',  // ts-ebml types
  '7187',  // events (EventEmitter)
];

// Module to stub (entry point from inner IIFE)
const MODULE_TO_STUB = '8246';

// Stub: exports.default = async (blob) => blob
const STUB_BODY = `    ${MODULE_TO_STUB}: (e, t) => {
      // Stubbed: ts-ebml makeMetadataSeekable (audio recorder, not needed for editor)
      Object.defineProperty(t, "__esModule", { value: true });
      t.default = function(blob) { return Promise.resolve(blob); };
    }`;

/**
 * Find the start and end line indices of a module entry in the webpack table.
 * Module entries are formatted as: `moduleId: (params) => { ... },`
 */
function findModuleBounds(moduleId: string): { start: number; end: number } | null {
  // Find start line
  let startLine = -1;
  for (let i = 52; i < 15840; i++) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith(`${moduleId}:`) || trimmed.startsWith(`${moduleId}: `)) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) {
    console.error(`Module ${moduleId} not found in table`);
    return null;
  }

  // Find end by brace counting
  let depth = 0;
  let started = false;
  let endLine = -1;

  for (let i = startLine; i < 15840; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '{') { depth++; started = true; }
      if (ch === '}') {
        depth--;
        if (started && depth === 0) {
          endLine = i;
          break;
        }
      }
    }
    if (endLine >= 0) break;
  }

  if (endLine === -1) {
    console.error(`Could not find end of module ${moduleId}`);
    return null;
  }

  return { start: startLine, end: endLine };
}

// Collect all ranges to remove
const rangesToRemove: { start: number; end: number; id: string }[] = [];

for (const id of MODULES_TO_REMOVE) {
  const bounds = findModuleBounds(id);
  if (!bounds) {
    console.error(`Failed to find module ${id}, aborting.`);
    process.exit(1);
  }
  rangesToRemove.push({ ...bounds, id });
}

// Find stub target
const stubBounds = findModuleBounds(MODULE_TO_STUB);
if (!stubBounds) {
  console.error(`Failed to find module ${MODULE_TO_STUB}, aborting.`);
  process.exit(1);
}

// Sort ranges by start line (descending) so we can remove from bottom to top
rangesToRemove.sort((a, b) => b.start - a.start);

console.log('Modules to remove:');
for (const { id, start, end } of rangesToRemove) {
  console.log(`  ${id}: L${start + 1}-L${end + 1} (${end - start + 1} lines)`);
}
console.log(`Module to stub: ${MODULE_TO_STUB}: L${stubBounds.start + 1}-L${stubBounds.end + 1}`);

// Apply transformations
let resultLines = [...lines];

// First, handle the stub (replace 8246's content)
// Check if the line after end has a comma
const afterStub = resultLines[stubBounds.end];
const hasTrailingComma = afterStub.trimEnd().endsWith('},') || 
                          (stubBounds.end + 1 < resultLines.length && resultLines[stubBounds.end + 1].trimStart().startsWith(','));

// Replace stub module
const stubWithComma = STUB_BODY + (afterStub.trimEnd().endsWith('},') ? ',' : '');
resultLines.splice(stubBounds.start, stubBounds.end - stubBounds.start + 1, stubWithComma);

// Recalculate ranges after stub replacement (stub is shorter)
const stubDelta = (stubBounds.end - stubBounds.start + 1) - 1; // lines saved from stub
// Adjust ranges that come after the stub
for (const range of rangesToRemove) {
  if (range.start > stubBounds.start) {
    range.start -= stubDelta;
    range.end -= stubDelta;
  }
}

// Now remove modules from bottom to top
for (const { id, start, end } of rangesToRemove) {
  // Check if we need to handle the trailing comma
  // The module entry typically ends with `},` on the last line or `}` followed by `,` on next
  const lastLine = resultLines[end];
  let removeEnd = end;
  
  // If the closing `}` doesn't have a comma, check if next line starts with comma
  if (!lastLine.trimEnd().endsWith(',')) {
    if (removeEnd + 1 < resultLines.length && resultLines[removeEnd + 1].trim() === ',') {
      removeEnd++;
    }
  }
  
  // Remove the module entry
  resultLines.splice(start, removeEnd - start + 1);
  console.log(`  Removed ${id}: ${removeEnd - start + 1} lines`);
}

// Write result
const result = resultLines.join('\n');
writeFileSync(VENDOR_PATH, result);

const originalSize = content.length;
const newSize = result.length;
const saved = originalSize - newSize;
const originalLines = lines.length;
const newLines = resultLines.length;

console.log(`\nDone!`);
console.log(`  Original: ${(originalSize / 1024).toFixed(1)} KB, ${originalLines} lines`);
console.log(`  New:      ${(newSize / 1024).toFixed(1)} KB, ${newLines} lines`);
console.log(`  Saved:    ${(saved / 1024).toFixed(1)} KB, ${originalLines - newLines} lines`);
