# Linear-Style UI Redesign Landed—Plan Duplication and Transform Composition Bug Fixed

**Date**: 2026-07-06 20:11
**Severity**: Critical (the hidden bug), Medium (plan duplicate)
**Component**: Design tokens, dialog entrance motion, focus rings, token application
**Status**: Resolved

## What Happened

Shipped a 6-phase UI-only restyle of DevDock into Linear.app aesthetic: neutral surface ladder, hairline borders, single indigo accent, refined motion, WCAG-tuned contrast. All gates green (vitest 25/25, tsc+vite, cargo clippy, Playwright e2e). Two critical issues surfaced in review and discovery.

## The Brutal Truth

The first plan draft restated code already shipped in `260706-1645-ui-ux-elevation-pro-max` (landed hours before) verbatim — phantom work. The red team's delta-audit saved hours of wasted effort by forcing an explicit rewrite: **what changes from HEAD, not what the final state is**. Harder to write, saved the project. Humbling lesson in discipline.

The dialog entrance keyframes bug is the real sting. The code confidently commented "centered via `translate` utilities" while actually carrying `transform: translate(-50%, -50%) scale(…)`. Tailwind v4's `-translate-x/y-1/2` emit the CSS `translate` property, not the `transform` property. They composed **additively**. Result: every dialog rendered half-off-screen for 200ms, snapped into place on scale completion. Invisible under reduced motion (which tests run with). Found only by sampling actual computed `getBoundingClientRect()` mid-animation against the compiled CSS.

## Technical Details

**Plan deduplication:** Red team's critical finding; 15 findings deduplicated and accepted. Examples: radius unification (2 token values), light-ladder fix for white-cards-on-gray-canvas, filled-label WCAG retunes, motion-truth fix (deleted dead `--duration-*` CSS vars; `src/lib/motion.ts` is now single source), popover theme desync fix, vibrancy corner radius, favorite star recolor to `--warning` token.

**Transform composition bug:** Dialog entrance `@keyframes` at [file:line to be verified] used:
```css
@keyframes dialogEnter {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```
Applied to element with `-translate-x-1/2 -translate-y-1/2` (Tailwind v4 → `translate(…)` property, not `transform`). Additively: dialog center + translate property + translate in transform = off-center. Fixed by removing translate from keyframes, keeping scale only. Verified stable center by sampling DOM mid-animation in compiled CSS.

**WCAG contrast:** Dark `--brand` needed L from 0.58→0.56 to hit 4.73:1 white-label ratio.

## What We Tried

Red team audit forced explicit delta planning (concrete `change X → Y at file:line` per phase). Pre-implementation research isolated all 17 files and ~130/−65 line edits. Full test suite run (vitest, TypeScript, Cargo, Playwright). Manual QA sampling of vibrancy/material contrast pending on real display.

## Root Cause Analysis

**Plan duplication:** Planner (myself) read the shipped code, read the requirements, and mistakenly listed the already-delivered state as future work. Oversight in thinking "what does Linear look like?" instead of "what changes from our current code?". No adversarial review until after drafting.

**Transform bug:** Confident comment claimed the opposite of the actual CSS composition model. Assumption that `-translate-` utilities would emit `transform: translate(…)` without checking Tailwind v4's exact output. Test coverage uses `prefers-reduced-motion: reduce`, so the bug was invisible in test runs — only live animation reveals it.

## Lessons Learned

- **Delta-first planning is not optional:** Write work as explicit changes over HEAD, with a "Verify unchanged" checklist per phase. Prevents shipping no-op PRs or duplicating predecessor work. Feels verbose; saves days.
- **CSS property composition rules are not intuitive.** Standalone properties (`translate`, `scale`, `rotate`) compose additively with `transform` in Tailwind v4 and modern CSS. Comments claiming otherwise fail. Verify with computed styles or a live test, not reading.
- **Reduced-motion testing masks entrance/exit bugs.** The test suite runs with reduced motion on, so fade+scale bugs are invisible in CI. Smoke test reduced-motion separately, but sample real animation in the app.
- **Adversarial review saves more than it costs.** The red team's finding (duplicate work) was humbling and forced a better plan. This is a feature, not a bug.

## Next Steps

1. **Manual QA:** vibrancy-material contrast sampling on a real Mac display, OS Reduce Motion toggle, tray popover walk-through. Owner: [session]. ETA: async / confirm before merge to main.
2. **Commit hygiene:** Phase 1–6 are logical; verify conventional commit format (no phase numbers, explain the invariant or behavior change).
3. **Monitor:** No backend/schema/IPC changes; zero risk to feature behavior. Revert via simple commit if new data surfaces.

---

Status: DONE
Summary: Red team forced plan rewrite (delta-first discipline); shipped UI redesign with critical transform-composition bug fixed in dialog entrance—visible only via live animation sampling, not reduced-motion tests.
