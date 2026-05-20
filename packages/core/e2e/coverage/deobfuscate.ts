/**
 * AST 去混淆 + 格式化
 *
 * 对 stripped vendor 进行进一步的可读性优化：
 * 1. 逗号表达式展平：(a(), b(), c) → a(); b(); c;
 * 2. 三元运算符展开（语句级）：a ? b() : c() → if(a){b()}else{c()}
 * 3. 短路求值展开（语句级）：a && b() → if(a){b()}
 * 4. void 0 → undefined
 * 5. !0 → true, !1 → false
 * 6. 紧凑格式化输出（去除空行）
 *
 * 使用：cd packages/core && bun run e2e/coverage/deobfuscate.ts
 * 输入：output/obsidian-app.stripped.js
 * 输出：output/obsidian-app.deobfuscated.js
 */
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(import.meta.dir, 'output');
const INPUT_PATH = join(OUTPUT_DIR, 'obsidian-app.stripped.js');
const OUTPUT_PATH = join(OUTPUT_DIR, 'obsidian-app.deobfuscated.js');

function main() {
  if (!existsSync(INPUT_PATH)) {
    console.error(`[deobf] Input not found: ${INPUT_PATH}`);
    console.error('[deobf] Run ast-strip.ts first.');
    process.exit(1);
  }

  console.log('[deobf] Reading stripped source...');
  const source = readFileSync(INPUT_PATH, 'utf-8');
  console.log(`[deobf] Input: ${(source.length / 1024 / 1024).toFixed(1)} MB`);

  console.log('[deobf] Parsing AST...');
  const ast = parse(source, {
    sourceType: 'script',
    plugins: ['dynamicImport'],
    attachComment: false,
  });

  console.log('[deobf] Applying transforms...');
  let stats = { comma: 0, ternary: 0, shortCircuit: 0, voidZero: 0, bangNum: 0 };

  // @ts-ignore
  const traverseFn = (traverse as any).default || traverse;
  traverseFn(ast, {
    // ── void 0 → undefined, !0 → true, !1 → false ──
    UnaryExpression(path: any) {
      const node = path.node;
      if (node.operator === 'void' && t.isNumericLiteral(node.argument, { value: 0 })) {
        path.replaceWith(t.identifier('undefined'));
        stats.voidZero++;
      }
      if (node.operator === '!') {
        if (t.isNumericLiteral(node.argument, { value: 0 })) {
          path.replaceWith(t.booleanLiteral(true));
          stats.bangNum++;
        } else if (t.isNumericLiteral(node.argument, { value: 1 })) {
          path.replaceWith(t.booleanLiteral(false));
          stats.bangNum++;
        }
      }
    },

    // ── 逗号表达式展平 + 短路求值展开 + 三元展开（语句级） ──
    ExpressionStatement: {
      exit(path: any) {
        const expr = path.node.expression;

        // 逗号表达式展平
        if (t.isSequenceExpression(expr) && expr.expressions.length > 1) {
          const stmts = expr.expressions.map((e: any) => t.expressionStatement(e));
          path.replaceWithMultiple(stmts);
          stats.comma++;
          return;
        }

        // 三元 → if/else
        if (t.isConditionalExpression(expr)) {
          const { test, consequent, alternate } = expr;
          path.replaceWith(
            t.ifStatement(
              test,
              t.blockStatement([t.expressionStatement(consequent)]),
              t.blockStatement([t.expressionStatement(alternate)])
            )
          );
          stats.ternary++;
          return;
        }

        // 短路求值 → if
        if (t.isLogicalExpression(expr)) {
          const { operator, left, right } = expr;
          if (!t.isCallExpression(right) && !t.isAssignmentExpression(right)) return;
          if (operator === '&&') {
            path.replaceWith(
              t.ifStatement(left, t.blockStatement([t.expressionStatement(right)]))
            );
            stats.shortCircuit++;
          } else if (operator === '||') {
            path.replaceWith(
              t.ifStatement(
                t.unaryExpression('!', left),
                t.blockStatement([t.expressionStatement(right)])
              )
            );
            stats.shortCircuit++;
          }
        }
      },
    },

    // ── return (a, b, c) → a; b; return c; ──
    ReturnStatement: {
      exit(path: any) {
        const arg = path.node.argument;
        if (arg && t.isSequenceExpression(arg) && arg.expressions.length > 1) {
          const exprs = [...arg.expressions];
          const last = exprs.pop()!;
          const stmts: any[] = exprs.map((e: any) => t.expressionStatement(e));
          stmts.push(t.returnStatement(last));
          path.replaceWithMultiple(stmts);
          stats.comma++;
        }
      },
    },
  });

  console.log('[deobf] Transform stats:', stats);

  // 生成格式化输出
  console.log('[deobf] Generating formatted output...');
  // @ts-ignore
  const generateFn = (generate as any).default || generate;
  const output = generateFn(ast, {
    compact: false,
    concise: false,
    retainLines: false,
    // 合理缩进
    indent: { style: '  ' },
  });

  writeFileSync(OUTPUT_PATH, output.code);

  const outLines = output.code.split('\n').length;
  console.log(`\n[deobf] Output: ${OUTPUT_PATH}`);
  console.log(`[deobf] Size: ${(output.code.length / 1024 / 1024).toFixed(1)} MB / ${outLines.toLocaleString()} lines`);
  console.log(`[deobf] Transforms applied:`);
  console.log(`  - Comma expressions flattened: ${stats.comma}`);
  console.log(`  - Ternary → if/else: ${stats.ternary}`);
  console.log(`  - Short-circuit → if: ${stats.shortCircuit}`);
  console.log(`  - void 0 → undefined: ${stats.voidZero}`);
  console.log(`  - !0/!1 → true/false: ${stats.bangNum}`);
}

main();
