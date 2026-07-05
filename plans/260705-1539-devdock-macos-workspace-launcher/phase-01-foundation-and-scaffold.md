---
phase: 1
title: Foundation and Scaffold
status: completed
effort: M
---

# Phase 1: Foundation and Scaffold

## Overview

Stand up the DevDock project: a Tauri v2 + React 19 + Vite + pnpm app, with Tailwind v4 + shadcn/ui + light/dark/system theming, the base plugin/capabilities setup, logging, the target folder structure, and CI. Ends with a themed empty app that runs via `pnpm tauri dev`.

**Depends on:** none. **Blocks:** all subsequent phases.

## Requirements

- **Functional:** app builds and runs on macOS; a themed shell renders (sidebar/header + empty content area); theme can be toggled light/dark/system and persists.
- **Non-functional:** clean `cargo check` and `tsc --noEmit`; CI runs lint + typecheck + `cargo check` + build on push; cold start groundwork toward the < 1s target.

## Architecture

- **Frontend:** React 19 + Vite; Tailwind v4 through `@tailwindcss/vite` (no PostCSS, no `tailwind.config.js`); shadcn/ui `new-york`; `@` path alias → `src/`.
- **Backend:** Tauri v2; plugins registered in `lib.rs` builder; permissions declared in `src-tauri/capabilities/default.json` (NOT `tauri.conf.json`).
- **Theming:** shadcn CSS variables in `src/index.css`; `.dark` class toggled on `document.documentElement`; "system" mode follows `prefers-color-scheme`. Persist choice via `tauri-plugin-store` (app settings only).
- **Logging:** `tracing` + `tracing-subscriber` initialized in Rust entrypoint.

## Related Code Files

- Create (scaffold): `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create (Tauri): `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/build.rs`
- Create (app): `src/components/ui/` (shadcn), `src/components/theme-provider.tsx`, `src/components/app-shell.tsx`, `src/lib/utils.ts` (`cn`), `src/store/settings-store.ts`
- Create (CI): `.github/workflows/ci.yml`
- Create (docs): `docs/system-architecture.md` (seed from plan), `.gitignore` additions (`target/`, `dist/`, `node_modules/`)

## Implementation Steps

1. **Scaffold.** Use exactly **one** command (red-team H1 — the research reports show divergent forms; this is the canonical one, ignore the others):
   ```bash
   pnpm create tauri-app@latest . --template react-ts --manager pnpm
   # identifier: com.devdock.app | product: DevDock | window title: DevDock
   ```
   The repo is non-empty (`README.md`, `rawplan.md`, `.git`, `plans/`). **If the CLI refuses the `.` target** (its non-empty-dir behavior is not documented upstream — verify empirically first): scaffold into a sibling `../devdocks-scaffold`, then `rsync -a --ignore-existing ../devdocks-scaffold/ ./` and reconcile `.gitignore` + `package.json`, **preserving `README.md`, `rawplan.md`, `plans/`, and `.git`**. Verify `src/` (frontend) and `src-tauri/` (Rust) layout; confirm `pnpm tauri dev` opens a window.
2. **Tailwind v4:** `pnpm add -D tailwindcss @tailwindcss/vite`; add `tailwindcss()` to `vite.config.ts` plugins; replace `src/index.css` contents with `@import "tailwindcss";`. Add `@` alias in `vite.config.ts` + `tsconfig.json`.
3. **shadcn/ui:** `pnpm dlx shadcn@latest init` (style `new-york`, base color neutral, dark mode = class, CSS vars). Add starter primitives: `pnpm dlx shadcn@latest add button card dialog input select switch dropdown-menu tooltip`. **Note:** package is `shadcn` (the old `shadcn-ui` is deprecated).
4. **Core libs:** `pnpm add zustand react-hook-form zod @hookform/resolvers motion clsx tailwind-merge lucide-react @tanstack/react-query`.
5. **Reorganize `src/`** into `components/ components/ui/ features/ hooks/ lib/ store/ types/` (nested under `src/`, reconciling rawplan's top-level list).
6. **Theme provider:** implement `theme-provider.tsx` (light/dark/system, toggles `.dark`, listens to `prefers-color-scheme`), persist selection in `settings-store.ts` (Zustand) backed by `tauri-plugin-store`.
7. **App shell:** `app-shell.tsx` with sidebar + header + empty content region; wire `ThemeProvider` + a `QueryClientProvider` in `App.tsx`.
8. **Tauri plugins + capabilities:** add `tauri-plugin-store` (settings) — install via `pnpm tauri add store` (adds crate + JS pkg + permission). Create `capabilities/default.json` with `store:default` (plus `core:default`). Other plugins (fs, dialog, notification, shell, opener) are added in the phases that use them, to keep ACL minimal.
9. **Logging:** initialize `tracing_subscriber` in `src-tauri/src/lib.rs` `run()`. Establish the redaction convention now (used from P3/P6): secret-bearing values (env var values) use a `Secret(String)` newtype whose `Debug`/`Display` renders `***`, so no `tracing` call can leak them regardless of module — a type-level invariant, not a per-call discipline.
10. **CI:** `.github/workflows/ci.yml` — macOS runner; steps: pnpm install, `pnpm lint`, `tsc --noEmit`, `pnpm -C src-tauri` → `cargo fmt --check` + `cargo clippy` + `cargo check`, `pnpm tauri build --debug` (smoke). Cache pnpm store + cargo registry/target.
11. **Docs:** seed `docs/system-architecture.md` from the plan's architecture + data-flow sections.

## Success Criteria

- [ ] `pnpm tauri dev` opens a DevDock window rendering the themed app shell.
- [ ] Theme toggle switches light/dark/system live and persists across restarts.
- [ ] `tsc --noEmit` and `cargo check` pass with no errors; `cargo clippy` clean.
- [ ] Tailwind v4 utilities and a shadcn `Button`/`Card` render correctly (no PostCSS/config-file setup present).
- [ ] `capabilities/default.json` exists and contains only the minimal permissions needed so far.
- [ ] CI workflow runs green on push.

## Risk Assessment

- **Tauri v2 vs v1 confusion in tooling/tutorials.** Mitigation: verify every permission identifier and plugin API against `v2.tauri.app`; do not copy v1 `tauri::api::*` patterns.
- **Scaffolding into a non-empty dir** (`README.md` present). Mitigation: use `.` target; if the CLI refuses, scaffold in a temp dir and move files in, preserving `README.md` and git history.
- **Tailwind v4 / shadcn version skew.** Mitigation: pin versions in `package.json` once verified in dev; smoke-test dark mode immediately.
