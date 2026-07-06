---
phase: 2
title: Workspace Data Model and Storage
status: completed
effort: M
---

# Phase 2: Workspace Data Model and Storage

## Overview

Define the workspace configuration schema once and mirror it on both sides: Rust `serde` structs (source of truth) and TypeScript types + a Zod schema (frontend validation). Implement Rust CRUD commands that persist one JSON file per workspace in the app config dir, with atomic writes and schema versioning, and a Zustand store that mirrors them. Ends with workspaces that survive a restart.

**Depends on:** Phase 1. **Blocks:** Phases 3–6.

## Requirements

- **Functional:** create / list / get / save / delete / duplicate workspaces; each persists to `<app_config>/workspaces/<id>.json`; a `schema_version` field enables future migrations; IDs are stable UUIDs.
- **Non-functional:** writes are atomic (temp file + rename) to avoid corruption; invalid/corrupt files are skipped with a logged warning, not a hard crash; Rust serialization is unit-tested.

## Architecture

- **Model (Rust, `serde`):** `Workspace` with nested `IdeConfig`, `TerminalConfig`, `AiToolConfig`, `ApplicationConfig`, `DependencyConfig`, `BrowserUrls`, `StartupStep[]`, `Hooks`, `EnvVar[]`, and `Metadata` (created/updated/last_launched). `#[serde(default)]` on optional/new fields for forward-compatibility. `WORKSPACE_SCHEMA_VERSION: u32 = 1`.
- **`DependencyConfig` (Docker / wait-for-ready) — modeled, not prose (red-team):** `{ kind, start (bool: `open -a` first), check_cmd, timeout_secs, poll_interval_ms, on_timeout: SkipDependents | Continue | FailRun, required }`. The launch engine (P3) consumes these exact fields; they are not hard-coded in Rust.
- **Case + unknown-field policy (decided — red-team):** every struct derives `#[serde(rename_all = "camelCase")]` so on-disk JSON keys == TS keys (kills a whole drift class). `deny_unknown_fields` is **off** (tolerate unknown keys) so a newer file opened by an older build degrades gracefully; forward/backward compat is governed by `schema_version` + `migrate()`, not rejection.
- **Storage (Rust):** `app_handle.path().app_config_dir()` → `workspaces/`. Atomic write = write `<id>.json.tmp` then `fs::rename`. On load, iterate `*.json`, deserialize, run `migrate()`, skip+log on error.
- **Types mirror:** hand-written TS interfaces in `src/types/workspace.ts` + a Zod schema in `src/lib/workspace-schema.ts` kept structurally identical to the Rust structs (documented as the sync contract; a future codegen step is noted but YAGNI now).
- **IPC:** `invoke()` wrappers in `src/lib/workspace-ipc.ts`; `useWorkspaceStore` (Zustand) caches results and optimistically updates on save/delete.
- **App settings vs workspace data:** recents/favorites **index** and theme live in `tauri-plugin-store`; full workspace configs live in JSON files (never in the store).

## Related Code Files

- Create (Rust): `src-tauri/src/models/workspace.rs`, `src-tauri/src/models/mod.rs`, `src-tauri/src/storage/workspace_repo.rs`, `src-tauri/src/storage/migrations.rs`, `src-tauri/src/storage/mod.rs`, `src-tauri/src/commands/workspace.rs`, `src-tauri/src/commands/mod.rs`
- Modify (Rust): `src-tauri/src/lib.rs` (register commands + managed state), `src-tauri/Cargo.toml` (add `serde`, `serde_json`, `uuid`, `chrono`, `thiserror`)
- Modify (ACL): `src-tauri/capabilities/default.json` (no fs plugin needed — Rust owns file IO directly; add nothing shell/fs unless the folder picker lands here)
- Create (TS): `src/types/workspace.ts`, `src/lib/workspace-schema.ts` (Zod), `src/lib/workspace-ipc.ts`, `src/store/workspace-store.ts`
- Create (tests): `#[cfg(test)]` in `workspace.rs` + `workspace_repo.rs`; `src/lib/__tests__/workspace-schema.test.ts`

## Implementation Steps

1. **Rust model:** define `Workspace` and nested structs in `models/workspace.rs` covering every config section from `rawplan.md` (general, ide, terminals, ai_tools, applications, browser_urls, startup_sequence, hooks, env_vars). Add `schema_version` + `Metadata`. Derive `Serialize, Deserialize, Clone, Debug`. Use `#[serde(default)]` liberally.
2. **Repo layer:** `workspace_repo.rs` — `list()`, `get(id)`, `save(ws)` (atomic tmp+rename, bump `updated_at`), `delete(id)`, `duplicate(id)` (new UUID + name suffix). Ensure `workspaces/` dir on first use.
3. **Migrations:** `migrations.rs` — `migrate(value) -> Workspace` that reads `schema_version` and applies forward migrations (no-op at v1; establishes the seam).
4. **Commands:** thin `#[tauri::command]` wrappers in `commands/workspace.rs` (`list_workspaces`, `get_workspace`, `save_workspace`, `delete_workspace`, `duplicate_workspace`) returning `Result<_, String>`; register in `lib.rs`.
5. **Validation utility (Rust):** a `validate_workspace()` that checks required fields + that `path` is non-empty (existence checked at launch, not save). Return typed errors via `thiserror`.
6. **TS types + Zod:** author `workspace.ts` and `workspace-schema.ts` to match the Rust structs field-for-field; export inferred type = the source for forms in Phase 4.
7. **IPC + store:** `workspace-ipc.ts` (`invoke` wrappers) and `workspace-store.ts` (fetch on mount, optimistic add/update/delete, `isLoading`/`error`).
8. **Seeding for test/dev:** a `dev_seed_workspace` command (behind `#[cfg(debug_assertions)]`) that produces a **rich** fixture exercising P3's full success matrix — an IDE, an **iTerm2/Terminal.app** terminal (NOT Warp — Warp can't run cwd+command, so it must not be the primary seed) with `cwd`+`command`, a Docker dependency step, an additional app, and a browser URL. Keep one optional Warp entry only to exercise the launch-only path.
9. **Tests:** Rust round-trip serialization, atomic-write, corrupt-file-skip, and duplicate-id tests; Vitest test that the Zod schema accepts the `rawplan.md` example config and rejects a malformed one.

## Success Criteria

- [ ] `save_workspace` → restart app → `list_workspaces` returns the same workspace (persisted to `<app_config>/workspaces/<id>.json`).
- [ ] A saved workspace round-trips: on-disk JSON is pretty-printed **camelCase**, contains the `rawplan.md` config sections **plus** system fields (`id`, `schemaVersion`, `metadata`), and re-loads to an equal struct. (Storage-shape check only — launchability of any specific example is a P3 concern; the launch seed deliberately uses a terminal that supports `cwd`+`command`.)
- [ ] A corrupt/partial JSON file is skipped with a `tracing` warning; the app still lists the valid ones.
- [ ] Writes are atomic (no truncated file if interrupted) — verified by test.
- [ ] Zod schema and Rust structs accept the same example config; `cargo test` and the Vitest schema test pass.

## Risk Assessment

- **Rust/TS schema drift** (two hand-written definitions across 9 sections; red-team H3/F7). Mitigation: (1) `#[serde(rename_all = "camelCase")]` everywhere so JSON keys are identical on both sides; (2) an **exhaustive** shared fixture with *every optional field populated* (not just a happy object) that both Rust and Zod must accept, plus paired negative fixtures both must reject — this catches a field added on one side only; (3) `deny_unknown_fields` off + `schema_version`/`migrate()` as the compat mechanism. Reassess `ts-rs`/`specta` codegen (generate TS from Rust; Zod derives from it) if P6's field additions cause drift — the setup cost is low and this schema is touched in P2/P4/P6.
- **Config-dir path differences / permissions.** Mitigation: always go through `app_config_dir()`; create dirs on demand; never hardcode `~/Library/...`.
- **Schema evolution pain later.** Mitigation: `schema_version` + `migrate()` seam shipped now, even though v1 is a no-op.
