---
phase: 3
title: Launch Engine
status: completed
effort: L
---

# Phase 3: Launch Engine

## Overview

The core value of DevDock: a Rust orchestrator that restores a workspace by launching its tools in a configurable order, with per-step delays, dependency waits, live progress events, and per-step error isolation. This is the riskiest phase (macOS automation + shell safety) and the point at which the launch engine is proven end-to-end against a dev-seeded workspace.

**Depends on:** Phase 2 (a persisted, richly-populated seed workspace to launch). **Blocks:** Phases 4–6 depend on its detection + launch commands and progress events.

> **Milestone: launch engine proven (dev-seeded).** After this phase the engine restores a real workspace from a `#[cfg(debug_assertions)]` seed + a temporary dev button. It is **not yet user-usable** — a user cannot create or pick a workspace until Phase 4. The "user-usable one-click launch" milestone lands in Phase 4/5. (Red-team: the earlier "MVP usable at P3" framing over-promised a shippable increment.)

## Requirements

- **Functional:** given a workspace, execute the launch flow — validate → pre-launch hooks (stub here; full in P6) → Docker (optional: start if configured, then wait for ready) → IDE → terminals (cwd + command) → additional apps → AI tools → browser URLs → save session metadata. Order + per-step delay come from the workspace's startup sequence. Detect installed tools; report each step's status live.
- **Non-functional:** a failing/hanging step never aborts the whole restore (partial-restore + retry); **all** external invocation goes through one audited escaping/validation boundary; the macOS Automation (TCC) prompt is handled lazily with clear guidance; launches are **single-active** (a `run_id`-scoped run at a time).

## Architecture

### Execution model
- **Everything runs in Rust** (`async` `#[tauri::command] launch_workspace`, `tokio`). Frontend invokes once and listens to `emit`ted progress events. Rationale: contains the TCC Automation grant to one process and centralizes escaping.
- **Single-active run (decided — resolves the former P5 open question):** at most one launch run is active at a time; a launch request while one is in-flight is **rejected** with a clear error (queueing deferred — YAGNI). Every `launch:progress`/`launch:done` event carries a `run_id` so the UI attributes steps to the correct run and same-workspace re-entrancy is blocked.
- **Resolved run plan:** the orchestrator first builds an immutable **resolved step plan** (each step's resolved cwd, escaped argv/script, injected env, detection result) keyed by `run_id`, then executes it. This plan is **retained after the run** so `retry_step(run_id, step_id)` re-executes a single step from the stored resolution (not a fresh recompute) — with dependency steps re-checking their wait.

### Invocation strategy (from research)
- **argv arrays, never string composition, for `open`/`test`/`which`/`docker`.** e.g. `Command::new("open").args(["-a", app_name, path])`. User-controlled **names/URLs never reach a shell.** Only the terminal-AppleScript path composes a string (see escaping).
- **IDE:** CLI-first (resolve absolute binary via detection → run with path as argv), else `open -a "<App>" <path>` (argv). JetBrains (PhpStorm/IntelliJ) = `open -a` only.
- **Terminal:** iTerm2 + Terminal.app via `osascript` (new window → `cd <cwd> && <command>`); **Warp = `open -a "Warp"` only** (no cwd/command — reported `skipped`, documented limitation).
- **Apps / AI tools:** `open -a "<App>"` (argv, + optional args); AI CLIs may run as a terminal step.
- **Browser URLs:** `open <url>` or `open -a "<Browser>" <url>` (argv); URL scheme restricted to `http`/`https`.
- **Docker:** if configured, `open -a Docker` **then** poll `docker info` until ready or timeout (start-then-wait, not wait-only).

### The escaping boundary (`escape.rs`) — the sole real security control for the terminal path
The AppleScript terminal path crosses **two interpreters**: the `-e` string is parsed by AppleScript, and `do script`/`write text` then hands its payload to `/bin/sh`. A quote-only escape is a **no-op** against `$(...)`, backticks, `;`, `|`, `\`, and newlines. The contract, tested as such:
1. **Shell-quote `cwd`** as a single-quoted POSIX token (`'` → `'\''`). The terminal **`command` stays raw shell by design** (it *is* user shell) — do not quote it.
2. **Compose** the shell line: `cd '<quoted-cwd>' && <raw-command>` (env `export`s prepended per P6, values shell-quoted).
3. **AppleScript-literal escape** the whole composed line: escape `\` first, then `"`; **reject/strip** newlines and `\r`.
4. Invoke `osascript` with the script (argv `-e` or stdin `osascript -`).
- **`validate_path` policy (decided):** not a character allowlist. Order = **expand** (`~`, relative-`cwd`-against-workspace-`path` via `shellexpand`) → **canonicalize** (`std::fs::canonicalize`) → **assert `is_dir`** → **shell-quote** as a token (per above), which makes character content irrelevant to safety. Reject only control chars/newlines. A non-existent/traversal path fails cleanly here.
- **Names/URLs:** custom app/browser **name** validated against `^[A-Za-z0-9 ._-]+$` (reject `/`, `..`, controls); browser **URL** must be `http(s)` scheme (blocks `file://`, `x-apple.systempreferences:`, arbitrary handlers). Passed as argv regardless.

### ACL — honest framing (red-team C2)
Fine-grained ACL argument-scopes `open`, and `docker` where used. But **whitelisting `osascript` grants arbitrary execution** (`do shell script "…"`) — the ACL cannot constrain AppleScript semantics, so for the terminal path `escape.rs` is the **sole** boundary and must be reviewed/tested as the gating control (tests-first). To shrink the shell surface, **prefer Rust-native checks over shell calls**: `std::path::Path::exists`/`is_dir` and a PATH walk instead of `which`/`test`; this reduces the whitelist toward just `open` + `osascript` (+ optional `docker`). Do **not** claim "no command runs without ACL" as if it bounds behavior — it bounds only *which binary*, not *what it does*.

### macOS PATH hydration (red-team M3 — well-known Tauri footgun)
A GUI-launched app inherits a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), missing `/opt/homebrew/bin`, `/usr/local/bin`, and shell-rc additions — so `which code`, `docker`, `zed`, and hook tools resolve as "not found" though they work in the user's terminal. **On first launch, resolve the login-shell PATH once** (`$SHELL -lic 'echo $PATH'`, cached) and pass it into every spawned `Command` env; prefer **absolute binary paths** from detection where possible.

### Detection (`detect.rs`) (red-team H4)
Do **not** use `open -a <app> --help` (no such passthrough). Use **bundle-identifier matching** via `mdfind "kMDItemCFBundleIdentifier == '<id>'"` (or `NSWorkspace`), check `/Applications` **and** `~/Applications` **and** Setapp paths, and a hydrated-PATH walk for CLIs. Honor a per-tool **custom path override** (Phase 4 custom entry). Exposed as `detect_tools`; results cached per `run_id`.

### Progress + session metadata
- `emit("launch:progress", { run_id, step_id, kind, label, status: pending|running|ok|failed|skipped, message })`; final `emit("launch:done", { run_id, summary })`.
- On completion, update `metadata.last_launched` (via Phase 2 repo, atomic). **Session metadata excludes `env_vars`** (secrets) — never persist or export env values.
- **TCC error classification (red-team M2):** match the specific TCC signal (AppleScript error `-1743` / `errAEEventNotPermitted` or its stderr substring) → show "grant Automation in System Settings → Privacy" guidance; treat other non-zero `osascript` exits as a distinct "terminal automation failed" error surfacing (redacted) stderr — so a script-composition regression is not masked as a permissions story.

## Related Code Files

- Create (Rust): `src-tauri/src/launch/{mod,orchestrator,ide,terminal,app,browser,docker,detect,escape,path_env,run_plan}.rs`
- Create (Rust): `src-tauri/src/commands/launch.rs` (`launch_workspace`, `detect_tools`, `retry_step`)
- Modify (Rust): `src-tauri/src/lib.rs` (register `tauri_plugin_shell` + `tauri_plugin_opener`, new commands, single-active run registry in managed state), `src-tauri/Cargo.toml` (`tauri-plugin-shell`, `tauri-plugin-opener`, `shellexpand`)
- Create (ACL): `src-tauri/capabilities/shell.json` (argument-scoped `open`/`osascript`; note osascript is unconstrainable)
- Create (TS): `src/lib/launch-ipc.ts` (invoke + event subscription by `run_id`), `src/store/launch-store.ts` (per-run, per-step progress), `src/types/launch.ts`
- Create (tests): `#[cfg(test)]` in `escape.rs` (injection corpus), `orchestrator.rs` (plan/order/single-active), `terminal.rs` (two-layer composition), `path_env.rs` (PATH hydration), `detect.rs`

## Implementation Steps

1. **Escaping boundary first (security-critical):** implement `escape.rs` with the two-layer contract above + `validate_path` (expand→canonicalize→is_dir→quote) + name/URL validators. **Write the injection corpus test before any launcher:** `cwd`/env values containing `` ` ``, `$(...)`, `;`, `|`, `&`, `\`, newline, `'`, `"` must not execute a side-effect; assert the raw `command` still runs.
2. **PATH hydration:** `path_env.rs` — resolve login-shell PATH once, cache, expose an env map for all spawns.
3. **Detection:** `detect.rs` per strategy above; `detect_tools` command returning `{ id, available, method, resolved_path }`; honor custom overrides.
4. **Individual launchers** (each returns `StepOutcome`, never panics), all `open`/`test`/`docker` via **argv arrays**:
   - `ide.rs`: absolute-CLI or `open -a`; skip+report if not installed.
   - `terminal.rs`: build the two-layer-escaped AppleScript for iTerm2/Terminal.app (new window, `cd '<cwd>' && <command>`, env `export`s); Warp → `open -a Warp` + `skipped(cwd/command unsupported)`.
   - `app.rs`: `open -a` (argv); `browser.rs`: `open [-a Browser] <url>` (argv, http(s) only); `docker.rs`: `open -a Docker` (if configured) then `wait_for_ready(docker info, timeout, poll)`.
5. **Run plan + orchestrator:** build the resolved, `run_id`-keyed step plan from the workspace startup sequence (fallback = canonical flow order); enforce **single-active** via a managed-state registry; execute sequentially with per-step delay; emit progress; isolate errors (continue unless `required`); **pre-flight**: before launchers, verify workspace `path` and each resolved terminal `cwd` exist (`is_dir`) — mark missing ones `failed` with "path not found" instead of invoking tools against a dead path.
6. **retry_step:** re-execute one step from the retained resolved plan keyed by `run_id`; a retried dependency step re-runs its wait.
7. **Lazy TCC handling:** classify osascript errors (step 19/M2 above); emit actionable guidance + a helper to open the Automation pane.
8. **Session metadata:** update `last_launched` atomically; record a lightweight session summary **excluding env vars**.
9. **Commands + events:** `launch_workspace(id)`, `detect_tools`, `retry_step(run_id, step_id)`; stream events.
10. **ACL:** author `capabilities/shell.json`; document that `osascript` is unconstrainable and `escape.rs` is the boundary; drop `which`/`test` shell grants in favor of Rust-native checks.
11. **Minimal frontend hook:** `launch-ipc.ts` + `launch-store.ts` + a **temporary** dev "Launch" button (full UI is P4/P5) to exercise the flow against the P2 seed.
12. **Manual macOS validation:** run against the P2 seed (VS Code + **iTerm2** terminal running `npm run dev` + Docker Desktop + a browser URL); confirm the TCC prompt appears once and later launches are silent; confirm a Homebrew-installed `code` resolves (PATH hydration working).

## Success Criteria

- [ ] One click launches the dev-seeded workspace: IDE opens at the project path, an **iTerm2/Terminal.app** window opens at the terminal `cwd` and runs its `command`, an additional app opens, and an http(s) browser URL opens — in configured order with delays. (Warp, if present, is `skipped` with the documented reason.)
- [ ] With Docker configured and stopped, the run `open -a Docker`, polls `docker info`, and after the configured `timeout_secs` either proceeds or marks Docker `failed` and **skips its dependents** (per the P2 `on_timeout` policy) — it does not hang.
- [ ] **Injection corpus passes:** `cwd`/env containing `` ` ``, `$(...)`, `;`, `\`, newline, `'`, `"` cannot execute a side-effect; the intended `command` still runs.
- [ ] A missing/moved workspace `path` (or terminal `cwd`) is caught at pre-flight → step `failed` "path not found", IDE not opened at a bogus location.
- [ ] A Homebrew/`/opt/homebrew`-installed CLI (e.g. `code`) is detected and launched (PATH hydration verified), not falsely "unavailable"; a JetBrains-via-Toolbox app is detected via bundle id.
- [ ] Second launch while one is active is rejected with a clear error; every event carries `run_id`; `retry_step` re-runs only the failed step (emits `ok` for it alone) from the retained plan.
- [ ] TCC-denied is distinguished from a generic osascript failure; the Automation prompt appears at most once; a denied grant yields actionable guidance.
- [ ] No env value appears in logs or session metadata; ACL claims in docs are accurate (osascript noted as unconstrainable).

## Risk Assessment

- **Shell/AppleScript injection across two interpreters (HIGH).** Mitigation: single audited `escape.rs` with the tested two-layer contract; argv arrays elsewhere; escape.rs is the reviewed gating control (ACL cannot bound osascript).
- **macOS PATH gap causing false "not installed" (HIGH).** Mitigation: login-shell PATH hydration + absolute paths from detection; explicit test/QA.
- **Detection false negatives (MEDIUM).** Mitigation: bundle-id via `mdfind`, multi-directory search, custom overrides.
- **TCC Automation UX + error masking (MEDIUM).** Mitigation: lazy trigger, `-1743` classification, actionable guidance.
- **Re-entrancy/metadata races (MEDIUM).** Mitigation: single-active registry, `run_id`-scoped events, atomic metadata writes.
- **Docker cold-start timing (MEDIUM).** Mitigation: start-then-poll with configurable `timeout_secs`/`poll_interval_ms`/`on_timeout` (P2 schema); dependents skipped on timeout, not hung.
- **`~`/relative path ambiguity (LOW).** Mitigation: documented expand→canonicalize order, covered by tests.
