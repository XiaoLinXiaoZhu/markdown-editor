/**
 * 原子化 CHANGELOG 构建脚本
 *
 * 读取 changelog/<version>/<type>-<name>.md 片段文件，
 * 按版本（semver 降序）和类型分组，生成 CHANGELOG.md。
 *
 * 片段文件命名规则：
 *   <type>-<name>.md
 *   type: breaking | added | changed | fixed | removed
 *   name: 任意描述性名称（kebab-case）
 *
 * 片段内容：一行或多行文本，直接作为 bullet point 插入。
 *
 * 用法：
 *   bun run scripts/build-changelog.ts
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CHANGELOG_DIR = join(import.meta.dir, '..', 'changelog');
const OUTPUT = join(import.meta.dir, '..', 'CHANGELOG.md');

const TYPE_ORDER = ['breaking', 'added', 'changed', 'fixed', 'removed'] as const;
const TYPE_HEADINGS: Record<string, string> = {
  breaking: 'Breaking Changes',
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
  removed: 'Removed',
};

interface Fragment {
  type: string;
  name: string;
  content: string;
}

function parseVersion(v: string): number[] {
  return v.split('.').map(Number);
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  }
  return 0;
}

function readFragments(versionDir: string): Fragment[] {
  const files = readdirSync(versionDir).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const match = f.match(/^(breaking|added|changed|fixed|removed)-(.+)\.md$/);
    if (!match) {
      console.warn(`  Skipping unrecognized fragment: ${f}`);
      return null;
    }
    const content = readFileSync(join(versionDir, f), 'utf8').trim();
    return { type: match[1], name: match[2], content };
  }).filter(Boolean) as Fragment[];
}

function buildVersionSection(version: string, fragments: Fragment[]): string {
  const lines: string[] = [];
  lines.push(`## [${version}]`);
  lines.push('');

  for (const type of TYPE_ORDER) {
    const items = fragments.filter(f => f.type === type);
    if (items.length === 0) continue;
    lines.push(`### ${TYPE_HEADINGS[type]}`);
    lines.push('');
    for (const item of items) {
      // Support multi-line fragments: first line as bullet, rest indented
      const contentLines = item.content.split('\n');
      lines.push(`- ${contentLines[0]}`);
      for (let i = 1; i < contentLines.length; i++) {
        lines.push(`  ${contentLines[i]}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ──

if (!existsSync(CHANGELOG_DIR)) {
  console.error('changelog/ directory not found');
  process.exit(1);
}

const versions = readdirSync(CHANGELOG_DIR)
  .filter(d => /^\d+\.\d+\.\d+$/.test(d))
  .sort(compareVersions);

console.log(`Found ${versions.length} versions: ${versions.join(', ')}`);

const sections: string[] = [];

// Header
sections.push('# Changelog');
sections.push('');
sections.push('All notable changes to `@xlxz/markdown-editor` will be documented in this file.');
sections.push('');
sections.push('Format follows [Keep a Changelog](https://keepachangelog.com/). Generated from `changelog/` fragments.');
sections.push('');

// Check for unreleased
const unreleasedDir = join(CHANGELOG_DIR, 'unreleased');
if (existsSync(unreleasedDir)) {
  const fragments = readFragments(unreleasedDir);
  if (fragments.length > 0) {
    sections.push('---');
    sections.push('');
    sections.push(buildVersionSection('Unreleased', fragments));
  }
}

// Version sections
for (const version of versions) {
  const versionDir = join(CHANGELOG_DIR, version);
  const fragments = readFragments(versionDir);
  if (fragments.length === 0) {
    console.warn(`  No fragments in ${version}/`);
    continue;
  }
  console.log(`  ${version}: ${fragments.length} fragments`);
  sections.push('---');
  sections.push('');
  sections.push(buildVersionSection(version, fragments));
}

const output = sections.join('\n').trimEnd() + '\n';
writeFileSync(OUTPUT, output);
console.log(`\nWritten to CHANGELOG.md (${output.length} bytes)`);
