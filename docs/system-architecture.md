# DevDock — System Architecture

Native macOS app that restores an entire developer workspace (IDE, terminals, AI
tools, apps, browser URLs) with one click. Local-first; no backend server.

Full phased plan: [`plans/260705-1539-devdock-macos-workspace-launcher/plan.md`](../plans/260705-1539-devdock-macos-workspace-launcher/plan.md).

## Stack

- **Desktop:** Tauri v2 + Rust
- **Frontend:** React 19 + TypeScript + Vite; Tailwind CSS v4 (`@tailwindcss/vite`, no config file); shadcn/ui-compatible components; Zustand; React Hook Form + Zod; Motion; TanStack Query
- **Storage:** JSON files, one per workspace, in the app config dir. **No SQLite.**

## Key decisions

1. **Rust owns the source of truth.** Workspace configs live at
   `~/Library/Application Support/com.devdock.app/workspaces/<id>.json`, read/written
   by `#[tauri::command]` handlers (serde + atomic writes). The frontend never
   writes config files directly.
2. **Zustand mirrors Rust** as the view/cache. `tauri-plugin-store` holds only
   app settings (theme, window, recents index) — never workspace configs.
3. **The launch engine runs entirely in Rust** (async, `tokio`). This contains the
   macOS TCC/Automation permission scope to one process and centralizes shell
   escaping + the fine-grained shell ACL. The frontend invokes a command and
   subscribes to progress **events**.
4. **Tauri v2 capabilities/ACL** (`src-tauri/capabilities/*.json`) gate every
   permission (default-deny). `osascript` cannot be argument-constrained, so the
   audited two-layer escaping in `escape.rs` is the boundary for the terminal path.
5. **Terminal tiers:** iTerm2 + Terminal.app get full AppleScript automation;
   Warp is launch-only (no scripting API).

## Data flow

```
React UI ──invoke()──▶ #[tauri::command] (Rust)
  │  Zustand (view)        │  serde read/write ▶ app_config_dir/workspaces/*.json
  │                        │  launch orchestrator (tokio) ▶ open / osascript / docker …
  ◀──── event listener ──── emit("launch:progress", …) ◀ per-step status
```

## Layout

```
src/                  React 19 frontend
  components/ui/       shadcn/ui-compatible primitives
  components/          app components (app-shell, theme-provider, theme-toggle)
  features/            dashboard, workspace-config, launch (added in later phases)
  hooks/  lib/  store/  types/
src-tauri/            Rust backend
  src/                 lib.rs (entry + plugins + tracing), main.rs
  capabilities/        ACL (default.json)
  tauri.conf.json  Cargo.toml
.github/workflows/    CI (frontend typecheck+build, Rust fmt+clippy+check)
```

## Status

Phases 1–4 complete: scaffold + theming; the workspace JSON storage layer; the
launch engine (Rust orchestrator + audited two-layer AppleScript→shell escaping +
PATH hydration + tool detection + single-active runs + progress events); and the
workspace configuration UI (RHF+Zod editor, folder picker, availability chips,
create/edit/duplicate/delete/launch); and the dashboard (workspace cards, search,
favorites, name/recent sort, tag filter, and per-step launch retry); and hooks +
environment variables (before/after-launch + before-close hooks run by the Rust
orchestrator with per-hook timeouts + halt/continue policy; env-var injection;
config UI); and polish (Motion + reduced-motion, ⌘N/⌘F/Esc shortcuts, launch
notifications, lazy-loaded editor), a Playwright smoke harness, a signed-release
GitHub Actions workflow, and FAQ/changelog docs.

**All 7 Core-v1 phases are complete.** Remaining manual/external items: an Apple
Developer ID for notarized distribution (the release workflow is ready and just
needs signing secrets); running the Playwright smoke (needs `playwright install`;
React-layer only); and measuring the cold-start budget on-device. See the plan
for phase details and the red-team review log.
