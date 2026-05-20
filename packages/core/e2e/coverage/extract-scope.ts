/**
 * 闭包提取工具 — 按 AST 作用域嵌套逐层拆分
 *
 * 对指定层级执行一次拆分：列出该层级的直接子块，
 * 计算每个子块的 (inputs, outputs)，输出为独立函数。
 *
 * 使用方式：
 *   bun run e2e/coverage/extract-scope.ts              → 拆分 Level 0（顶层）
 *   bun run e2e/coverage/extract-scope.ts --level 1    → 拆分 Level 1（外层 IIFE 内部）
 *   bun run e2e/coverage/extract-scope.ts --level 2    → 拆分 Level 2（内层 IIFE 内部）
 *   bun run e2e/coverage/extract-scope.ts --level 2 --from 50 --to 100
 *                                                      → 只拆分 Level 2 的第 50-100 个子块
 *
 * 输出目录：output/scope-L{level}/
 *   _index.js  — 组装脚本（调用各子块函数，串联变量）
 *   block_000.js, block_001.js, ... — 每个子块包装为函数
 */
import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(import.meta.dir, 'output');
const INPUT_PATH = join(OUTPUT_DIR, 'obsidian-app.deobfuscated.js');

// ━━━ CLI args ━━━
const args = process.argv.slice(2);
const level = parseInt(args.find((_, i, a) => a[i - 1] === '--level') || '1');
const fromIdx = parseInt(args.find((_, i, a) => a[i - 1] === '--from') || '0');
const toIdx = parseInt(args.find((_, i, a) => a[i - 1] === '--to') || '999999');

// ━━━ Scope-aware free variable analysis ━━━

function collectFreeVars(node: t.Node, outerDefined: Set<string>): { freeVars: Set<string>; definedVars: Set<string> } {
  const definedVars = new Set<string>();
  const freeVars = new Set<string>();

  // First pass: collect all names DEFINED in this node's top-level scope
  collectDefinitions(node, definedVars);

  // Second pass: walk the tree, find identifiers not in local scope
  const localScope = new Set([...definedVars]);
  walkForRefs(node, localScope, outerDefined, freeVars);

  return { freeVars, definedVars };
}

function collectDefinitions(node: t.Node, defs: Set<string>) {
  if (t.isVariableDeclaration(node)) {
    for (const d of node.declarations) {
      if (t.isIdentifier(d.id)) defs.add(d.id.name);
    }
  } else if (t.isFunctionDeclaration(node) && node.id) {
    defs.add(node.id.name);
  } else if (t.isClassDeclaration(node) && node.id) {
    defs.add(node.id.name);
  }
}

function walkForRefs(node: t.Node, localScope: Set<string>, outerDefined: Set<string>, refs: Set<string>) {
  if (t.isIdentifier(node)) {
    if (!localScope.has(node.name) && outerDefined.has(node.name)) {
      refs.add(node.name);
    }
    return;
  }

  // When entering a function, build new scope
  if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
    const newScope = new Set(localScope);
    if ('id' in node && node.id && t.isIdentifier(node.id)) newScope.add(node.id.name);
    for (const p of node.params) {
      if (t.isIdentifier(p)) newScope.add(p.name);
      if (t.isAssignmentPattern(p) && t.isIdentifier(p.left)) newScope.add(p.left.name);
      if (t.isRestElement(p) && t.isIdentifier(p.argument)) newScope.add(p.argument.name);
    }
    if (t.isBlockStatement(node.body)) collectBlockVars(node.body, newScope);
    walkChildren(node, newScope, outerDefined, refs);
    return;
  }

  walkChildren(node, localScope, outerDefined, refs);
}

function walkChildren(node: t.Node, scope: Set<string>, outerDefined: Set<string>, refs: Set<string>) {
  const keys = t.VISITOR_KEYS[node.type];
  if (!keys) return;
  for (const key of keys) {
    const child = (node as any)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) walkForRefs(item, scope, outerDefined, refs);
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkForRefs(child, scope, outerDefined, refs);
    }
  }
}

function collectBlockVars(block: t.BlockStatement, scope: Set<string>) {
  for (const stmt of block.body) {
    if (t.isVariableDeclaration(stmt)) {
      for (const d of stmt.declarations) if (t.isIdentifier(d.id)) scope.add(d.id.name);
    }
    if (t.isFunctionDeclaration(stmt) && stmt.id) scope.add(stmt.id.name);
    // Recurse into blocks but not functions
    if (!t.isFunctionDeclaration(stmt) && !t.isFunctionExpression(stmt) && !t.isArrowFunctionExpression(stmt)) {
      const keys = t.VISITOR_KEYS[stmt.type];
      if (keys) {
        for (const key of keys) {
          const child = (stmt as any)[key];
          if (child && typeof child === 'object' && child.type && t.isBlockStatement(child)) {
            collectBlockVars(child, scope);
          }
        }
      }
    }
  }
}

// ━━━ Get children at specified level ━━━

function getChildren(source: string, level: number): { stmts: t.Statement[]; allDefined: Set<string> } {
  const ast = parse(source, { sourceType: 'script', plugins: ['dynamicImport'], attachComment: false });

  if (level === 0) {
    return { stmts: ast.program.body, allDefined: new Set() };
  }

  // Find outer IIFE
  let outerBody: t.Statement[] = [];
  for (const stmt of ast.program.body) {
    if (t.isExpressionStatement(stmt)) {
      const expr = stmt.expression;
      if (t.isCallExpression(expr) && t.isArrowFunctionExpression(expr.callee) && t.isBlockStatement(expr.callee.body)) {
        outerBody = expr.callee.body.body;
      }
    }
  }

  if (level === 1) {
    // Collect all names defined at level 0 that are visible here
    const allDefined = new Set<string>();
    // Level 0 defines nothing visible inside the IIFE (it's self-contained)
    return { stmts: outerBody, allDefined };
  }

  // Find inner IIFE
  let innerBody: t.Statement[] = [];
  for (const stmt of outerBody) {
    if (t.isExpressionStatement(stmt)) {
      const expr = stmt.expression;
      if (t.isCallExpression(expr) && t.isArrowFunctionExpression(expr.callee) && t.isBlockStatement(expr.callee.body)) {
        innerBody = expr.callee.body.body;
      }
    }
  }

  if (level === 2) {
    // Collect names defined at outer level (e, t, n from webpack)
    const outerDefined = new Set<string>();
    for (const stmt of outerBody) {
      collectDefinitions(stmt, outerDefined);
    }
    return { stmts: innerBody, allDefined: outerDefined };
  }

  throw new Error(`Level ${level} not supported. Use 0, 1, or 2.`);
}

// ━━━ Describe a statement ━━━

function describeStmt(stmt: t.Statement): string {
  if (t.isVariableDeclaration(stmt)) {
    const names = stmt.declarations.map(d => t.isIdentifier(d.id) ? d.id.name : '?');
    return `var ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` (+${names.length - 6})` : ''}`;
  }
  if (t.isFunctionDeclaration(stmt) && stmt.id) return `function ${stmt.id.name}`;
  if (t.isClassDeclaration(stmt) && stmt.id) return `class ${stmt.id.name}`;
  if (t.isExpressionStatement(stmt)) {
    const expr = stmt.expression;
    if (t.isAssignmentExpression(expr) && t.isMemberExpression(expr.left)) {
      const obj = t.isIdentifier(expr.left.object) ? expr.left.object.name : '?';
      const prop = t.isIdentifier(expr.left.property) ? expr.left.property.name : '?';
      return `${obj}.${prop} = ...`;
    }
    if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee)) {
      const obj = t.isIdentifier(expr.callee.object) ? expr.callee.object.name : '?';
      const prop = t.isIdentifier(expr.callee.property) ? expr.callee.property.name : '?';
      return `${obj}.${prop}(...)`;
    }
    if (t.isCallExpression(expr) && (t.isArrowFunctionExpression(expr.callee) || t.isFunctionExpression(expr.callee))) {
      return `(() => {...})()`;
    }
  }
  if (t.isIfStatement(stmt)) return `if (...)`;
  if (t.isForStatement(stmt)) return `for (...)`;
  if (t.isTryStatement(stmt)) return `try {...}`;
  return stmt.type;
}

// ━━━ Main ━━━

function main() {
  console.log(`[extract] Level ${level}, range [${fromIdx}, ${toIdx}]`);
  const source = readFileSync(INPUT_PATH, 'utf-8');
  const { stmts, allDefined } = getChildren(source, level);

  console.log(`[extract] Found ${stmts.length} children at level ${level}`);

  // Build cumulative defined set (variables available at each point)
  // At level 2, statements are sequential — earlier definitions are visible to later ones
  const cumulativeDefined = new Set(allDefined);
  const stmtInfos: Array<{
    idx: number;
    desc: string;
    startLine: number;
    endLine: number;
    defined: string[];
    inputs: string[];
  }> = [];

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const startLine = stmt.loc?.start.line || 0;
    const endLine = stmt.loc?.end.line || 0;

    // Compute free vars for this statement (what it needs from previous statements)
    const { freeVars, definedVars } = collectFreeVars(stmt, cumulativeDefined);

    stmtInfos.push({
      idx: i,
      desc: describeStmt(stmt),
      startLine,
      endLine,
      defined: [...definedVars],
      inputs: [...freeVars].sort(),
    });

    // Add this statement's definitions to cumulative (for next statements)
    for (const d of definedVars) cumulativeDefined.add(d);
  }

  // Compute outputs: which defined vars are used by LATER statements?
  // We need a second pass
  const allLaterRefs = new Set<string>();
  for (let i = stmts.length - 1; i >= 0; i--) {
    stmtInfos[i].inputs.forEach(r => allLaterRefs.add(r));
  }

  // Now output
  const outDir = join(OUTPUT_DIR, `scope-L${level}`);
  mkdirSync(outDir, { recursive: true });

  const slice = stmtInfos.slice(fromIdx, Math.min(toIdx + 1, stmtInfos.length));

  // Compute per-block outputs (defined here, used by later blocks)
  const laterNeeds = new Set<string>();
  for (let i = stmtInfos.length - 1; i >= 0; i--) {
    for (const r of stmtInfos[i].inputs) laterNeeds.add(r);
  }

  // Write summary
  const lines = source.split('\n');
  const summaryLines: string[] = [
    `// Level ${level} extraction: ${slice.length} blocks`,
    `// Each block: function(inputs) { ...code... return { outputs }; }`,
    `//`,
  ];

  for (const info of slice) {
    // Outputs = vars defined here that are referenced by any later block
    const outputs = info.defined.filter(d => {
      for (let j = info.idx + 1; j < stmtInfos.length; j++) {
        if (stmtInfos[j].inputs.includes(d)) return true;
      }
      return false;
    });

    const lineCount = info.endLine - info.startLine + 1;
    summaryLines.push(
      `// #${String(info.idx).padStart(4)}: [L${info.startLine}-${info.endLine}] (${lineCount}L) ${info.desc}`,
      `//       inputs(${info.inputs.length}): ${info.inputs.slice(0, 10).join(', ')}${info.inputs.length > 10 ? '...' : ''}`,
      `//       outputs(${outputs.length}): ${outputs.slice(0, 10).join(', ')}${outputs.length > 10 ? '...' : ''}`,
    );

    // Write individual block file
    const blockCode = lines.slice(info.startLine - 1, info.endLine).join('\n');
    const blockHeader = [
      `// Block #${info.idx}: ${info.desc}`,
      `// Lines: ${info.startLine}-${info.endLine} (${lineCount} lines)`,
      `// inputs(${info.inputs.length}): ${info.inputs.join(', ')}`,
      `// outputs(${outputs.length}): ${outputs.join(', ')}`,
      `//`,
      `// function block_${String(info.idx).padStart(4, '0')}(${info.inputs.join(', ')}) {`,
      `//   ... (original code below) ...`,
      `//   return { ${outputs.join(', ')} };`,
      `// }`,
      '',
    ].join('\n');

    const blockFile = join(outDir, `block_${String(info.idx).padStart(4, '0')}.js`);
    writeFileSync(blockFile, blockHeader + blockCode + '\n');
  }

  // Write index (assembly script)
  const indexLines: string[] = [
    `// ═══ Level ${level} Assembly Index ═══`,
    `// Total blocks: ${stmtInfos.length}`,
    `// Showing: #${fromIdx} to #${Math.min(toIdx, stmtInfos.length - 1)}`,
    `//`,
    `// To use: load blocks in order, passing outputs of earlier blocks as inputs to later ones.`,
    `// To replace a block: provide a function with the same (inputs) => outputs signature.`,
    '',
  ];

  for (const info of slice) {
    const outputs = info.defined.filter(d => {
      for (let j = info.idx + 1; j < stmtInfos.length; j++) {
        if (stmtInfos[j].inputs.includes(d)) return true;
      }
      return false;
    });
    indexLines.push(`// #${info.idx}: ${info.desc}  (${info.inputs.length} in → ${outputs.length} out)`);
  }

  writeFileSync(join(outDir, '_index.js'), [...summaryLines, '', ...indexLines].join('\n'));
  console.log(`[extract] Written ${slice.length} block files + _index.js to ${outDir}`);

  // Print compact summary to console
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Level ${level}: ${stmtInfos.length} blocks`);
  console.log(`${'═'.repeat(70)}`);
  for (const info of slice.slice(0, 50)) {
    const outputs = info.defined.filter(d => {
      for (let j = info.idx + 1; j < stmtInfos.length; j++) {
        if (stmtInfos[j].inputs.includes(d)) return true;
      }
      return false;
    });
    const lineCount = info.endLine - info.startLine + 1;
    console.log(`#${String(info.idx).padStart(4)} [${String(lineCount).padStart(5)}L] ${info.desc.padEnd(30)} | in:${String(info.inputs.length).padStart(3)} out:${String(outputs.length).padStart(3)}`);
  }
  if (slice.length > 50) console.log(`  ... (${slice.length - 50} more)`);
}

main();
