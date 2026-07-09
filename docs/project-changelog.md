# DevDock Changelog

## v0.2.0 — unreleased (Menu Bar + Brand Refresh)

- **Workflow editor & settings fixes (UI + one native command)** — a follow-up
  polish pass addressing direct feedback on the workflows editor and Settings:
  - **Consistent Settings width** — the Settings screen now shares the `max-w-4xl`
    content measure of the Workspaces and Workflows lists instead of the narrower
    `max-w-2xl` it used before.
  - **Fixed step drag-and-drop** — dragging a step no longer clips/hides the card
    mid-drag (the row's `overflow-hidden` was cutting off the drag transform). A
    `DragOverlay` clone now carries the dragged card, an 8px pointer activation
    distance stops accidental drags, and only **collapsed** cards are draggable
    (an expanded card's grip is disabled) — reordering is smooth again.
  - **"Open app" is now a searchable picker** — the plain app-name field is
    replaced by a popover listing installed apps with their **real macOS icons**
    and a search box; a custom (non-installed) name can still be typed. Icons are
    extracted on demand by a new `app_icon` Tauri command (NSWorkspace → PNG →
    base64, cached, run off the UI thread) with a monogram fallback.
  - **Roomier form fields** — label→control spacing bumped from 6px to 8px across
    the workspace and workflow editors.

- **Workflows (sequential macro automation)** — a new top-level feature: build an
  ordered, drag + keyboard-reorderable list of steps DevDock runs one after
  another. A step is one of four kinds — `launchWorkspace` (run an existing
  workspace), `openApp` (open a macOS app), `runScript` (a shell command with a
  timeout), or `delay` (wait N ms) — each with a per-step halt/continue failure
  policy and an enable/disable toggle. Running a workflow returns immediately
  and streams live per-step progress plus a terminal summary, so a run started
  from **any** window — including the menu-bar popover's quick-run — is
  observable and **cancellable** from the main window (an in-flight script is
  killed). The engine reuses the existing launch primitives rather than
  forking a parallel one, so a workspace launch and a workflow run cannot run
  at the same time. Each run leaves a coarse last-run status on the workflow,
  shown on the list and in the popover.
  - *Known v1 limitations:* no node-graph/parallel/conditional steps, no
    scheduling, no workflow-calls-workflow, no per-run persistent logs (exit
    status only — no captured stdout/stderr), no import/export, no per-step
    retry. A cancelled/quit `runScript` kills the direct shell child only —
    grandchild processes are not process-group killed (documented; future
    work).

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
  - **App picker with logos, everywhere** — IDE, terminals, AI-tools, and
    applications are all chosen from logo tiles: IDE and per-terminal app are
    single-select pills, AI-tools/apps are a multi-select grid. Icons are **real
    downloaded brand logos** (19 apps, sourced from the dashboard-icons / svgl
    sets) shown on a light plate so they stay legible in both themes; a colored
    monogram is the fallback for apps with no upstream SVG (iTerm2, TablePlus,
    DBeaver, Bruno, …). Keyboard-accessible, availability-annotated; the
    workspace data model is unchanged.
  - **Smoother interactions** — tiles give press + spring-in selection feedback,
    and terminal / browser-URL rows animate in and out when added or removed
    (all reduced-motion aware).
  - **Even popover corners** — the tray popover's square native window shadow is
    disabled (`shadow: false`) so the rounded panel reads with even corners over
    the vibrancy material; the panel keeps its own soft shadow.
  - **In-app version badge** — the app version is defined once (from
    `package.json`, injected at build time) and stamped in the sidebar footer;
    `package.json`, `tauri.conf.json`, and `Cargo.toml` bumped to `0.2.0`.
  - **Settings screen** — a new sidebar section for app preferences: theme
    (light / dark / system), **font** — pick **any font installed on the Mac**
    (enumerated by a Rust `list_system_fonts` command; System = SF Pro; no
    bundled webfonts), **interface size** (Compact / Default / Comfortable, a
    whole-UI zoom), and **Launch at login** (a macOS LaunchAgent via
    `tauri-plugin-autostart`). Preferences persist via the settings store; an
    About block shows the version and a reset-appearance action.
  - **Skeleton loading** — a shared `Skeleton` primitive; the lazy workspace
    editor now shows a form-shaped skeleton instead of a "Loading…" line, and the
    dashboard cards reuse the same primitive.
  - **Sidebar nav** — the active item is a clean filled pill (the blue left
    edge-border was removed).
  - **Menu-bar popover as a grid** — the tray quick-launcher moves from a list
    to a compact two-column grid of accent-avatar tiles with smaller type;
    arrow keys navigate in 2-D (←/→ and ↑/↓), Enter launches, Esc closes.

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
