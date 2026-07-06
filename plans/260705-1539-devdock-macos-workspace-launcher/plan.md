---
title: DevDock — macOS Workspace Launcher (Core v1)
description: >-
  Native macOS (Tauri v2 + Rust + React 19) app that restores an entire
  developer workspace — IDE, terminals, AI tools, apps, browser URLs — with one
  click. JSON-file storage, MVP-first phasing.
status: completed
priority: P1
branch: develop
tags:
  - tauri
  - rust
  - react
  - macos
  - desktop
  - local-first
blockedBy: []
blocks: []
created: '2026-07-05T08:41:43.759Z'
createdBy: 'ck:plan'
source: skill
---

# DevDock — macOS Workspace Launcher (Core v1)

## Overview

DevDock is a native macOS app that restores a developer's entire workspace with one click: it launches the IDE, terminals (with per-terminal working directory + startup command), AI tools, supporting apps (Docker, DB clients, API clients), and browser URLs — in a configurable, ordered sequence.

This plan covers the **full Core Feature set** from `rawplan.md`, phased **MVP-first** so a working one-click launcher exists at the end of **Phase 3**, with configuration breadth, dashboard UX, advanced lifecycle, and release hardening layered on after. Future Roadmap items (menu bar, Raycast, CLI, plugins, cloud sync, team sharing) are **out of scope**.

**Storage decision (locked):** workspace configs are **JSON files, one per workspace**, in the app config dir, with **Rust as the single source of truth**. No SQLite in v1 (deferred as a future option for session history/analytics).

## Scope

**In scope (Core v1):** scaffold + theming; workspace JSON data model + CRUD; the launch engine (IDE / terminals / apps / browser URLs / Docker wait / ordered sequence); full configuration UI; dashboard (search / favorites / recent / tags / quick launch); hooks (before/after launch, before close) + workspace env vars; polish (animation, a11y, perf), tests, and a signed/notarized build with a GitHub Actions release.

**Out of scope (Future Roadmap — deferred):** menu-bar app, Raycast extension, Spotlight integration, `devdock` CLI, workspace templates, Git integration, Docker Compose awareness, SSH workspaces, plugin system, team sharing, cloud sync, SQLite.

## Locked Architecture Decisions

1. **Rust owns the source of truth.** Workspace configs live as `~/Library/Application Support/com.devdock.app/workspaces/<id>.json`, read/written by `#[tauri::command]` handlers using `serde` + atomic writes. The frontend never writes config files directly.
2. **Zustand mirrors Rust** as the frontend view/cache. `tauri-plugin-store` is used **only** for lightweight app settings (theme, window size, recents index) — never for workspace configs.
3. **The launch engine runs entirely in Rust** (async via `tokio`). This contains the macOS TCC/Automation permission scope to a single process and centralizes shell-argument escaping and the shell ACL. The frontend only invokes a command and subscribes to progress **events**.
4. **Tauri v2 capabilities/ACL** (`src-tauri/capabilities/*.json`) gate every plugin permission — default-deny. Shell access is argument-scoped for `open`/`docker`. **Honest caveat (red-team):** whitelisting `osascript` grants arbitrary execution (`do shell script`), so the ACL is *not* the boundary for the terminal path — the audited two-layer escaping in `escape.rs` is the sole control there. Prefer Rust-native checks (`Path::exists`, PATH walk) over `which`/`test` shell calls to shrink the shell surface. Never an unrestricted `sh -c`.
5. **Terminal support tiers:** iTerm2 + Terminal.app get full AppleScript automation (new window, `cd`, run command); **Warp is launch-only** (no scripting API) — surfaced in the UI as a documented limitation, not a bug.
6. **Tailwind CSS v4** via the `@tailwindcss/vite` plugin (`@import "tailwindcss"`, no `tailwind.config.js`); **shadcn/ui** (`new-york`) with `.dark`-class theming for light/dark/system.

## Data Flow

```
React UI ──invoke()──▶ #[tauri::command] (Rust)
  │  Zustand store         │  serde read/write  ▶  ~/Library/Application Support/com.devdock.app/workspaces/*.json
  │  (view cache)          │  launch orchestrator (tokio) ▶ open / osascript / code / docker ...
  ◀──── event listener ──── emit("launch:progress", ...) ◀ per-step status
```

## Target Directory Layout

```text
devdocks/
├── src/                      # React 19 frontend
│   ├── components/ui/        # shadcn/ui primitives
│   ├── components/           # app-specific components
│   ├── features/             # dashboard, workspace-config, launch (feature slices)
│   ├── hooks/                # custom hooks
│   ├── lib/                  # utils (cn, ipc wrappers, zod schemas)
│   ├── store/                # Zustand stores
│   ├── types/                # shared TS types (mirror Rust structs)
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── models/           # serde structs (workspace, config sections)
│   │   ├── commands/         # #[tauri::command] handlers (workspace crud, launch, detect)
│   │   ├── launch/           # orchestrator, launchers (ide, terminal, app, browser, docker), escaping
│   │   ├── storage/          # json read/write, migrations
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── capabilities/         # ACL (default.json + shell scopes)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .github/workflows/        # CI + release
└── docs/
```

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Foundation and Scaffold](./phase-01-foundation-and-scaffold.md) | Completed |
| 2 | [Workspace Data Model and Storage](./phase-02-workspace-data-model-and-storage.md) | Completed |
| 3 | [Launch Engine](./phase-03-launch-engine.md) | Completed |
| 4 | [Workspace Configuration UI](./phase-04-workspace-configuration-ui.md) | Completed |
| 5 | [Dashboard and Discovery](./phase-05-dashboard-and-discovery.md) | Completed |
| 6 | [Hooks and Environment Variables](./phase-06-hooks-and-environment-variables.md) | Completed |
| 7 | [Polish Accessibility and Release](./phase-07-polish-accessibility-and-release.md) | Completed |

> Status column is managed by the `ck plan check/uncheck` CLI — do not hand-edit.

## Phase Milestones & Dependencies

| Phase | Delivers | Depends on | Milestone |
|-------|----------|-----------|-----------|
| 1 | Themed app shell runs via `pnpm tauri dev`; CI green | — | Completed |
| 2 | Workspaces persist round-trip (Rust CRUD + Zustand) | 1 | Completed |
| 3 | Launch of a **dev-seeded** workspace (IDE + iTerm2/Terminal.app terminal + app + URL + Docker start/wait) | 2 | Completed |
| 4 | Full workspace config UI (no hand-editing JSON) | 2, 3 (detect cmd) | Completed |
| 5 | Dashboard: cards, search, favorites, recent, tags, quick-launch w/ live progress | 2, 3, 4 | Completed |
| 6 | Hooks (before/after launch, before close) + workspace env-var injection | 3, 4 | Completed |
| 7 | Motion + a11y + perf; test sweep; signed/notarized build + GH release | all | Completed |

Execution is **sequential** (each phase builds on the prior). Phase 3 is the critical, riskiest path — the launch engine is *proven* there against a dev seed; the product becomes *user-usable* at Phase 4 (create + launch from the UI).

## Acceptance Criteria (v1)

- [ ] App cold-start is measured on Apple Silicon (spawn→interactive) with **< 1s** tracked as a **budget** (not a hard gate — see Phase 7); light/dark/system themes work.
- [ ] A workspace can be created, edited, duplicated, and deleted entirely via the UI; config persists as JSON and survives restart.
- [ ] "Launch" restores a real workspace: opens the configured IDE at the project path, opens each configured terminal at its `cwd` running its `command` (iTerm2/Terminal.app), launches additional apps, opens browser URLs, and waits for Docker when required — in the configured order with per-step delays.
- [ ] A failed step does **not** abort the whole restore; the workspace is marked "partially restored" and the user can retry individual steps.
- [ ] Missing tools are detected before launch and shown as unavailable (no silent failures) — including Homebrew/`/opt/homebrew` CLIs and JetBrains-via-Toolbox apps (PATH-hydration + bundle-id detection); Warp's launch-only limitation is surfaced in the UI.
- [ ] **Security:** user-supplied paths/commands/env cannot inject via the terminal AppleScript path (tested against `` ` ``/`$()`/`;`/`\`/newline), external apps are invoked as argv arrays, and env-var values never appear in logs or session metadata.
- [ ] Before/after-launch and before-close hooks run in order with a per-hook timeout; workspace env vars are injected into launched terminals/commands.
- [ ] Vitest component tests, Rust `#[cfg(test)]` unit tests, and Playwright smoke tests pass in CI; a signed + notarized `.app`/`.dmg` is produced by a GitHub Actions release workflow.

## Cross-Cutting Risks

- **macOS TCC Automation prompt** (first terminal automation) is unavoidable — handle lazily, catch errors, guide the user to System Settings → Privacy → Automation. (Phase 3)
- **Shell/AppleScript injection** via user-supplied paths, commands, hooks, and env values — a single audited escaping/validation utility must gate every external invocation. (Phases 3, 6)
- **Tauri v2 ACL drift** — many online tutorials are v1; permission identifiers must be verified against v2 docs. (Phase 1)
- **Playwright/WebDriver on macOS is limited** — treat E2E as smoke-only; rely on Vitest + Rust tests + manual QA for native surfaces. (Phase 7)
- **JSON schema evolution** — include `schema_version` from day one with an explicit migration path. (Phase 2)

## Research References

- [Tauri v2 macOS launch automation](../reports/researcher-260705-1532-tauri-macos-launch-automation-report.md) — shell/ACL, IDE launch, terminal AppleScript, TCC, orchestration, app detection.
- [Tauri v2 + React 19 + Tailwind v4 scaffold](../reports/researcher-260705-1532-tauri-react-stack-scaffold-report.md) — scaffold, Tailwind v4, shadcn/ui, plugins/capabilities, JSON storage, IPC/state, testing.
- Source: [`rawplan.md`](../../rawplan.md) — product vision, feature list, config example, roadmap.

## Open Questions

**Resolved during red-team (baked into phases):**
- **Concurrency:** launches are **single-active** (reject while in-flight; queueing deferred) — Phase 3/5.
- **Schema case/compat:** `camelCase` keys, `deny_unknown_fields` off, `schema_version` + `migrate()` for compat — Phase 2.
- **Path expansion order:** expand (`~`/relative-to-workspace) → canonicalize → assert `is_dir` → shell-quote — Phase 3.

**Still open (need your input / external facts):**
1. **Apple Developer ID for notarization (Phase 7)** — required for a Gatekeeper-clean distributed build. If unavailable, ship ad-hoc/unsigned with documented bypass steps. *Decide before Phase 7.*
2. **Default terminal when unspecified** — recommend detecting and defaulting to iTerm2 → Terminal.app (never Warp as default, since it can't run cwd+command); confirm during config UX.
3. **Rust→TS type codegen (`ts-rs`/`specta`) now vs. hand-sync + exhaustive fixture** — Phase 2 defaults to hand-sync; reassess if P6's field additions cause drift.

## Red Team Review

Adversarial review by 3 hostile reviewers (security, feasibility/assumptions, failure-modes/scope). Evidence = plan-file/research citations (greenfield — no code to cite). **Raw findings: 4 Critical, 10 High, 8 Medium across the reports; deduped to 20 distinct; all accepted (0 rejected)** — every finding hardened execution without touching the locked scope/storage/architecture decisions.

Reviewer reports:
- [Security adversary](../reports/from-code-reviewer-to-planner-red-team-security-adversary-plan-review-report.md)
- [Assumption & feasibility](../reports/from-code-reviewer-to-planner-red-team-assumption-feasibility-plan-review-report.md)
- [Failure-mode & scope](../reports/from-code-reviewer-to-planner-red-team-failure-scope-plan-review-report.md)

### Accepted findings → where applied

| Theme | Severity | Applied to |
|-------|----------|-----------|
| Two-layer AppleScript→shell escaping contract + injection corpus (not just quote-breakout) | Critical | P3 |
| Warp example un-restorable vs. acceptance criteria (literal-match) | Critical | P2, P4 |
| ACL oversold for `osascript`; `escape.rs` is the sole boundary; prefer Rust-native checks | Critical→ | P3, plan.md |
| macOS spawned-process PATH gap (login-shell PATH hydration) | High | P3 |
| Detection unreliable (`open -a --help` broken; `/Applications`-only) → mdfind/bundle-id + multi-dir + override | High | P3, P4 |
| App/browser name + URL fields unescaped → argv arrays, name allowlist, http(s)-only | High | P3, P4 |
| Docker started (not just waited) + timeout/poll/on-timeout policy in the data model | High | P2, P3 |
| Re-entrant launch → `run_id` + single-active decision (not deferred to P5) | High | P3, P5 |
| `retry_step` semantics → retained resolved run plan keyed by `run_id` | High | P3 |
| Env-secret leakage → `Secret` newtype, exclude from metadata, `export` ≠ secrets-grade | High | P1, P3, P6 |
| `validate_path` → expand→canonicalize→`is_dir`→shell-quote (not char-regex) | High | P3 |
| Missing/moved `path` pre-flight validation + criterion | High | P3 |
| Scaffold: pin one command + concrete non-empty-dir recovery | High | P1 |
| `<1s` gate vs. budget contradiction → tracked budget + method | High | plan.md, P7 |
| Schema drift → `rename_all=camelCase`, `deny_unknown_fields` posture, exhaustive parity test | High | P2 |
| "MVP usable at P3" overstated → "launch engine proven (dev-seeded)"; user-usable at P4 | Medium | plan.md, P3 |
| `before_close` best-effort (`CloseRequested`+`prevent_close`+timeout; not force-quit) | Medium | P6 |
| Distinguish TCC-denied (`errAEEventNotPermitted`/-1743) from generic osascript error | Medium | P3 |
| Playwright port 1430→5173, target Vite via `pnpm dev` | Medium | P7 |

### Whole-Plan Consistency Sweep

Re-read `plan.md` + all 7 phase files after applying findings. Reconciled cross-file contradictions:
- **MVP framing:** relabeled consistently to "launch engine proven (dev-seeded)" at P3 and "user-usable" at P4 in plan.md milestone table, the narrative line, and P3 overview/milestone.
- **Concurrency:** single-active decision propagated to P3 (architecture + criteria), P5 (architecture + risk downgraded to resolved), and the Open Questions list.
- **Schema:** `camelCase` + `deny_unknown_fields`-off reflected in P2 architecture, P2 success criterion (camelCase on-disk), P4 acceptance wording, and the Open Questions.
- **Warp example:** P2 seed + P2/P4 acceptance criteria now decouple storage-shape from launchability; seed uses iTerm2/Terminal.app.
- **`<1s`:** plan.md acceptance criterion and P7 now both say "budget, not gate."
- **ACL/escaping:** plan.md Locked Decision #4 and P3 both state osascript is unconstrainable and `escape.rs` is the boundary.

**No unresolved contradictions remain.** Genuine decisions requiring external input are captured in Open Questions (Apple Developer ID, default terminal UX, codegen-later).
