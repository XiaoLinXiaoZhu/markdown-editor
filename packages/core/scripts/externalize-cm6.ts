/**
 * externalize-cm6.ts
 * 
 * Takes the vendor bundle and replaces CM6 class/function definitions
 * with assignments from window.__cm6_all (provided by cm6-runtime.js).
 * 
 * Usage: bun run scripts/externalize-cm6.ts
 * Input:  vendor/obsidian-app.patched.js
 * Output: vendor/obsidian-app.cm6-external.js
 */

import { readFileSync, writeFileSync } from 'fs';

const INPUT = '../../ref/public/vendor/obsidian-app.patched.js';
const OUTPUT = 'vendor/obsidian-app.cm6-external.js';
const MAPPING_FILE = 'e2e/coverage/output/cm6-var-mapping.json';

// Load files
const content = readFileSync(INPUT, 'utf8');
const mapping: Record<string, { exportName: string; varName: string }[]> = 
  JSON.parse(readFileSync(MAPPING_FILE, 'utf8'));

// Flatten mapping to varName → { pkg, exportName }
const varMap = new Map<string, { pkg: string; exportName: string }>();
for (const [pkg, exports] of Object.entries(mapping)) {
  for (const exp of exports) {
    varMap.set(exp.varName, { pkg, exportName: exp.exportName });
  }
}

console.log(`Loaded ${varMap.size} variable mappings`);

/**
 * Find the end of an IIFE starting at a given position.
 * Looks for the pattern: (function () { ... })() or (function (e) { ... })(X)
 * Returns the position AFTER the closing ");" or "),"
 */
function findIIFEEnd(src: string, startOfFunction: number): number {
  // Find the opening brace of the function body
  let pos = src.indexOf('{', startOfFunction);
  if (pos === -1) return -1;
  
  let braceCount = 1;
  pos++;
  
  while (pos < src.length && braceCount > 0) {
    const ch = src[pos];
    if (ch === '{') braceCount++;
    else if (ch === '}') braceCount--;
    else if (ch === '"' || ch === "'") {
      // Skip string literals
      const quote = ch;
      pos++;
      while (pos < src.length && src[pos] !== quote) {
        if (src[pos] === '\\') pos++; // skip escaped char
        pos++;
      }
    } else if (ch === '/' && src[pos + 1] === '/') {
      // Skip line comments
      while (pos < src.length && src[pos] !== '\n') pos++;
    } else if (ch === '/' && src[pos + 1] === '*') {
      // Skip block comments
      pos += 2;
      while (pos < src.length && !(src[pos] === '*' && src[pos + 1] === '/')) pos++;
      pos++; // skip the /
    } else if (ch === '`') {
      // Skip template literals
      pos++;
      while (pos < src.length && src[pos] !== '`') {
        if (src[pos] === '\\') pos++;
        else if (src[pos] === '$' && src[pos + 1] === '{') {
          // Template expression — need to count braces
          pos += 2;
          let tBrace = 1;
          while (pos < src.length && tBrace > 0) {
            if (src[pos] === '{') tBrace++;
            else if (src[pos] === '}') tBrace--;
            pos++;
          }
          continue;
        }
        pos++;
      }
    }
    pos++;
  }
  
  // Now pos is right after the closing } of the function body
  // We need to skip past the closing ")();" or ")(X);" or ")(X),"
  // Pattern after function body: })(args) or })()
  // Skip whitespace
  while (pos < src.length && /\s/.test(src[pos])) pos++;
  // Expect ")"
  if (src[pos] === ')') pos++;
  // Expect "(" for the call
  if (src[pos] === '(') {
    // Skip the arguments
    let parenCount = 1;
    pos++;
    while (pos < src.length && parenCount > 0) {
      if (src[pos] === '(') parenCount++;
      else if (src[pos] === ')') parenCount--;
      pos++;
    }
  }
  
  return pos;
}

/**
 * Find major CM6 class definitions (IIFE pattern) and their boundaries.
 * Pattern: "var X = (function () {" or "X = (function () {"
 */
function findDefinitions(src: string): Array<{
  varName: string;
  start: number; // start of "var X = " or "X = "
  end: number;   // after the IIFE closes
  lineNum: number;
}> {
  const results: Array<{ varName: string; start: number; end: number; lineNum: number }> = [];
  
  // Target the major CM6 classes — these are the big IIFEs
  const majorVars = new Set([
    // @codemirror/state
    'z',   // Text
    'be',  // EditorSelection
    'Ce',  // Facet
    'ct',  // EditorState
    'ye',  // SelectionRange
    'ue',  // ChangeDesc — but careful, might be reused
    'he',  // ChangeSet
    'De',  // StateField
    '$e',  // StateEffect — dollar sign in name!
    'Qe',  // Transaction
    'mt',  // RangeSet
    'vt',  // RangeSetBuilder
    'Ne',  // Compartment
    
    // @codemirror/view
    'Vo',  // EditorView
    'qi',  // ViewPlugin
    'Gn',  // Decoration
    'jn',  // WidgetType
    'er',  // ViewUpdate
    
    // @lezer/common
    'Qc',  // NodeProp
    'tu',  // NodeType
    'iu',  // NodeSet
    'au',  // Tree
    'lu',  // TreeBuffer
    'bu',  // TreeCursor
    'Tu',  // Parser
    'Su',  // NodeWeakMap
    
    // @lezer/lr
    'Nq',  // LRParser
    'Mq',  // ExternalTokenizer
    'Bq',  // ContextTracker
  ]);
  
  for (const varName of majorVars) {
    if (!varMap.has(varName)) continue;
    
    // Search for "var X = (function" or "X = (function"
    const patterns = [
      `var ${varName} = (function`,
      `${varName} = (function`,
    ];
    
    for (const pattern of patterns) {
      let searchFrom = 0;
      let idx: number;
      while ((idx = src.indexOf(pattern, searchFrom)) !== -1) {
        // Make sure this is a definition, not part of another identifier
        if (idx > 0 && /[a-zA-Z0-9_$]/.test(src[idx - 1]) && !pattern.startsWith('var')) {
          searchFrom = idx + 1;
          continue;
        }
        
        // Verify it's in the entry point (after L14412 → byte offset ~450000)
        if (idx < 400000) {
          searchFrom = idx + 1;
          continue;
        }
        
        const lineNum = src.substring(0, idx).split('\n').length;
        
        // Find the start of the assignment (go back to find 'var' or start of expression)
        let start = idx;
        if (!pattern.startsWith('var')) {
          // Go back to find the start — could be "var X = ..., Y = (function"
          // Just use the current position
        }
        
        // Find the IIFE end
        const funcStart = src.indexOf('(function', idx);
        const end = findIIFEEnd(src, funcStart + 1); // +1 to skip the opening (
        
        if (end > idx) {
          results.push({ varName, start: idx, end, lineNum });
          break; // Found the definition, move to next var
        }
        
        searchFrom = idx + 1;
      }
    }
  }
  
  // Deduplicate: keep only one entry per varName (earliest position)
  const seen = new Map<string, typeof results[0]>();
  for (const r of results) {
    const existing = seen.get(r.varName);
    if (!existing || r.start < existing.start) {
      seen.set(r.varName, r);
    }
  }
  return [...seen.values()].sort((a, b) => a.start - b.start);
}

console.log('Finding CM6 IIFE definitions...');
const definitions = findDefinitions(content);

console.log(`\nFound ${definitions.length} IIFE definitions:`);
let totalCharsRemoved = 0;
for (const def of definitions) {
  const size = def.end - def.start;
  const info = varMap.get(def.varName);
  console.log(`  ${def.varName} (${info?.pkg}.${info?.exportName}) at L${def.lineNum}: ${size} chars`);
  totalCharsRemoved += size;
}
console.log(`\nTotal chars to replace: ${totalCharsRemoved} (${(totalCharsRemoved / content.length * 100).toFixed(1)}% of file)`);

// Now build the modified file
console.log('\nBuilding modified vendor...');

let result = content;
let offset = 0;

// Process definitions in reverse order to maintain position validity
const sortedDefs = [...definitions].sort((a, b) => b.start - a.start);

for (const def of sortedDefs) {
  const info = varMap.get(def.varName)!;
  const replacement = `var ${def.varName} = window.__cm6_all["${info.pkg}"].${info.exportName}`;
  
  // Check if it starts with "var" or not
  const originalText = result.substring(def.start, def.start + 10);
  const hasVar = originalText.startsWith('var ');
  
  if (!hasVar) {
    // It's part of a comma expression: "X = (function..."
    // Replace with just the assignment
    const rep = `${def.varName} = window.__cm6_all["${info.pkg}"].${info.exportName}`;
    result = result.substring(0, def.start) + rep + result.substring(def.end);
  } else {
    result = result.substring(0, def.start) + replacement + result.substring(def.end);
  }
}

// Add cm6-runtime.js loading check at the beginning
const iifeStart = result.indexOf('(() => {\n      "use strict";\n');
if (iifeStart === -1) {
  console.error('Could not find inner IIFE start!');
  // Try alternate pattern
  const alt = result.indexOf("(() => {\n      \"use strict\";");
  console.log('Alt search:', alt);
}

writeFileSync(OUTPUT, result);
console.log(`\nWritten: ${OUTPUT} (${(result.length / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Size reduction: ${((content.length - result.length) / 1024).toFixed(0)} KB`);
