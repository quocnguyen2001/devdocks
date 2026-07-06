---
phase: 7
title: Polish Accessibility and Release
status: completed
effort: L
---

# Phase 7: Polish, Accessibility and Release

## Overview

Turn a functionally complete app into a shippable one: motion polish, keyboard/accessibility support, performance measured against a < 1s startup **budget**, a consolidated test sweep, and a signed + notarized macOS build produced by a GitHub Actions release workflow.

**Depends on:** Phases 1–6. **Blocks:** none (final phase). **Milestone: shippable v1.**

## Requirements

- **Functional:** page/card/hover transitions and micro-interactions via Motion; full keyboard navigation + shortcuts; focus states; light/dark/system + high-contrast friendliness; launch-complete notifications; session metadata finalized; E2E smoke of the core flow; a downloadable signed/notarized artifact.
- **Non-functional:** cold start measured against a < 1s budget on Apple Silicon (flag regressions, not a hard gate); smooth scrolling; `prefers-reduced-motion` respected; CI enforces the full test suite before release.

## Architecture

- **Animation:** Motion for route transitions, card enter/hover, and launch-progress step transitions; a `reduced-motion` guard disables non-essential animation.
- **Accessibility:** shadcn/Radix primitives give baseline ARIA/focus; add app-level shortcuts (create, search focus, launch selected), a visible focus ring, and roving focus in the card grid.
- **Performance:** lazy-load heavy features (editor, launch sheet) via `React.lazy`/Suspense; keep the initial bundle lean; measure startup; ensure Rust does no heavy work on boot (workspaces load on demand per Phase 2).
- **Testing:** Vitest (components/hooks), Rust `#[cfg(test)]` (models, escaping, orchestrator, hooks), Playwright **smoke** driving the **Vite web UI on `http://localhost:5173` via `pnpm dev`** — NOT `tauri dev`/port 1430 (that port needs `tauri-driver`+WebdriverIO, and the research report's `1430`+`tauri dev` config connects to nothing; red-team M4). This tests the React layer only; native shell/dialogs/TCC are manual-QA. True native E2E (`tauri-driver`) is out of scope for v1.
- **Release:** `tauri build` → `.app`/`.dmg`; code-sign with Developer ID + `notarytool` notarization + staple; GitHub Actions release workflow on tag.

## Related Code Files

- Create (TS): `src/lib/motion.ts` (shared variants + reduced-motion helper), `src/hooks/use-keyboard-shortcuts.ts`, `src/hooks/use-reduced-motion.ts`
- Modify (TS): feature components (add transitions/focus), `src/App.tsx` (lazy routes, shortcut provider), notification calls on launch done
- Add plugin: `pnpm tauri add notification`; ACL `notification:default`
- Create (CI): `.github/workflows/release.yml` (build + sign + notarize + publish on tag)
- Create (config): `src-tauri/tauri.conf.json` bundle/signing config; app icons under `src-tauri/icons/`
- Create (tests): `e2e/create-and-launch.spec.ts` (Playwright smoke); expand Vitest coverage on dashboard/editor
- Create (docs): `docs/project-changelog.md` (v1 entry), onboarding/FAQ notes (TCC Automation, installing IDE CLIs, Warp limitation)

## Implementation Steps

1. **Motion pass:** shared variants in `motion.ts`; apply to routes, cards (enter/hover), and launch steps; gate with `use-reduced-motion.ts`.
2. **Keyboard + a11y:** `use-keyboard-shortcuts.ts` (⌘N new, ⌘F search, ⏎ launch selected, Esc close); roving focus in the grid; visible focus rings; audit contrast in both themes.
3. **Notifications:** add notification plugin; fire on launch complete / partial restore.
4. **Performance:** lazy-load editor + launch sheet; trim initial bundle; confirm no eager workspace scan on boot. Measure cold start as a **tracked budget, not a hard release gate** (red-team H2): machine = Apple Silicon (record model/RAM), metric = process-spawn → interactive (marked `performance.now()` at first interaction-ready), report p50; flag regressions rather than blocking release (WebView init time is largely outside app control).
5. **Session metadata finalize:** ensure `last_launched` + session summary written reliably (ties Phase 3/5); verify recents accuracy.
6. **Test sweep:** raise Vitest coverage on dashboard/editor/filters; ensure Rust tests cover models/escaping/orchestrator/hooks; add the Playwright smoke spec; wire all into CI as a required gate.
7. **Signing + notarization:** configure `tauri.conf.json` bundle + Developer ID signing; `release.yml` builds on tag, signs, runs `xcrun notarytool submit --wait`, staples, and attaches the `.dmg` to a GitHub Release. Store signing secrets in GH Actions secrets.
8. **Docs:** changelog v1; FAQ covering the macOS Automation prompt, installing `code`/`zed` CLIs, and Warp's launch-only behavior.

## Success Criteria

- [ ] Transitions/micro-interactions feel smooth; `prefers-reduced-motion` disables non-essential animation.
- [ ] Core actions are fully keyboard-operable with visible focus; contrast passes in light and dark.
- [ ] Cold-start p50 measured and recorded on Apple Silicon (spawn→interactive) with the < 1s target tracked as a budget; regressions flagged (not a hard gate); no jank on scroll.
- [ ] Launch completion fires a native notification; recents/last-launched are accurate.
- [ ] Vitest + Rust tests + Playwright smoke (against Vite `5173`) all pass in CI; CI blocks release on unit/Rust failure (flaky native E2E quarantined, not release-blocking).
- [ ] `release.yml` on a tag produces a **signed + notarized** `.dmg` attached to a GitHub Release that opens without Gatekeeper warnings.

## Risk Assessment

- **Notarization/signing setup friction (MEDIUM–HIGH).** Mitigation: needs an Apple Developer ID (see plan Open Question 3); if unavailable, ship ad-hoc/unsigned with documented Gatekeeper-bypass steps and defer notarization.
- **Playwright/WebDriver instability on macOS (MEDIUM).** Mitigation: smoke-only E2E; rely on Vitest + Rust tests + manual QA for native surfaces; don't block release on flaky E2E — quarantine if needed.
- **< 1s startup target slipping (LOW–MEDIUM).** Mitigation: lazy-loading + on-demand data load; measure early; the target is aspirational and can be tracked as a perf budget rather than a hard release gate.
- **Reduced-motion/high-contrast regressions (LOW).** Mitigation: manual pass in both themes + reduced-motion before tagging.
