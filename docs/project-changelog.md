# DevDock Changelog

## v0.2.0 — unreleased (Menu Bar + Brand Refresh)

- **Menu bar extra** — a tray icon opens a lean webview **popover** with search +
  recent-first quick-launch (keyboard ↑/↓/⏎/esc, auto-hides on focus loss).
  Left-click toggles the popover; right-click shows Open / Quit.
- **Close-to-menu-bar** — closing the main window hides it (the app keeps running
  in the menu bar); ⌘Q or the tray "Quit" fully exits. Single-instance: a second
  launch focuses the running app.
- **Cross-window sync** — the backend broadcasts `workspaces:changed` (on
  save/delete/duplicate and after a launch) so the main window and popover stay
  consistent.
- **New logo** — a refined "Stacked" boxes/dock mark on an Indigo brand,
  generated from committed SVG sources into the app icon set + a monochrome
  menu-bar template icon (`pnpm icons:build`).
- **UI refresh** — Indigo brand token + surface/elevation applied app-wide
  (primary buttons, cards, active nav, filters, focus rings); the neutral hover
  token is unchanged.
- **UI/UX elevation (Pro Max)** — a design-token system (elevation, semantic
  state colors, motion, typography) plus an elevated component kit (loading
  buttons, styled select, in-app dialogs, toasts, color-swatch input). The
  dashboard now groups **Favorites / Recent / All** with a segmented sort,
  tool-stack icons, per-card launch state, and skeleton loading. The workspace
  editor gains a sticky action bar, collapsible sections, on-blur validation
  with an accessible error summary, and Undo on row removal. Native `confirm()`
  dialogs are replaced by in-app dialogs; motion is centralized and
  reduced-motion-safe throughout.
- **Native macOS chrome** — the main window uses an overlay titlebar (hidden
  title, native traffic lights) with NSVisualEffectView **vibrancy** on both the
  main window and the tray popover (translucent surfaces over the native
  material, with a readable solid fallback). Requires Developer-ID distribution
  (uses `macOSPrivateApi`) — not Mac App Store eligible.

### Known limitations (this release)

- **Dock-click reopen** isn't wired yet (Tauri v2 has no reopen event) — reopen
  from the tray **Open DevDock**.
- Popover favorites are deferred (recent-first only).
- **Vibrancy** now ships (main window + popover). It uses Apple's private API,
  so builds are **Developer-ID-only** (not Mac App Store eligible); needs a
  visual pass on a real display across light/dark and older macOS versions.

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
