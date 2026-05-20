/**
 * 类提取器
 *
 * 对 stripped vendor 进行分析：
 * 1. 识别所有"类模式"（prototype-based 构造函数）
 * 2. 分类为"空壳类"（所有方法体为空）和"活跃类"（有实际逻辑）
 * 3. 空壳类折叠为一行注释
 * 4. 活跃类提取为独立文件
 * 5. 生成一份精简的主文件（空壳类已删除）
 *
 * 使用：cd packages/core && bun run e2e/coverage/class-extract.ts
 */
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(import.meta.dir, 'output');
const INPUT_PATH = join(OUTPUT_DIR, 'obsidian-app.stripped.js');
const CLASSES_DIR = join(OUTPUT_DIR, 'classes');

interface MethodInfo {
  name: string;
  isEmpty: boolean;
  lineCount: number;
}

interface ClassInfo {
  name: string;
  varName: string;
  baseName: string | null;
  methods: MethodInfo[];
  totalMethods: number;
  emptyMethods: number;
  liveMethods: number;
  isShell: boolean;
  startOffset: number;
  endOffset: number;
  sourceCode: string;
}

function main() {
  if (!existsSync(INPUT_PATH)) {
    console.error(`[class] Input not found: ${INPUT_PATH}`);
    console.error('[class] Run ast-strip.ts first.');
    process.exit(1);
  }

  mkdirSync(CLASSES_DIR, { recursive: true });

  console.log('[class] Reading stripped source...');
  const source = readFileSync(INPUT_PATH, 'utf-8');
  console.log(`[class] Input: ${(source.length / 1024 / 1024).toFixed(1)} MB`);

  console.log('[class] Parsing AST...');
  const ast = parse(source, {
    sourceType: 'script',
    plugins: ['dynamicImport'],
    ranges: true,
    attachComment: false,
  });

  console.log('[class] Identifying classes...');
  const classes: ClassInfo[] = [];

  // @ts-ignore
  const traverseFn = (traverse as any).default || traverse;
  // @ts-ignore
  const generateFn = (generate as any).default || generate;

  traverseFn(ast, {
    // 模式: var X = (function(e) { function t(){} ... return t; })(Base)
    // 或: var X = function() { function e(){} ... return e; }()
    VariableDeclarator(path: any) {
      const init = path.node.init;
      if (!init) return;

      // 解包 CallExpression: (function(e){...})(Base) 或 function(){...}()
      let iife: any = null;
      let baseArg: string | null = null;

      if (t.isCallExpression(init)) {
        const callee = init.callee;
        if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
          iife = callee;
          // 基类参数
          if (init.arguments.length > 0) {
            const arg = init.arguments[0];
            if (t.isIdentifier(arg)) baseArg = arg.name;
            else if (t.isMemberExpression(arg) && t.isIdentifier(arg.property)) baseArg = arg.property.name;
          }
        }
        // 括号包裹: (function(e){...})(Base)
        if (t.isSequenceExpression(callee) || t.isParenthesizedExpression(callee)) {
          const inner = (callee as any).expression || (callee as any).expressions?.[0];
          if (inner && (t.isFunctionExpression(inner) || t.isArrowFunctionExpression(inner))) {
            iife = inner;
            if (init.arguments.length > 0 && t.isIdentifier(init.arguments[0])) {
              baseArg = init.arguments[0].name;
            }
          }
        }
      }

      if (!iife || !iife.body || !t.isBlockStatement(iife.body)) return;

      // 检查 IIFE 内部是否有 prototype 赋值模式
      const body = iife.body.body;
      const methods: MethodInfo[] = [];
      let constructorName: string | null = null;

      for (const stmt of body) {
        // 找构造函数: function t() {} 或 function e() {}
        if (t.isFunctionDeclaration(stmt) && stmt.id) {
          constructorName = stmt.id.name;
          continue;
        }

        // 找 prototype 方法赋值: t.prototype.xxx = function() {}
        if (t.isExpressionStatement(stmt) && t.isAssignmentExpression(stmt.expression)) {
          const left = stmt.expression.left;
          const right = stmt.expression.right;

          if (t.isMemberExpression(left) &&
              t.isMemberExpression(left.object) &&
              t.isIdentifier((left.object as any).property, { name: 'prototype' }) &&
              (t.isIdentifier(left.property) || t.isStringLiteral(left.property))) {

            const methodName = t.isIdentifier(left.property) ? left.property.name : (left.property as any).value;

            let isEmpty = false;
            let lineCount = 0;

            if (t.isFunctionExpression(right) || t.isArrowFunctionExpression(right)) {
              if (right.body && t.isBlockStatement(right.body)) {
                isEmpty = right.body.body.length === 0;
                // 也算只有简单 return 的情况为"近似空"
                if (!isEmpty && right.body.body.length === 1) {
                  const single = right.body.body[0];
                  if (t.isReturnStatement(single) && single.argument &&
                      (t.isMemberExpression(single.argument) || t.isIdentifier(single.argument) ||
                       t.isBooleanLiteral(single.argument) || t.isNullLiteral(single.argument))) {
                    // 简单 getter: return this.xxx
                    isEmpty = false; // 保留但标记为简单
                    lineCount = 1;
                  }
                }
                if (!isEmpty) {
                  const code = generateFn(right.body).code;
                  lineCount = code.split('\n').length;
                }
              } else {
                // 箭头函数表达式体
                isEmpty = false;
                lineCount = 1;
              }
            }

            methods.push({ name: methodName, isEmpty, lineCount });
          }
        }
      }

      // 至少有 3 个 prototype 方法才算"类"
      if (methods.length < 3) return;

      const varName = t.isIdentifier(path.node.id) ? path.node.id.name : '(anonymous)';
      const totalMethods = methods.length;
      const emptyMethods = methods.filter(m => m.isEmpty).length;
      const liveMethods = totalMethods - emptyMethods;
      // 空壳类：>80% 方法为空
      const isShell = emptyMethods / totalMethods > 0.8;

      const startOffset = path.parent.start || path.node.start || 0;
      const endOffset = path.parent.end || path.node.end || 0;
      const sourceCode = source.substring(startOffset, endOffset);

      classes.push({
        name: constructorName || varName,
        varName,
        baseName: baseArg,
        methods,
        totalMethods,
        emptyMethods,
        liveMethods,
        isShell,
        startOffset,
        endOffset,
        sourceCode,
      });
    },
  });

  // 排序和统计
  const shells = classes.filter(c => c.isShell);
  const active = classes.filter(c => !c.isShell);

  console.log(`\n[class] Found ${classes.length} classes`);
  console.log(`  Shell classes (>80% empty): ${shells.length}`);
  console.log(`  Active classes: ${active.length}`);
  console.log(`  Shell code size: ${(shells.reduce((s, c) => s + c.sourceCode.length, 0) / 1024).toFixed(0)} KB`);
  console.log(`  Active code size: ${(active.reduce((s, c) => s + c.sourceCode.length, 0) / 1024).toFixed(0)} KB`);

  // 输出活跃类为独立文件
  console.log(`\n[class] Extracting ${active.length} active classes to files...`);
  for (const cls of active) {
    const filename = `${cls.varName}.js`;
    const header = [
      `// Class: ${cls.varName}${cls.baseName ? ` extends ${cls.baseName}` : ''}`,
      `// Methods: ${cls.totalMethods} total, ${cls.liveMethods} with logic, ${cls.emptyMethods} empty`,
      `// Live methods: ${cls.methods.filter(m => !m.isEmpty).map(m => m.name).join(', ')}`,
      '',
    ].join('\n');
    writeFileSync(join(CLASSES_DIR, filename), header + cls.sourceCode);
  }

  // 生成精简主文件（空壳类替换为注释）
  console.log('[class] Generating collapsed version...');
  let collapsed = source;
  // 从后往前替换，避免偏移变化
  const shellsSorted = [...shells].sort((a, b) => b.startOffset - a.startOffset);
  let removedBytes = 0;
  for (const shell of shellsSorted) {
    const comment = `/* [dead class] ${shell.varName}${shell.baseName ? ' extends ' + shell.baseName : ''} — ${shell.totalMethods} empty methods */`;
    // 替换为注释 + 占位变量声明（保持引用不断）
    const replacement = `var ${shell.varName} = null; ${comment}`;
    collapsed = collapsed.substring(0, shell.startOffset) + replacement + collapsed.substring(shell.endOffset);
    removedBytes += (shell.endOffset - shell.startOffset) - replacement.length;
  }

  const collapsedPath = join(OUTPUT_DIR, 'obsidian-app.collapsed.js');
  writeFileSync(collapsedPath, collapsed);
  const collapsedLines = collapsed.split('\n').filter(l => l.trim()).length;
  console.log(`[class] Collapsed: ${collapsedPath}`);
  console.log(`[class] Removed: ${(removedBytes / 1024).toFixed(0)} KB from ${shells.length} shell classes`);
  console.log(`[class] Collapsed size: ${(collapsed.length / 1024 / 1024).toFixed(2)} MB`);

  // 打印报告
  console.log('\n' + '='.repeat(60));
  console.log('CLASS ANALYSIS REPORT');
  console.log('='.repeat(60));

  console.log('\n  Shell classes (can be safely collapsed):');
  for (const c of shells.sort((a, b) => b.totalMethods - a.totalMethods).slice(0, 20)) {
    const liveNames = c.methods.filter(m => !m.isEmpty).map(m => m.name);
    console.log(`    ${c.varName}${c.baseName ? ' ← ' + c.baseName : ''}: ${c.totalMethods} methods (${c.emptyMethods} empty)${liveNames.length ? ' live: ' + liveNames.join(', ') : ''}`);
  }

  console.log('\n  Active classes (extracted to files):');
  for (const c of active.sort((a, b) => b.liveMethods - a.liveMethods).slice(0, 20)) {
    const liveNames = c.methods.filter(m => !m.isEmpty).map(m => m.name).slice(0, 5);
    console.log(`    ${c.varName}${c.baseName ? ' ← ' + c.baseName : ''}: ${c.liveMethods}/${c.totalMethods} live (${(c.sourceCode.length/1024).toFixed(1)} KB) [${liveNames.join(', ')}...]`);
  }

  // 保存分析数据
  const analysisData = {
    total: classes.length,
    shells: shells.length,
    active: active.length,
    shellClasses: shells.map(c => ({
      name: c.varName, base: c.baseName, methods: c.totalMethods, empty: c.emptyMethods,
    })),
    activeClasses: active.map(c => ({
      name: c.varName, base: c.baseName, methods: c.totalMethods, live: c.liveMethods,
      liveMethodNames: c.methods.filter(m => !m.isEmpty).map(m => m.name),
      file: `${c.varName}.js`,
    })),
  };
  writeFileSync(join(OUTPUT_DIR, 'class-analysis.json'), JSON.stringify(analysisData, null, 2));
}

main();
