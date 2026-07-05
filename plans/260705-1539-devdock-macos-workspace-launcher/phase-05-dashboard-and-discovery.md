---
phase: 5
title: Dashboard and Discovery
status: completed
effort: M
---

# Phase 5: Dashboard and Discovery

## Overview

The home surface: a grid of workspace cards with one-click launch, plus discovery — search, favorites, recent, and tag filtering — and live launch progress feedback consuming the Phase 3 events. This turns the app from "configurable" into a daily-driver dashboard.

**Depends on:** Phase 2 (data), Phase 3 (launch + progress events), Phase 4 (create/edit entry points). **Blocks:** none (Phase 7 polishes it).

## Requirements

- **Functional:** workspace cards (icon, accent, name, tags, quick-launch); search by name/path/tags; favorites toggle + filter; recent list ordered by `last_launched`; tag filter; launch-progress UI (per-step statuses, partial-restore + retry). Empty/loading/error states.
- **Non-functional:** instant search/filter (in-memory over tens of workspaces); smooth grid; launch feedback is non-blocking (dashboard stays usable during a restore).

## Architecture

- **Dashboard feature** (`features/dashboard/`): `dashboard.tsx` (layout + grid), `workspace-card.tsx`, `search-bar.tsx`, `filter-bar.tsx` (favorites/tags), `recent-strip.tsx`, `empty-state.tsx`.
- **Launch feedback** (`features/launch/`): `launch-progress.tsx` (drawer/sheet listing steps from `launch-store`), `launch-summary.tsx` (partial-restore result + per-step retry via Phase 3 `retry_step`).
- **Discovery state:** derived in-memory from the Zustand `workspace-store` (search text + active filters → filtered list). Favorites + recents **index** persisted in `tauri-plugin-store` (not in workspace JSON), keyed by workspace id; `last_launched` also lives in workspace `metadata` from Phase 3.
- **Quick launch:** card button → `launch_workspace(id)`; `launch-store` tracks the active run (by `run_id`) and per-step status from the event stream. **Launches are single-active (decided in P3):** while a run is in-flight, launch buttons are disabled/show "a launch is in progress"; a second request is rejected by the backend. This is a UI-presentation detail now, not an open backend question.

## Related Code Files

- Create (TS): `src/features/dashboard/{dashboard,workspace-card,search-bar,filter-bar,recent-strip,empty-state}.tsx`
- Create (TS): `src/features/launch/{launch-progress,launch-summary}.tsx`
- Create (TS): `src/hooks/use-workspace-filters.ts` (search + favorites + tags derivation), `src/store/discovery-store.ts` (favorites/recents index via store plugin)
- Modify (TS): `src/store/launch-store.ts` (active run + per-step state, retry), `src/App.tsx` (dashboard as home route)
- Modify (ACL): none new (store + shell already granted)
- Create (tests): `src/hooks/__tests__/use-workspace-filters.test.ts`, `src/features/dashboard/__tests__/workspace-card.test.tsx`

## Implementation Steps

1. **Card + grid:** `workspace-card.tsx` (icon, accent border, name, tag chips, quick-launch + overflow menu → edit/duplicate/delete); `dashboard.tsx` responsive grid.
2. **Search:** `search-bar.tsx` + `use-workspace-filters.ts` filtering by name/path/tags (case-insensitive, in-memory).
3. **Favorites:** toggle on card → `discovery-store` (persisted index); favorites filter in `filter-bar.tsx`.
4. **Recent:** `recent-strip.tsx` ordered by `metadata.last_launched` desc (updated by Phase 3 on each launch).
5. **Tags:** tag chips from the union of workspace tags; multi-select filter; AND/OR semantics documented (default: match any).
6. **Launch progress:** subscribe to `launch:progress`/`launch:done`; render a progress sheet with per-step status icons; on partial restore, show `launch-summary` with retry buttons wired to `retry_step`.
7. **Empty/loading/error:** first-run empty state with "Create your first workspace" CTA → Phase 4 editor; skeletons while `list_workspaces` loads; error toast on failure.
8. **Tests:** filter derivation (search/favorites/tags), card renders availability + triggers launch.

## Success Criteria

- [ ] All workspaces render as cards; quick-launch starts a restore and shows live per-step progress.
- [ ] Search narrows by name/path/tags instantly; favorites toggle persists and filters; recent reflects last launch order.
- [ ] Tag filtering works and combines with search.
- [ ] A partial restore surfaces which steps failed and lets the user retry a single step without relaunching everything.
- [ ] First-run shows an empty state that routes to the Phase 4 editor; loading + error states render.
- [ ] Filter tests and card test pass.

## Risk Assessment

- **Two sources for "recent"/favorites (store index vs workspace metadata) drifting (MEDIUM).** Mitigation: `last_launched` is authoritative in workspace `metadata`; the store index holds only favorites + a denormalized recents cache rebuilt from metadata on load.
- **Concurrent launches confusing progress UI (LOW — resolved).** Mitigation: single-active is enforced in P3; `launch-store` scopes state by `run_id`; UI disables launch while a run is active.
- **Search/filter perf at scale (LOW for v1).** Mitigation: in-memory is fine for tens–low hundreds; note virtualization as a future step if counts grow.
