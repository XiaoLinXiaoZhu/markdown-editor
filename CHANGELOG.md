# Changelog

All notable changes to `@xlxz/markdown-editor` will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). Generated from `changelog/` fragments.

---

## [2.1.0]

### Added

- Demo toolbar with mode and theme toggle buttons
- `editor.getMode()` — get current editing mode; `EditorMode` type exported (`'ir' | 'raw' | 'view'`)
- `editor.setMode(mode)` — switch between IR (live preview), RAW (source), and VIEW (reading) modes
- `editor.setTheme(theme)` — switch between dark and light themes at runtime
- `table-continuation` plugin — Enter in table rows inserts empty row, Enter on empty row exits table, auto-formats after insertion

### Fixed

- Table row color alternation — even rows now transparent, odd rows tinted for clean visual rhythm

---

## [2.0.0]

### Breaking Changes

- Internal architecture completely rewritten (public API remains compatible)
- Package renamed from `xlxz-markdown-editor` to `@xlxz/markdown-editor`

### Added

- **Input Prompter** (`suggest` plugin): multi-provider completion framework — multiple `CompletionProvider` instances share a single popup UI, supports `[[` wiki-link, `#` tag, `/` command, or any custom trigger
- **Microkernel architecture**: kernel reduced to ~180 lines, all features implemented as independent plugins
- All 18 built-in plugins exported for advanced composition; `CompletionProvider` type exported for custom provider authoring
- **18 built-in plugins**: each feature is an `EditorPlugin` with `id`, `deps`, `install`, `uninstall`

### Changed

- `kernel.ts` reduced from ~882 lines (monolithic) to ~180 lines (pure lifecycle + registry)
- Default plugin set loaded based on `EditorOptions` (conditional: fold, line-numbers, indent-guide, close-brackets)

### Removed

- `src/extensions.ts` (hardcoded extension assembly — replaced by plugin system)
- `src/suggest.ts`, `src/link-handler.ts`, `src/attachment.ts` (replaced by plugins)
