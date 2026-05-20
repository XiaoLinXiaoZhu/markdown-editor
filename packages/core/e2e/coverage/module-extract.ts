/**
 * Webpack 模块提取器
 *
 * 解析 vendor bundle 的 webpack 模块映射结构，结合覆盖率数据，
 * 对每个模块进行分类（第三方库 / 活跃业务逻辑 / 死代码），
 * 输出分类报告和只含活跃业务逻辑的精简版。
 *
 * 使用：cd packages/core && bun run e2e/coverage/module-extract.ts
 */
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'http://localhost:3002';
const OUTPUT_DIR = join(import.meta.dir, 'output');
const VENDOR_PATH = join(import.meta.dir, '../../vendor/obsidian-app.patched.js');

// 已知第三方库的指纹特征
const LIBRARY_SIGNATURES: Array<{ name: string; patterns: RegExp[] }> = [
  { name: 'base64-js', patterns: [/byteLength/, /toByteArray/, /fromByteArray/, /ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/] },
  { name: 'events (EventEmitter)', patterns: [/EventEmitter/, /prototype\.on\b/, /prototype\.emit\b/, /prototype\.removeListener/] },
  { name: 'buffer', patterns: [/Buffer\.from/, /Buffer\.alloc/, /prototype\.write/, /prototype\.readUInt/] },
  { name: 'hast-util-to-html', patterns: [/tagName/, /omitOptionalTags/, /allowDangerousHtml/, /hast/i] },
  { name: 'rehype/unified', patterns: [/unified/, /rehype/, /remark/, /\.use\(/, /\.process\(/] },
  { name: 'html-void-elements', patterns: [/area.*base.*br.*col.*embed.*hr.*img.*input/, /void.*elements/i] },
  { name: 'property-information', patterns: [/ariaActivedescendant/, /acceptCharset/, /htmlFor/] },
  { name: 'stringify-entities', patterns: [/stringifyEntities/, /&#x/, /&amp;/, /toHexReference/] },
  { name: 'turndown', patterns: [/TurndownService/, /turndown/] },
  { name: 'i18next', patterns: [/i18next/, /interpolation/, /fallbackLng/] },
  { name: 'binary-parser', patterns: [/nextInt16BE/, /nextUInt8/, /nextUIntV/, /nextIntV/] },
  { name: 'codemirror (CM6)', patterns: [/EditorView/, /EditorState/, /ViewPlugin/, /Decoration/, /syntaxTree/] },
  { name: 'lezer', patterns: [/TreeBuffer/, /NodeType/, /Parser/, /TreeFragment/, /parseMixed/] },
  { name: 'markdown-it/mdast', patterns: [/mdast/, /fromMarkdown/, /toMarkdown/] },
];

interface ModuleInfo {
  id: string;
  startLine: number;
  endLine: number;
  byteStart: number;
  byteEnd: number;
  size: number;
  covered: boolean;
  coveragePercent: number;
  library: string | null;
  category: 'dead' | 'third-party-dead' | 'third-party-live' | 'business-logic';
  preview: string;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. 读取源码
  console.log('[modules] Reading vendor source...');
  const source = readFileSync(VENDOR_PATH, 'utf-8');
  const lines = source.split('\n');

  // 2. 收集覆盖率
  console.log('[modules] Collecting coverage...');
  const coveredBytes = await collectCoverageBytes(source.length);

  // 3. 解析 AST，提取 webpack 模块
  console.log('[modules] Parsing AST...');
  const ast = parse(source, { sourceType: 'script', plugins: ['dynamicImport'], ranges: true, attachComment: false });

  console.log('[modules] Extracting webpack modules...');
  const modules: ModuleInfo[] = [];

  // @ts-ignore
  const traverseFn = (traverse as any).default || traverse;
  traverseFn(ast, {
    ObjectExpression(path: any) {
      const node = path.node;
      // 找到 webpack 模块表：顶层对象，属性键为数字，值为函数
      if (!isWebpackModuleMap(node)) return;

      for (const prop of node.properties) {
        if (!t.isObjectProperty(prop) && !t.isObjectMethod(prop)) continue;

        let moduleId: string;
        if (t.isNumericLiteral(prop.key)) {
          moduleId = String(prop.key.value);
        } else if (t.isStringLiteral(prop.key)) {
          moduleId = prop.key.value;
        } else if (t.isIdentifier(prop.key)) {
          moduleId = prop.key.name;
        } else {
          continue;
        }

        const start = prop.start!;
        const end = prop.end!;
        const size = end - start;

        // 计算覆盖率
        let coveredCount = 0;
        for (let i = start; i < end && i < coveredBytes.length; i++) {
          if (coveredBytes[i]) coveredCount++;
        }
        const coveragePercent = size > 0 ? (coveredCount / size) * 100 : 0;
        const covered = coveragePercent > 5; // >5% 算活跃

        // 提取模块源码文本用于指纹识别
        const moduleText = source.substring(start, Math.min(end, start + 2000));
        const library = identifyLibrary(moduleText);

        // 行号
        const startLine = offsetToLine(lines, start);
        const endLine = offsetToLine(lines, end);

        // 分类
        let category: ModuleInfo['category'];
        if (!covered) {
          category = library ? 'third-party-dead' : 'dead';
        } else {
          category = library ? 'third-party-live' : 'business-logic';
        }

        // 预览
        const preview = lines[startLine - 1]?.trim().substring(0, 60) || '';

        modules.push({
          id: moduleId, startLine, endLine, byteStart: start, byteEnd: end,
          size, covered, coveragePercent: parseFloat(coveragePercent.toFixed(1)),
          library, category, preview,
        });
      }

      // 不需要继续深入
      path.skip();
    },
  });

  // 4. 统计和报告
  console.log(`\n[modules] Found ${modules.length} webpack modules`);

  const dead = modules.filter(m => m.category === 'dead');
  const thirdPartyDead = modules.filter(m => m.category === 'third-party-dead');
  const thirdPartyLive = modules.filter(m => m.category === 'third-party-live');
  const business = modules.filter(m => m.category === 'business-logic');

  const sumSize = (ms: ModuleInfo[]) => ms.reduce((s, m) => s + m.size, 0);

  console.log('\n' + '='.repeat(65));
  console.log('WEBPACK MODULE ANALYSIS');
  console.log('='.repeat(65));
  console.log(`  Total modules: ${modules.length}`);
  console.log(`  Dead (unknown):        ${dead.length} modules, ${(sumSize(dead)/1024).toFixed(0)} KB`);
  console.log(`  Dead (third-party):    ${thirdPartyDead.length} modules, ${(sumSize(thirdPartyDead)/1024).toFixed(0)} KB`);
  console.log(`  Live (third-party):    ${thirdPartyLive.length} modules, ${(sumSize(thirdPartyLive)/1024).toFixed(0)} KB`);
  console.log(`  Live (business logic): ${business.length} modules, ${(sumSize(business)/1024).toFixed(0)} KB`);

  // 第三方库汇总
  const libGroups = new Map<string, { count: number; totalSize: number; live: number }>();
  for (const m of modules) {
    if (!m.library) continue;
    const g = libGroups.get(m.library) || { count: 0, totalSize: 0, live: 0 };
    g.count++;
    g.totalSize += m.size;
    if (m.covered) g.live++;
    libGroups.set(m.library, g);
  }

  if (libGroups.size > 0) {
    console.log('\n  Identified third-party libraries:');
    for (const [name, info] of [...libGroups.entries()].sort((a, b) => b[1].totalSize - a[1].totalSize)) {
      console.log(`    ${name}: ${info.count} modules, ${(info.totalSize/1024).toFixed(0)} KB (${info.live} live)`);
    }
  }

  console.log('\n  Top 15 largest BUSINESS LOGIC modules:');
  const bizSorted = [...business].sort((a, b) => b.size - a.size);
  for (const m of bizSorted.slice(0, 15)) {
    console.log(`    [${m.coveragePercent}%] Module ${m.id} L${m.startLine}-${m.endLine} (${(m.size/1024).toFixed(1)} KB): ${m.preview}`);
  }

  console.log('\n  Top 10 largest DEAD modules:');
  const deadSorted = [...dead, ...thirdPartyDead].sort((a, b) => b.size - a.size);
  for (const m of deadSorted.slice(0, 10)) {
    const lib = m.library ? ` [${m.library}]` : '';
    console.log(`    Module ${m.id} L${m.startLine}-${m.endLine} (${(m.size/1024).toFixed(1)} KB)${lib}: ${m.preview}`);
  }

  // 5. 保存报告
  const report = {
    summary: {
      totalModules: modules.length,
      dead: { count: dead.length, bytes: sumSize(dead) },
      thirdPartyDead: { count: thirdPartyDead.length, bytes: sumSize(thirdPartyDead) },
      thirdPartyLive: { count: thirdPartyLive.length, bytes: sumSize(thirdPartyLive) },
      businessLogic: { count: business.length, bytes: sumSize(business) },
    },
    libraries: Object.fromEntries(libGroups),
    modules: modules.sort((a, b) => a.byteStart - b.byteStart),
  };
  writeFileSync(join(OUTPUT_DIR, 'module-analysis.json'), JSON.stringify(report, null, 2));
  console.log(`\n  Report saved: ${join(OUTPUT_DIR, 'module-analysis.json')}`);
}

function isWebpackModuleMap(node: any): boolean {
  // webpack 模块表：至少 5 个属性，键为数字，值为函数
  if (!node.properties || node.properties.length < 5) return false;
  let numericKeyCount = 0;
  let functionValueCount = 0;
  const sample = node.properties.slice(0, Math.min(10, node.properties.length));
  for (const prop of sample) {
    if (!t.isObjectProperty(prop)) continue;
    if (t.isNumericLiteral(prop.key) || (t.isStringLiteral(prop.key) && /^\d+$/.test(prop.key.value))) {
      numericKeyCount++;
    }
    if (t.isArrowFunctionExpression(prop.value) || t.isFunctionExpression(prop.value)) {
      functionValueCount++;
    }
  }
  return numericKeyCount >= 3 && functionValueCount >= 3;
}

function identifyLibrary(moduleText: string): string | null {
  for (const lib of LIBRARY_SIGNATURES) {
    const matches = lib.patterns.filter(p => p.test(moduleText));
    if (matches.length >= 2) return lib.name; // 至少 2 个特征匹配
  }
  return null;
}

function offsetToLine(lines: string[], offset: number): number {
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    pos += lines[i].length + 1;
    if (pos > offset) return i + 1;
  }
  return lines.length;
}

async function collectCoverageBytes(totalBytes: number): Promise<Uint8Array> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.coverage.startJSCoverage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__editorView != null, { timeout: 15_000 });

  // 简单场景以收集覆盖率
  await page.evaluate(() => {
    const view = (window as any).__editorView;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# H\n\n**b** *i*\n\n- l\n> q\n[[k]]\n![](x)\n![[e]]\n```\nc\n```\n#t\n---' } });
    const line = view.state.doc.line(view.state.doc.lines);
    view.dispatch({ selection: { anchor: line.from } });
    view.focus();
  });
  await new Promise(r => setTimeout(r, 500));
  // Click through lines
  for (let i = 1; i <= 14; i++) {
    await page.evaluate((l: number) => {
      const view = (window as any).__editorView;
      const line = view.state.doc.line(Math.min(l, view.state.doc.lines));
      view.dispatch({ selection: { anchor: line.from } });
    }, i);
    await new Promise(r => setTimeout(r, 50));
  }
  await page.keyboard.type('hello', { delay: 10 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('- item', { delay: 10 });
  await page.keyboard.press('Enter');

  const coverage = await page.coverage.stopJSCoverage();
  await browser.close();

  const vendor = coverage.find(e => e.url.includes('obsidian-app.patched'));
  if (!vendor) throw new Error('Vendor not in coverage');

  const covered = new Uint8Array(totalBytes);
  for (const range of vendor.ranges) {
    for (let i = (range as any).start; i < (range as any).end && i < totalBytes; i++) {
      covered[i] = 1;
    }
  }
  return covered;
}

main().catch(e => { console.error(e); process.exit(1); });
