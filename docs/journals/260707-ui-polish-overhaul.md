# UI Polish Overhaul Landed — Red Team Caught Three Fixes That Would Have Broken

**Date**: 2026-07-07 01:10
**Severity**: Medium (three would-be-broken fixes caught pre-code)
**Component**: Editor layout, color picker, collapsible motion, app picker, popover, type scale, version wiring
**Status**: Resolved

## What Happened

Shipped a 6-phase, presentation-only polish round on top of the Linear redesign, closing nine concrete
user-feedback items: full-width editor, portaled accent color picker, smooth collapsible motion, a new
tile-based app picker with per-app logos, even popover corners, an applied SF-Pro type scale, dashboard
spacing rhythm, and a build-time version badge in the sidebar. All gates green — tsc, vite build, vitest
25/25, Playwright e2e 1/1, code review with zero blockers. No new npm deps; no store/IPC/schema/launch
changes.

## The Brutal Truth

The `--hard` red team earned its cost three times over — every one of its blockers was a fix that looked
correct on paper and would have failed in practice:

1. **The color-picker fix was wrong.** The plan reasoned that removing `overflow-hidden` from the
   collapsible section would un-clip the picker. It wouldn't: the picker lives inside the editor's
   `overflow-y-auto` scroll container, and `overflow-y: auto` forces `overflow-x` to compute to `auto`
   too, clipping absolutely-positioned descendants on both axes. The "No portal needed (KISS)" line was
   unsupported. Fix: portal to `document.body` with `fixed` positioning from `getBoundingClientRect()`.
2. **The app-icon IDs were fictional.** Plan and design report used `docker`, `redis`, `claude`; the real
   catalog has `docker-desktop`, `redis-insight`, `claude-desktop`/`claude-code`. Every mismatched tile
   would have silently fallen back to a monogram — a logo feature that quietly shows no logos.
3. **The version wiring would break `tsc`.** `import pkg from "./package.json"` in `vite.config.ts` fails
   because `tsconfig.node.json` (which covers the config) lacks `resolveJsonModule`, and `pnpm build`
   runs `tsc && vite build`. Fix: read via `node:fs`.

None of these would have surfaced in unit tests. All three were caught by reading the real code before
writing any.

## Technical Details

**Design report was a trap.** The researcher's copy-pasteable snippets contained `role="radio"` +
`disabled={notFound}` (wrong for multi-select), `img.onError → replaceWith(<JSX>)` (invalid — can't pass
a React element to a DOM API), a 5-category grid that didn't match the two actual `ToolChips` call sites,
and `/app-icons/*.svg` public paths. The plan corrected all of these in prose and marked the report
superseded, so the implementer followed the plan, not the report. Corrected approach: `aria-pressed`
tiles keyed by real ids, monogram fallback via `useState` onError flip, imported+fingerprinted SVG assets.

**Collapsible motion.** `{open && <div>}` (instant mount) → `AnimatePresence initial={false}` +
`motion.div` animating `height: 0 ↔ "auto"` with the `overflow-hidden` clip moved onto the animating box
so the section root can host overflowing children. Reduced-motion collapses `duration` to 0.

**Popover corners.** The "uneven border-radius" was the square native window drop-shadow around a
rounded DOM panel, not the panel itself. One config flag — `"shadow": false` on the popover window — over
any DOM change. The Tauri v2 `WindowConfig` key was verified real before adoption.

**Version.** `__APP_VERSION__` injected via a Vite `define` reading `package.json` with `node:fs`, typed
in `vite-env.d.ts`, rendered mono/tabular in the sidebar footer; all three manifests bumped to 0.2.0.

## Process

Completed the pre-existing stub plan (`260707-0021-ui-polish-overhaul`) rather than spawning a duplicate,
and closed a scope gap the stub missed (the app-picker-with-logos ask was absent from the traceability
table). Delegated the large Phase 2 (editor + app picker + 13 brand SVGs) to a subagent while
implementing dashboard, popover, and version wiring in parallel — clean file ownership, no conflicts.

## Lessons

- **Verify IDs against the source of truth, not the design doc.** The catalog ids were one grep away;
  the plan trusted the report's approximations.
- **A design report's "copy-pasteable" code is the most dangerous artifact in the plan** — an implementer
  will grab it verbatim. Mark superseded reports explicitly and embed the corrected snippet inline.
- **`overflow-y: auto` clips on both axes.** Any "just remove the overflow" fix for a clipped popover
  should default to a portal unless the ancestor chain is proven clean.

## Follow-ups

- Visual QA pending on a real macOS display: light/dark, logo-tile fidelity, popover corners over
  vibrancy, portaled picker near the viewport edge. Automated gates can't see rendered vibrancy.
- Cursor ships as a monogram (no simple distinctive mark); revisit if a clean SVG is sourced.
- Three manifests hold the version independently; a sync check was left out of scope (YAGNI).
