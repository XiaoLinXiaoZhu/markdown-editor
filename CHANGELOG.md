# Changelog

All notable changes to `@xlxz/markdown-editor` will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). Generated from `changelog/` fragments.

---

## [2.1.2]

### Fixed

- MathJax and other lazily-loaded vendor assets (Prism, Mermaid, etc.) now resolve correctly on GitHub Pages sub-path deployments via `window.__assetBase` runtime prefix

---

## [2.1.1]

### Removed

- `EditorMode` type, `editor.setMode()` / `editor.getMode()` API, and mode toggle UI removed — the implementation was fundamentally incorrect (Obsidian uses a separate MarkdownPreviewRenderer for reading mode, not a CM6 reconfiguration)

---

## [2.1.0]

### Added

- `editor.setMode(mode)` / `editor.getMode()` — switch between IR (live preview), RAW (source), VIEW (reading) modes; `editor.setTheme(theme)` — switch dark/light themes at runtime; `EditorMode` type exported; demo toolbar with toggle buttons
- `table-continuation` plugin — Enter in table rows inserts empty row, Enter on empty row exits table, auto-formats after insertion

### Fixed

- Table row color alternation — even rows now transparent, odd rows tinted for clean visual rhythm

---

## [2.0.0]

### Breaking Changes

- Internal architecture rewritten to microkernel + plugin system: kernel reduced from ~882 to ~180 lines, all features extracted into 18 independent `EditorPlugin` modules, default plugin set conditionally loaded based on `EditorOptions`; all plugins and `CompletionProvider` type exported for advanced composition; `src/extensions.ts`, `src/suggest.ts`, `src/link-handler.ts`, `src/attachment.ts` removed (replaced by plugin equivalents)
- Package renamed from `xlxz-markdown-editor` to `@xlxz/markdown-editor`

### Added

- **Input Prompter** (`suggest` plugin): multi-provider completion framework — multiple `CompletionProvider` instances share a single popup UI, supports `[[` wiki-link, `#` tag, `/` command, or any custom trigger
