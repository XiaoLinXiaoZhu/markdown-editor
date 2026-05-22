# Changelog

All notable changes to `@xlxz/markdown-editor` will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.1.0] — 2026-05

### Added

- `editor.setTheme(theme)` — switch between dark and light themes at runtime
- `editor.setMode(mode)` — switch between IR (live preview), RAW (source), and VIEW (reading) modes
- `editor.getMode()` — get current editing mode
- `EditorMode` type exported (`'ir' | 'raw' | 'view'`)
- `table-continuation` plugin — Enter in table rows inserts empty row, Enter on empty row exits table, auto-formats after insertion
- Demo toolbar with mode and theme toggle buttons

### Fixed

- Table row color alternation (even rows transparent, odd rows tinted)

---

## [2.0.0] — 2026-05

### Breaking Changes

- Package renamed from `xlxz-markdown-editor` to `@xlxz/markdown-editor`
- Internal architecture completely rewritten (public API remains compatible)

### Added

- **Microkernel architecture**: kernel reduced to ~180 lines, all features implemented as independent plugins
- **18 built-in plugins**: each feature is an `EditorPlugin` with `id`, `deps`, `install`, `uninstall`
- **Input Prompter** (`suggest` plugin): multi-provider completion framework
  - Multiple `CompletionProvider` instances share a single popup UI
  - Supports `[[` wiki-link, `#` tag, `/` command, or any custom trigger
  - `registerSuggest()` API remains backward-compatible
- **Table continuation** (`table-continuation` plugin): Enter on table rows inserts empty row; Enter on empty row exits table; auto-formats after insertion
- **Plugin exports**: all 18 built-in plugins exported for advanced composition
- **`CompletionProvider` type** exported for custom provider authoring
- `tableContinuationPlugin` — smart Enter behavior in Markdown tables

### Changed

- `kernel.ts`: from ~882 lines (monolithic) to ~180 lines (pure lifecycle + registry)
- All features extracted to `src/plugins/` directory (17 files → 18 with table-continuation)
- Default plugin set loaded based on `EditorOptions` (conditional: fold, line-numbers, indent-guide, close-brackets)
- `list-continuation`: uses `Prec.high` for correct priority over base extensions
- `live-preview`: reads mock objects from plugin state instead of accessing uninitialized CM6 fields

### Removed

- `src/extensions.ts` (hardcoded extension assembly — replaced by plugin system)
- `src/suggest.ts` (standalone suggest — replaced by `plugins/suggest.ts`)
- `src/link-handler.ts` (hardcoded — replaced by `plugins/link-handler.ts`)
- `src/attachment.ts` (hardcoded — replaced by `plugins/attachment.ts`)

---

## [1.0.0] — 2025-07

### Added

- Initial release: Obsidian-quality Markdown live preview editor
- `createEditor()` API with `EditorOptions` and `EditorBackend` dependency injection
- Live Preview rendering (WYSIWYG: hide markdown syntax when cursor leaves)
- Markdown language support (wiki-link, callout, tag, embed syntax)
- Smart list continuation (Enter/Tab for ordered, unordered, checkbox lists)
- Auto-pair brackets and Markdown marks (`*`, `_`, `` ` ``, ```` ``` ````)
- Chinese input conversion (`【【` → `[[`, `】】` → `]]`, `···` → `` ``` ``)
- Heading/indent folding with gutter UI
- Line numbers, active line highlight, indent guides
- Link click handling (internal + external)
- Attachment paste/drag-drop with backend integration
- HTML paste → Markdown conversion (TurndownService)
- Pure-text table formatting with copy button
- `registerSuggest()` for custom autocomplete
- `autoLoad()` for vendor script loading
- 38+ E2E tests (Puppeteer-based)
- Fuzz equivalence testing infrastructure

---

[2.1.0]: https://github.com/user/markdown-editor/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/user/markdown-editor/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/user/markdown-editor/releases/tag/v1.0.0
