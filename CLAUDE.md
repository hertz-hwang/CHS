# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

字劫 (Chars Hijack) - A Vue 3 + TypeScript web application for Chinese character decomposition analysis and input method encoding design. It parses IDS (Ideographic Description Sequence) data to decompose characters into components (字根), manage root encodings, and analyze coverage across character sets.

## Commands

```bash
npm run dev      # Start development server (Vite)
npm run build    # Type check (vue-tsc) and build for production
npm run preview  # Preview production build locally
```

## Architecture

### Core Engine (`src/engine/`)

The business logic is independent of Vue and can be tested standalone:

- **engine.ts** - `CharsHijack` class: Main engine handling character decomposition, root management, coverage analysis, and configuration
- **config.ts** - TOML parsing/export, `UserConfig` types, localStorage persistence
- **ids.ts** - IDS parsing with `IDSNode` tree structure
- **transformer.ts** - IDS transformation rules engine
- **unicode.ts** - Unicode block detection and hex utilities

### State Management (`src/composables/`)

- **useEngine.ts** - Global singleton state using Vue composables pattern. Provides reactive access to the engine, configuration, charsets, and navigation. All components use this composable.

### Data Files (`data/`)

- `sky_ids.txt` - Main IDS decomposition data (SkyIDS format)
- `custom_ids.txt` - Custom IDS overrides
- `stroke.txt` - Stroke count data
- `dictionary.txt` - Pinyin and frequency data
- `gb2312.txt`, `tg8105.txt`, `kc6000.txt`, `cjk.txt`, `all.txt` - Character set definitions

### Component Structure

- `src/components/pages/` - Page-level components (DataPage, CodePage, SplitPage, etc.)
- `src/components/shared/` - Reusable UI components
- `src/App.vue` - Layout with HeaderBar, SideNav, and DetailPanel

## Key Concepts

- **IDS (Ideographic Description Sequence)**: Unicode standard for describing character structure using operators like ⿰ (left-right), ⿱ (top-bottom)
- **字根 (Root)**: Basic components that characters decompose into. Stored in `engine.roots` Set
- **字根编码 (Root Code)**: Each root can have main code (第1码), sub code (第2码), and supplement codes
- **等效字根**: Roots that share the same encoding as a main root
- **归并字根**: Roots whose encoding is copied from another root
- **Coverage**: Percentage of characters in a charset that fully decompose into defined roots

## Configuration Persistence

User configuration (roots, named roots, rules, code rules) is persisted to localStorage as JSON. TOML import/export is supported via `exportConfigToToml()` and `importConfigFromToml()`.

## Path Alias

`@` is aliased to `src/` in vite.config.ts. Use `@/engine/engine` imports.