/**
 * 模块组装器
 *
 * 将拆分后的模块文件按层级顺序重新组装为可运行的 vendor 单文件。
 * 这是模块拆分的逆操作——验证拆分正确性，以及作为"替换单模块后重建"的工具。
 *
 * 使用：cd packages/core && bun run e2e/coverage/assemble.ts
 * 输入：output/modules/*.js
 * 输出：output/obsidian-app.assembled.js
 *
 * 验证：用 assembled.js 替换 vendor/obsidian-app.patched.js 后跑 E2E 测试
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(import.meta.dir, 'output');
const MODULES_DIR = join(OUTPUT_DIR, 'modules');
const ASSEMBLED_PATH = join(OUTPUT_DIR, 'obsidian-app.assembled.js');

// Module load order — this IS the "index"
// Removing a module from this list = removing it from the build
const MODULE_ORDER = [
  '00-mocks',
  '01-webpack-modules',
  '02-webpack-runtime',
  '03-exports',
  '04-ts-helpers',
  '05-cm6-state',
  '06-cm6-rangeset',
  '07-cm6-view-dom',
  '08-cm6-view-core',
  '09-cm6-view-ext',
  '10-lezer-common',
  '11-cm6-language',
  '12-cm6-commands',
  '13-cm6-search',
  '14-obsidian-ui',
  '15-obsidian-vault',
  '16-obsidian-editor',
  '17-obsidian-widgets',
  '18-live-preview',
  '19-obsidian-complete',
  '20-lezer-lr',
  '21-obsidian-app',
];

function getModuleBody(moduleId: string): string {
  const filePath = join(MODULES_DIR, `${moduleId}.js`);
  if (!existsSync(filePath)) {
    console.warn(`[assemble] Module not found, skipping: ${moduleId}`);
    return '';
  }
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  // Skip header comments (lines starting with //) and the empty line after
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('//') && lines[i].trim() !== '') {
      bodyStart = i;
      break;
    }
    // Also skip the empty line right after the header block
    if (lines[i].trim() === '' && i > 0 && !lines[i - 1].startsWith('//')) {
      bodyStart = i;
      break;
    }
  }
  return lines.slice(bodyStart).join('\n');
}

function main() {
  console.log('[assemble] Assembling modules...');
  console.log(`[assemble] Module order: ${MODULE_ORDER.length} modules`);

  const parts: string[] = [];
  for (const id of MODULE_ORDER) {
    const body = getModuleBody(id);
    if (body) {
      parts.push(body);
      const lineCount = body.split('\n').length;
      console.log(`  ${id}: ${lineCount} lines`);
    }
  }

  const assembled = parts.join('\n');
  writeFileSync(ASSEMBLED_PATH, assembled);

  const lineCount = assembled.split('\n').length;
  const size = (assembled.length / 1024 / 1024).toFixed(2);
  console.log(`\n[assemble] Output: ${ASSEMBLED_PATH}`);
  console.log(`[assemble] ${lineCount} lines, ${size} MB`);

  // Verify against original
  const originalPath = join(OUTPUT_DIR, 'obsidian-app.deobfuscated.js');
  if (existsSync(originalPath)) {
    const original = readFileSync(originalPath, 'utf-8');
    if (assembled === original) {
      console.log('[assemble] ✅ Assembled output matches original exactly');
    } else {
      const origLines = original.split('\n');
      const asmLines = assembled.split('\n');
      console.log(`[assemble] ⚠️ Mismatch: original ${origLines.length} lines vs assembled ${asmLines.length} lines`);
      // Find first difference
      for (let i = 0; i < Math.min(origLines.length, asmLines.length); i++) {
        if (origLines[i] !== asmLines[i]) {
          console.log(`  First diff at line ${i + 1}`);
          console.log(`  Original:  ${origLines[i].slice(0, 80)}`);
          console.log(`  Assembled: ${asmLines[i].slice(0, 80)}`);
          break;
        }
      }
    }
  }
}

main();
