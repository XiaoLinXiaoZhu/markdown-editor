/**
 * Vendor 模块拆解工具
 *
 * 将 deobfuscated vendor 单体文件拆解为窄接口模块：
 * Step 1: 依赖图构建
 * Step 2: 内联标注 + 清理空声明
 * Step 3: 模块拆分输出
 *
 * 使用：cd packages/core && bun run e2e/coverage/module-split.ts
 */
import { parse } from '@babel/parser';
import * as t from '@babel/types';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(import.meta.dir, 'output');
const INPUT_PATH = join(OUTPUT_DIR, 'obsidian-app.deobfuscated.js');
const MODULES_DIR = join(OUTPUT_DIR, 'modules');
const GRAPH_PATH = join(OUTPUT_DIR, 'dependency-graph.json');

// ━━━━━━━━━━━━━━━ Types ━━━━━━━━━━━━━━━

interface Declaration {
  name: string;
  type: 'var' | 'function' | 'class';
  startLine: number;
  endLine: number;
  defines: string[];
  references: string[];
  isEmpty: boolean;
  isPassThrough: boolean;
  delegateTo?: string;
  referencedBy: string[];
}

interface DepGraph {
  totalDeclarations: number;
  totalLines: number;
  emptyCount: number;
  passThroughCount: number;
  declarations: Declaration[];
  knownModules: { name: string; packageName: string; exports: string[] }[];
}

interface ModuleCluster {
  id: string;
  name: string;
  declarations: string[];
  imports: string[];
  exports: string[];
  lineRange: [number, number];
  lineCount: number;
}

// ━━━━━━━━━━━━━━━ AST Helpers ━━━━━━━━━━━━━━━

function collectRefs(node: t.Node | null | undefined, allDefined: Set<string>, outerScope: Set<string>): string[] {
  if (!node) return [];
  const refs = new Set<string>();

  function walk(n: t.Node, scope: Set<string>) {
    // When entering a new function scope, extend the scope with params + local vars
    if (t.isFunctionExpression(n) || t.isArrowFunctionExpression(n) || t.isFunctionDeclaration(n)) {
      const newScope = new Set(scope);
      if ('id' in n && n.id && t.isIdentifier(n.id)) newScope.add(n.id.name);
      for (const param of n.params) {
        if (t.isIdentifier(param)) newScope.add(param.name);
        if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) newScope.add(param.left.name);
        if (t.isRestElement(param) && t.isIdentifier(param.argument)) newScope.add(param.argument.name);
      }
      if (t.isBlockStatement(n.body)) {
        collectLocalVarsFlat(n.body, newScope);
      }
      // Walk body with new scope
      const keys = t.VISITOR_KEYS[n.type];
      if (keys) {
        for (const key of keys) {
          if (key === 'params' || key === 'id') continue; // already handled
          const child = (n as any)[key];
          if (Array.isArray(child)) {
            for (const item of child) {
              if (item && typeof item === 'object' && item.type) walk(item, newScope);
            }
          } else if (child && typeof child === 'object' && child.type) {
            walk(child, newScope);
          }
        }
      }
      return;
    }

    // Record identifier references
    if (t.isIdentifier(n)) {
      if (allDefined.has(n.name) && !scope.has(n.name)) {
        refs.add(n.name);
      }
    }

    // Recurse into children
    const keys = t.VISITOR_KEYS[n.type];
    if (!keys) return;
    for (const key of keys) {
      const child = (n as any)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === 'object' && item.type) walk(item, scope);
        }
      } else if (child && typeof child === 'object' && child.type) {
        walk(child, scope);
      }
    }
  }

  walk(node, outerScope);
  return [...refs].sort();
}

/** Collect var/function declarations from a block (non-recursive into nested functions) */
function collectLocalVarsFlat(body: t.BlockStatement, scope: Set<string>) {
  for (const stmt of body.body) {
    if (t.isVariableDeclaration(stmt)) {
      for (const d of stmt.declarations) if (t.isIdentifier(d.id)) scope.add(d.id.name);
    }
    if (t.isFunctionDeclaration(stmt) && stmt.id) scope.add(stmt.id.name);
    // Recurse into blocks (for, if, while, try) but not into functions
    collectLocalVarsInBlock(stmt, scope);
  }
}

function collectLocalVarsInBlock(node: t.Node, scope: Set<string>) {
  if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node) || t.isFunctionDeclaration(node)) return;
  if (t.isVariableDeclaration(node)) {
    for (const d of node.declarations) if (t.isIdentifier(d.id)) scope.add(d.id.name);
  }
  if (t.isCatchClause(node) && node.param && t.isIdentifier(node.param)) scope.add(node.param.name);
  const keys = t.VISITOR_KEYS[node.type];
  if (!keys) return;
  for (const key of keys) {
    const child = (node as any)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) collectLocalVarsInBlock(item, scope);
      }
    } else if (child && typeof child === 'object' && child.type) {
      collectLocalVarsInBlock(child, scope);
    }
  }
}

function collectLocalVars(node: t.Node, scope: Set<string>) {
  if (!node || typeof node !== 'object' || !('type' in node)) return;
  if (t.isVariableDeclaration(node)) {
    for (const d of node.declarations) if (t.isIdentifier(d.id)) scope.add(d.id.name);
  }
  if (t.isFunctionDeclaration(node) && node.id) scope.add(node.id.name);
  if (t.isCatchClause(node) && node.param && t.isIdentifier(node.param)) scope.add(node.param.name);
  // Don't recurse into nested function expressions/declarations (they have their own scope)
  // but DO recurse into blocks, ifs, loops, etc.
  if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) return;
  const keys = t.VISITOR_KEYS[node.type];
  if (!keys) return;
  for (const key of keys) {
    const child = (node as any)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) collectLocalVars(item, scope);
      }
    } else if (child && typeof child === 'object' && child.type) {
      collectLocalVars(child, scope);
    }
  }
}

function isEmptyBody(init: t.Expression | null | undefined): boolean {
  if (!init) return true;
  if ((t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) && t.isBlockStatement(init.body)) {
    return init.body.body.length === 0;
  }
  return false;
}

function checkPassThrough(init: t.Expression | null | undefined): { pt: boolean; to?: string } {
  if (!init) return { pt: false };
  if (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) {
    if (t.isBlockStatement(init.body) && init.body.body.length === 1) {
      const s = init.body.body[0];
      if (t.isReturnStatement(s) && s.argument) {
        if (t.isCallExpression(s.argument) && t.isIdentifier(s.argument.callee))
          return { pt: true, to: s.argument.callee.name };
        if (t.isIdentifier(s.argument))
          return { pt: true, to: s.argument.name };
      }
    }
    if (!t.isBlockStatement(init.body) && t.isCallExpression(init.body) && t.isIdentifier(init.body.callee))
      return { pt: true, to: init.body.callee.name };
  }
  return { pt: false };
}

function checkFnPassThrough(fn: t.FunctionDeclaration): { pt: boolean; to?: string } {
  if (fn.body.body.length === 1) {
    const s = fn.body.body[0];
    if (t.isReturnStatement(s) && s.argument) {
      if (t.isCallExpression(s.argument) && t.isIdentifier(s.argument.callee))
        return { pt: true, to: s.argument.callee.name };
      if (t.isIdentifier(s.argument))
        return { pt: true, to: s.argument.name };
    }
  }
  return { pt: false };
}

// ━━━━━━━━━━━━━━━ Step 1 ━━━━━━━━━━━━━━━

function buildGraph(source: string): DepGraph {
  console.log('[split] Step 1: Building dependency graph...');
  const ast = parse(source, { sourceType: 'script', plugins: ['dynamicImport'], attachComment: false });

  // Find main IIFE → inner IIFE
  let innerBody: t.Statement[] | null = null;
  for (const stmt of ast.program.body) {
    if (!t.isExpressionStatement(stmt)) continue;
    const expr = stmt.expression;
    if (t.isCallExpression(expr) && t.isArrowFunctionExpression(expr.callee) && t.isBlockStatement(expr.callee.body)) {
      // Outer IIFE
      for (const inner of expr.callee.body.body) {
        if (!t.isExpressionStatement(inner)) continue;
        const ie = inner.expression;
        if (t.isCallExpression(ie) && t.isArrowFunctionExpression(ie.callee) && t.isBlockStatement(ie.callee.body)) {
          innerBody = ie.callee.body.body;
        }
      }
    }
  }
  if (!innerBody) throw new Error('Inner IIFE not found');
  console.log(`[split] Inner IIFE: ${innerBody.length} statements`);

  // Extract known modules from n.d()
  const PKG: Record<string, string> = {
    e: '@codemirror/state', t: '@codemirror/view', i: '@lezer/common',
    r: '@lezer/highlight', o: '@codemirror/language', a: '@codemirror/commands',
    s: '@codemirror/search', l: '@codemirror/autocomplete', c: '@codemirror/collab',
    u: '@codemirror/lint', h: '@lezer/lr', d: 'obsidian',
  };
  const knownModules: DepGraph['knownModules'] = [];
  for (const stmt of innerBody) {
    if (!t.isExpressionStatement(stmt)) continue;
    const expr = stmt.expression;
    if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee) &&
        t.isIdentifier(expr.callee.object, { name: 'n' }) &&
        t.isIdentifier(expr.callee.property, { name: 'd' }) &&
        expr.arguments.length === 2 && t.isIdentifier(expr.arguments[0]) && t.isObjectExpression(expr.arguments[1])) {
      const vn = expr.arguments[0].name;
      const exps = (expr.arguments[1] as t.ObjectExpression).properties
        .filter((p): p is t.ObjectProperty => t.isObjectProperty(p) && t.isIdentifier(p.key))
        .map(p => (p.key as t.Identifier).name);
      knownModules.push({ name: vn, packageName: PKG[vn] || `pkg:${vn}`, exports: exps });
    }
  }
  console.log(`[split] Known modules: ${knownModules.length}`);

  // Collect all top-level names
  const allDefined = new Set<string>();
  for (const stmt of innerBody) {
    if (t.isVariableDeclaration(stmt)) {
      for (const d of stmt.declarations) if (t.isIdentifier(d.id)) allDefined.add(d.id.name);
    } else if (t.isFunctionDeclaration(stmt) && stmt.id) {
      allDefined.add(stmt.id.name);
    } else if (t.isClassDeclaration(stmt) && stmt.id) {
      allDefined.add(stmt.id.name);
    }
  }
  console.log(`[split] Total top-level names: ${allDefined.size}`);

  // Analyze each declaration
  const declarations: Declaration[] = [];
  for (const stmt of innerBody) {
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (!t.isIdentifier(decl.id)) continue;
        const name = decl.id.name;
        const defines = [name];
        const localScope = new Set(defines);
        // If init is a function, collect its params and local vars
        if (decl.init && (t.isFunctionExpression(decl.init) || t.isArrowFunctionExpression(decl.init))) {
          for (const param of decl.init.params) {
            if (t.isIdentifier(param)) localScope.add(param.name);
            if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) localScope.add(param.left.name);
          }
          if (t.isBlockStatement(decl.init.body)) collectLocalVars(decl.init.body, localScope);
        }
        const isEmpty = isEmptyBody(decl.init);
        const { pt, to } = checkPassThrough(decl.init);
        const references = collectRefs(decl.init, allDefined, localScope);
        declarations.push({ name, type: 'var', startLine: stmt.loc?.start.line || 0, endLine: stmt.loc?.end.line || 0, defines, references, isEmpty, isPassThrough: pt, delegateTo: to, referencedBy: [] });
      }
    } else if (t.isFunctionDeclaration(stmt) && stmt.id) {
      const name = stmt.id.name;
      const params = stmt.params.map(p => t.isIdentifier(p) ? p.name : '').filter(Boolean);
      const localScope = new Set([name, ...params]);
      collectLocalVars(stmt.body, localScope);
      // Also collect params from nested arrow/function expressions that might shadow top-level names
      // The deep collectLocalVars already handles blocks but not params of the function itself beyond top level
      const isEmpty = stmt.body.body.length === 0;
      const { pt, to } = checkFnPassThrough(stmt);
      const references = collectRefs(stmt.body, allDefined, localScope);
      declarations.push({ name, type: 'function', startLine: stmt.loc?.start.line || 0, endLine: stmt.loc?.end.line || 0, defines: [name], references, isEmpty, isPassThrough: pt, delegateTo: to, referencedBy: [] });
    } else if (t.isClassDeclaration(stmt) && stmt.id) {
      const name = stmt.id.name;
      const isEmpty = stmt.body.body.length === 0;
      const references = collectRefs(stmt, allDefined, new Set([name]));
      declarations.push({ name, type: 'class', startLine: stmt.loc?.start.line || 0, endLine: stmt.loc?.end.line || 0, defines: [name], references, isEmpty, isPassThrough: false, referencedBy: [] });
    }
  }

  // Build reverse refs
  for (const decl of declarations) {
    for (const ref of decl.references) {
      const target = declarations.find(d => d.name === ref);
      if (target) target.referencedBy.push(decl.name);
    }
  }

  const emptyCount = declarations.filter(d => d.isEmpty).length;
  const passThroughCount = declarations.filter(d => d.isPassThrough).length;
  console.log(`[split] Declarations: ${declarations.length}, Empty: ${emptyCount}, PassThrough: ${passThroughCount}`);

  return { totalDeclarations: declarations.length, totalLines: source.split('\n').length, emptyCount, passThroughCount, declarations, knownModules };
}

// ━━━━━━━━━━━━━━━ Step 2 ━━━━━━━━━━━━━━━

function cleanSource(source: string, graph: DepGraph): { cleaned: string; removedLines: number; inlineMarks: number } {
  console.log('\n[split] Step 2: Cleaning...');
  const lines = source.split('\n');
  const linesToRemove = new Set<number>();
  let inlineMarks = 0;

  // Remove empty declarations not referenced by anyone
  for (const decl of graph.declarations) {
    if (decl.isEmpty && decl.referencedBy.length === 0) {
      for (let i = decl.startLine; i <= decl.endLine; i++) linesToRemove.add(i);
    }
  }

  // Mark pass-through candidates
  const ptCandidates = graph.declarations.filter(d => d.isPassThrough && d.delegateTo && d.referencedBy.length <= 3 && d.referencedBy.length > 0);
  const ptLines = new Map<number, Declaration>();
  for (const c of ptCandidates) ptLines.set(c.startLine, c);
  inlineMarks = ptCandidates.length;

  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    if (linesToRemove.has(lineNum)) continue;
    const pt = ptLines.get(lineNum);
    if (pt) result.push(`    /* @inline → ${pt.delegateTo} (refs: ${pt.referencedBy.length}) */`);
    result.push(lines[i]);
  }

  console.log(`[split] Removed ${linesToRemove.size} lines (${graph.declarations.filter(d => d.isEmpty && d.referencedBy.length === 0).length} dead empty decls)`);
  console.log(`[split] Annotated ${inlineMarks} pass-through functions`);
  return { cleaned: result.join('\n'), removedLines: linesToRemove.size, inlineMarks };
}

// ━━━━━━━━━━━━━━━ Step 3 ━━━━━━━━━━━━━━━

const BOUNDARIES = [
  { id: '00-mocks', name: 'Electron/Require Mocks', start: 1, end: 40 },
  { id: '01-webpack-modules', name: 'Webpack Modules', start: 41, end: 9947 },
  { id: '02-webpack-runtime', name: 'Webpack Runtime', start: 9948, end: 9991 },
  { id: '03-exports', name: 'Export Declarations (n.d)', start: 9992, end: 10489 },
  { id: '04-ts-helpers', name: 'TypeScript Helpers', start: 10490, end: 10625 },
  { id: '05-cm6-state', name: '@codemirror/state', start: 10626, end: 12700 },
  { id: '06-cm6-rangeset', name: '@codemirror/state (RangeSet)', start: 12701, end: 13400 },
  { id: '07-cm6-view-dom', name: '@codemirror/view (DOM)', start: 13401, end: 15900 },
  { id: '08-cm6-view-core', name: '@codemirror/view (EditorView)', start: 15901, end: 18300 },
  { id: '09-cm6-view-ext', name: '@codemirror/view (extensions)', start: 18301, end: 20600 },
  { id: '10-lezer-common', name: '@lezer/common + highlight', start: 20601, end: 21800 },
  { id: '11-cm6-language', name: '@codemirror/language', start: 21801, end: 23500 },
  { id: '12-cm6-commands', name: '@codemirror/commands + history', start: 23501, end: 25500 },
  { id: '13-cm6-search', name: '@codemirror/search', start: 25501, end: 26200 },
  { id: '14-obsidian-ui', name: 'Obsidian UI/Base', start: 26201, end: 29000 },
  { id: '15-obsidian-vault', name: 'Obsidian Vault/File', start: 29001, end: 31500 },
  { id: '16-obsidian-editor', name: 'Obsidian Editor Ext', start: 31501, end: 34000 },
  { id: '17-obsidian-widgets', name: 'Obsidian Widgets', start: 34001, end: 36631 },
  { id: '18-live-preview', name: 'Live Preview (mH+kH)', start: 36632, end: 37174 },
  { id: '19-obsidian-complete', name: 'Obsidian Autocomplete', start: 37175, end: 38100 },
  { id: '20-lezer-lr', name: '@lezer/lr', start: 38101, end: 38400 },
  { id: '21-obsidian-app', name: 'Obsidian App/Bootstrap', start: 38401, end: 99999 },
];

function splitModules(source: string, graph: DepGraph): ModuleCluster[] {
  console.log('\n[split] Step 3: Splitting into modules...');
  const lines = source.split('\n');
  mkdirSync(MODULES_DIR, { recursive: true });

  const declMap = new Map<string, Declaration>();
  for (const d of graph.declarations) declMap.set(d.name, d);

  const clusters: ModuleCluster[] = [];

  for (const b of BOUNDARIES) {
    const end = Math.min(b.end, lines.length);
    const decls = graph.declarations.filter(d => d.startLine >= b.start && d.startLine <= end);
    const names = decls.map(d => d.name);
    const nameSet = new Set(names);

    const imports = new Set<string>();
    for (const d of decls) for (const r of d.references) if (!nameSet.has(r)) imports.add(r);

    const exports = new Set<string>();
    for (const d of decls) {
      for (const rb of d.referencedBy) {
        const rd = declMap.get(rb);
        if (rd && (rd.startLine < b.start || rd.startLine > end)) exports.add(d.name);
      }
    }

    const cluster: ModuleCluster = {
      id: b.id, name: b.name, declarations: names,
      imports: [...imports].sort(), exports: [...exports].sort(),
      lineRange: [b.start, end], lineCount: end - b.start + 1,
    };
    clusters.push(cluster);

    // Write module file
    const header = [
      `// ═══════════════════════════════════════════════`,
      `// Module: ${b.name}`,
      `// ID: ${b.id}`,
      `// Lines: ${b.start}-${end} (${end - b.start + 1} lines)`,
      `// Declarations: ${names.length}`,
      `// Imports (${cluster.imports.length}): ${cluster.imports.slice(0, 30).join(', ')}${cluster.imports.length > 30 ? ' ...' : ''}`,
      `// Exports (${cluster.exports.length}): ${cluster.exports.slice(0, 30).join(', ')}${cluster.exports.length > 30 ? ' ...' : ''}`,
      `// ═══════════════════════════════════════════════`,
      '',
    ];
    const moduleContent = [...header, ...lines.slice(b.start - 1, end)].join('\n');
    writeFileSync(join(MODULES_DIR, `${b.id}.js`), moduleContent);
  }

  // Write summary index
  const summary = clusters.map(c =>
    `${c.id.padEnd(25)} | ${String(c.declarations.length).padStart(4)} decls | ${String(c.imports.length).padStart(3)} imports | ${String(c.exports.length).padStart(3)} exports | L${c.lineRange[0]}-${c.lineRange[1]}`
  ).join('\n');
  writeFileSync(join(MODULES_DIR, '_index.txt'), `Module Split Summary\n${'='.repeat(100)}\n${summary}\n`);

  console.log(`[split] Written ${clusters.length} module files to ${MODULES_DIR}`);
  return clusters;
}

// ━━━━━━━━━━━━━━━ Main ━━━━━━━━━━━━━━━

function main() {
  if (!existsSync(INPUT_PATH)) {
    console.error(`[split] Input not found: ${INPUT_PATH}\n[split] Run deobfuscate.ts first.`);
    process.exit(1);
  }

  console.log('[split] Reading deobfuscated source...');
  const source = readFileSync(INPUT_PATH, 'utf-8');
  console.log(`[split] Input: ${(source.length / 1024 / 1024).toFixed(2)} MB, ${source.split('\n').length} lines\n`);

  // Step 1
  const graph = buildGraph(source);

  // Save graph (without full source, just metadata)
  const graphJson = {
    totalDeclarations: graph.totalDeclarations,
    totalLines: graph.totalLines,
    emptyCount: graph.emptyCount,
    passThroughCount: graph.passThroughCount,
    knownModules: graph.knownModules,
    declarations: graph.declarations.map(d => ({
      name: d.name, type: d.type, startLine: d.startLine, endLine: d.endLine,
      defines: d.defines, references: d.references,
      isEmpty: d.isEmpty, isPassThrough: d.isPassThrough, delegateTo: d.delegateTo,
      referencedBy: d.referencedBy,
    })),
  };
  writeFileSync(GRAPH_PATH, JSON.stringify(graphJson, null, 2));
  console.log(`[split] Dependency graph saved: ${GRAPH_PATH}`);

  // Step 2
  const { cleaned, removedLines, inlineMarks } = cleanSource(source, graph);
  const cleanedPath = join(OUTPUT_DIR, 'obsidian-app.cleaned.js');
  writeFileSync(cleanedPath, cleaned);
  console.log(`[split] Cleaned source saved: ${cleanedPath} (${cleaned.split('\n').length} lines, -${removedLines})`);

  // Step 3
  const clusters = splitModules(source, graph);

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log('[split] COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  Declarations: ${graph.totalDeclarations}`);
  console.log(`  Empty (stripped): ${graph.emptyCount}`);
  console.log(`  Pass-through: ${graph.passThroughCount}`);
  console.log(`  Inline candidates marked: ${inlineMarks}`);
  console.log(`  Dead empties removed: ${removedLines} lines`);
  console.log(`  Modules created: ${clusters.length}`);
  console.log(`  Output: ${MODULES_DIR}/`);
  console.log('═'.repeat(60));
}

main();
