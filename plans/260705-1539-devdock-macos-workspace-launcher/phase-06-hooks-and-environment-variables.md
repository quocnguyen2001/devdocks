---
phase: 6
title: Hooks and Environment Variables
status: completed
effort: M
---

# Phase 6: Hooks and Environment Variables

## Overview

Advanced lifecycle control: user-defined shell hooks that run Before Launch, After Launch, and Before Close, plus workspace-scoped environment variables injected into launched terminals and commands. This completes the Core Feature set beyond the basic launch flow.

**Depends on:** Phase 3 (orchestrator + escaping), Phase 4 (config UI to extend). **Blocks:** none.

## Requirements

- **Functional:** each workspace can define ordered hook commands for three lifecycle points (before-launch, after-launch, before-close); each hook has a command, optional working directory, timeout, and failure policy (halt vs continue). Workspace env vars (key/value list) are injected into launched terminal sessions and startup commands.
- **Non-functional:** hooks run through the same audited escaping/ACL path as Phase 3; a hung hook is bounded by its timeout; secrets in env values are never logged.

## Architecture

- **Hook execution (Rust):** extend `launch/orchestrator.rs` — run `before_launch` hooks before the tool sequence, `after_launch` hooks after, and register `before_close` hooks to run on app/workspace close. Hooks execute via the fine-grained shell ACL with per-hook `tokio::time::timeout`. Failure policy decides halt-vs-continue (default continue, matching partial-restore semantics).
- **Env injection:** merge workspace env vars into the environment of launched processes. Secret-bearing values use the `Secret(String)` newtype (P1) so they cannot be logged. **Prefer the process environment (`Command::envs`) over shell `export`** wherever the launcher spawns directly, to keep values out of shell history. The AppleScript terminal path *cannot* avoid `export KEY='<shell-quoted>'; ` prepended to the `cd && command` line — so **terminal env vars are explicitly not a secrets-grade mechanism** (they land in the interactive shell's history/environment); document this in the UI. All values pass through `escape.rs` shell-quoting (red-team H2).
- **Before-close semantics (best-effort — red-team M1):** "Before Close" runs user-defined **commands** (e.g. `docker compose down`), not window/app management. It is wired to `WindowEvent::CloseRequested` with `prevent_close`: intercept close → run before-close hooks to completion (bounded by a short per-hook timeout) → then programmatically close. **Force-quit (⌘-force), crash, and logout do NOT guarantee execution** — the OS won't await an async hook. This limitation is documented in the UI (mirroring the Warp honesty), so users don't rely on it for critical teardown. Long teardown may be detached (spawn, don't block quit) at the cost of the completion guarantee.
- **Config UI:** add `hooks-section.tsx` (three ordered command lists with wd/timeout/policy) and `env-vars-section.tsx` (key/value rows, optional secret masking) to the Phase 4 editor.
- **Trust model:** hooks are arbitrary user shell commands by design; validate/escape to prevent *accidental* breakage and injection through composed strings, but they intentionally run with the user's privileges. Surface this in the UI.

## Related Code Files

- Modify (Rust): `src-tauri/src/launch/orchestrator.rs` (hook phases, timeouts, failure policy), `src-tauri/src/models/workspace.rs` (already has `hooks` + `env_vars`; add timeout/policy fields if missing), `src-tauri/src/launch/terminal.rs` + `app.rs` (env injection)
- Create (Rust): `src-tauri/src/launch/hooks.rs` (run_hook with timeout + policy), tests in-module
- Modify (Rust): `src-tauri/src/commands/launch.rs` (before-close command), `lib.rs` (window close handler for before-close)
- Create (TS): `src/features/workspace-config/hooks-section.tsx`, `src/features/workspace-config/env-vars-section.tsx`
- Modify (TS): `src/lib/workspace-schema.ts` + `src/types/workspace.ts` (hooks timeout/policy, env vars), `src/features/workspace-config/workspace-editor.tsx` (mount new sections)
- Create (tests): `#[cfg(test)]` in `hooks.rs` (timeout, halt/continue, env escaping); `src/features/workspace-config/__tests__/env-vars-section.test.tsx`

## Implementation Steps

1. **Schema extend:** add hook `timeout`/`failure_policy` and confirm `env_vars` shape in both Rust structs and Zod/TS (keep in sync per Phase 2 contract). Bump `schema_version` if fields become required; add a migration.
2. **Hook runner:** `hooks.rs` `run_hook(cmd, cwd, timeout, policy)` → escaped invocation via shell ACL, bounded by `tokio::time::timeout`, returns `StepOutcome`.
3. **Orchestrator wiring:** run before-launch hooks (respecting halt policy) → existing tool sequence → after-launch hooks; emit progress events for each hook as steps.
4. **Env injection:** thread workspace env vars into terminal script composition and `app.rs`/command spawns; ensure values are escaped; never log values (log keys only).
5. **Before-close:** intercept `WindowEvent::CloseRequested` with `prevent_close`, run `before_close` hooks to completion (per-hook timeout bound), then close programmatically; document that force-quit/crash/logout are not covered and that it runs commands, not app-closing.
6. **UI sections:** `hooks-section.tsx` (ordered command rows per lifecycle point + wd/timeout/policy) and `env-vars-section.tsx` (key/value, add/remove, optional mask); mount in the Phase 4 editor.
7. **Tests:** hook timeout fires; halt vs continue honored; env value with special chars is injected safely; UI add/remove env rows updates the form.

## Success Criteria

- [ ] Before-launch hooks run (in order) before tools; after-launch hooks run after; a hook exceeding its timeout is terminated and reported.
- [ ] `failure_policy = halt` stops the run on hook failure; `continue` proceeds (partial restore) — both verified.
- [ ] Workspace env vars are visible to launched terminal commands (e.g. `echo $MY_VAR` shows the value in the opened terminal).
- [ ] Before-close hooks run to completion on a graceful `CloseRequested` (app quit / in-app close) before the window closes; force-quit/crash/logout are documented as **not** guaranteed; behavior is command-execution, not app management.
- [ ] Env values never appear in logs; injection of a value containing quotes/`$()` does not break the terminal command.
- [ ] Rust hook tests + UI env-section test pass.

## Risk Assessment

- **Arbitrary command execution (inherent, MEDIUM).** Mitigation: it's the feature's purpose; still route through `escape.rs` to prevent accidental breakage/composed-string injection; clearly label in UI; runs with user privileges only.
- **Hung hooks blocking launch (MEDIUM).** Mitigation: mandatory per-hook timeout; default sensible value; report timeouts as failed steps.
- **Env-var secret leakage via logs (MEDIUM).** Mitigation: log keys only, never values; optional UI masking; exclude env from any diagnostic export.
- **Before-close reliability (MEDIUM).** macOS gives no reliable window to run async commands on ⌘Q/force-quit/logout. Mitigation: `CloseRequested`+`prevent_close`+timeout for the graceful path; explicitly document force-quit/crash/logout as uncovered; never imply guaranteed teardown in the UI.
