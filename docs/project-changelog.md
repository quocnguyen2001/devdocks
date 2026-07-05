# DevDock Changelog

## v0.1.0 — unreleased (Core v1)

First functional release: restore a developer workspace with one click.

- **Foundation** — Tauri v2 + React 19 + Vite + Tailwind v4 + shadcn-style UI; light/dark/system theming; CI.
- **Storage** — JSON files per workspace (Rust-owned source of truth, atomic writes, schema versioning); Zod-mirrored types.
- **Launch engine** — ordered launch of IDE, terminals (iTerm2/Terminal.app full automation; Warp launch-only), additional apps, AI tools, and browser URLs, with Docker start-and-wait; single-active runs; live progress + per-step retry; audited two-layer AppleScript→shell escaping; login-shell PATH hydration; lazy macOS Automation (TCC) handling.
- **Configuration UI** — create/edit/duplicate/delete workspaces; folder picker; availability-annotated tool selection.
- **Dashboard** — workspace cards, search, favorites, name/recent sort, tag filter.
- **Hooks & env** — before/after-launch + best-effort before-close hooks (per-hook timeout + halt/continue policy); workspace environment-variable injection.
- **Polish** — Motion transitions + reduced-motion, keyboard shortcuts (⌘N / ⌘F / Esc), launch-complete notifications, lazy-loaded editor.

### Known limitations

- Warp can't auto-run a cwd/command (no scripting API) — launch-only.
- Before-close hooks are best-effort on graceful quit; not guaranteed on force-quit, crash, or logout.
- A notarized, Gatekeeper-clean distribution requires an Apple Developer ID; without it the build is unsigned.
- Custom `startup_sequence` ordering is stored but not yet applied (canonical launch order is used).
