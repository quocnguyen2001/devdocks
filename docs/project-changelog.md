# DevDock Changelog

## v0.2.0 — unreleased (Menu Bar + Brand Refresh)

- **UI polish pass (UI-only)** — a round of targeted refinements on top of the
  Linear redesign, addressing direct user feedback:
  - **Applied type scale** — the documented SF-Pro scale is now real utility
    classes (display / section / card-title / body / label / mono) with tuned
    tracking and line-heights; the native system stack is kept (no bundled font).
    Dashboard section headers, workspace-card titles/paths, and popover rows adopt
    it; paths render in a tabular mono for alignment.
  - **Smooth collapsible sections** — expand/collapse now animates height + fade
    (~200ms, reduced-motion → instant) instead of snapping open; the section
    overflow was moved onto the animating panel so it no longer clips overlays.
  - **Full-width workspace editor** — the create/edit screen fills the window
    (`max-w-5xl`), header, scroll body, and action bar sharing one container.
  - **Accent color picker fixed** — the picker now renders through a portal,
    anchored below the field, staying fully visible even when the form scrolls
    (previously clipped by the section/scroll container); closes on
    outside-click / Escape / scroll / resize.
  - **App picker with logos** — AI-tools and applications are chosen from a tile
    grid showing per-app logos (bundled brand SVGs for common apps: VS Code, Zed,
    iTerm2, Terminal, Docker, Postman, Chrome, Safari, Arc, TablePlus, DBeaver,
    Redis Insight, Claude) with a colored-monogram fallback for the rest;
    multi-select, keyboard-accessible, availability-annotated. Selection data is
    unchanged.
  - **Even popover corners** — the tray popover's square native window shadow is
    disabled (`shadow: false`) so the rounded panel reads with even corners over
    the vibrancy material; the panel keeps its own soft shadow.
  - **In-app version badge** — the app version is defined once (from
    `package.json`, injected at build time) and stamped in the sidebar footer;
    `package.json`, `tauri.conf.json`, and `Cargo.toml` bumped to `0.2.0`.

- **Linear-style redesign (UI-only)** — the whole app moves to a Linear.app-
  inspired visual language: a cool-neutral OKLCH surface ladder (dark-primary,
  full light mode with white cards on a gray canvas), hairline border-first
  elevation (resting card shadows removed; soft shadows only on dialogs/popover/
  toasts), larger container radii (cards/dialogs/popover 14px, panels/toasts
  12px, controls 8px), a single indigo accent for CTA/selection/focus (deepened
  so white button labels meet WCAG AA 4.5:1, incl. the destructive Delete),
  brand-tinted text selection, a 200ms dialog fade+scale entrance, motion
  timings unified to 150–250ms, one app-wide focus-ring recipe (added to the
  popover footer buttons), and a brand left edge on the active nav item. The
  popover now re-syncs its theme when shown (an in-app theme change no longer
  leaves the tray popover stale) and its native vibrancy is clipped to the
  panel's rounded corners. Icons stay Lucide defaults; scrollbars stay native
  macOS overlay. No behavior, IPC, schema, or routing changes.
  - *Documented exceptions:* the favorite star uses the amber semantic token
    (`--warning`) — an intentional second hue so "favorite" reads distinct from
    "selected"; muted secondary text over vibrancy can dip toward the AA
    boundary depending on the desktop behind the window (accepted Linear-style
    trade-off; solid-surface pairs measure ≥ 4.5:1).

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
