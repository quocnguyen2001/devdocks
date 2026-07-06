# Red-Team Plan Review — DevDock macOS Workspace Launcher

**Reviewer:** code-reviewer (hostile failure-mode / scope-complexity lens)
**Date:** 2026-07-05
**Scope:** `plan.md` + `phase-01` … `phase-07` + 2 research reports + `rawplan.md`
**Verdict:** Plan is well-structured and mostly well-scoped, but ships with one self-contradicting acceptance criterion, several under-specified failure paths (Docker timeout, re-entrant launch, retry, before-close), and an over-stated "MVP-usable-at-P3" claim. Fixable in the plan without re-architecting.

---

## Findings (sorted Critical → Medium, capped at 8)

### 1. [Critical] The canonical example config the plan validates against is un-restorable — Warp with `cwd`+`command`

- **Evidence:** `rawplan.md:229-248` — the example workspace both terminals use `"app": "warp"` with `"cwd"` and `"command"`. `phase-03-launch-engine.md:27` + `:51` — "Warp = `open -a "Warp"` only (no cwd/command)". `phase-02-...md:52` — success criterion "JSON on disk matches the `rawplan.md` example shape". `phase-04-...md:55` — "created end-to-end via the UI and matches the `rawplan.md` example JSON on disk".
- **Failure scenario / concrete gap:** The plan makes "round-trips the rawplan.md example" a success criterion in P2 and P4, but the launch engine (P3) explicitly *cannot* honor that example — Warp will silently drop `cwd`/`command` and every terminal in the reference workspace becomes a bare `open -a Warp`. If a demo/QA uses the documented example, the flagship "one-click restore" visibly does nothing useful for the terminals. This is the exact "polished example that doesn't actually work" risk. The example also has **no `id`, `schema_version`, `metadata`, `ide` detection state, startup sequence, hooks, or env** — so "matches the example shape" is ambiguous vs. the real persisted shape.
- **Suggested fix (minimal):** (a) Change the P2/P4 seed + acceptance example to use `iterm2` or `Terminal.app` (a terminal that actually runs `cwd`+`command`), keeping one Warp entry only to exercise the launch-only path. (b) Reword P2:52 / P4:55 to "matches the example shape *plus* system fields (`id`, `schema_version`, `metadata`)" so the criterion is testable, not literal-equality against a partial fixture.

---

### 2. [High] Docker (and any dependency wait) has no timeout/retry/on-timeout policy in the data model — only prose

- **Evidence:** `phase-03-...md:18` "Docker (optional, wait for ready)", `:30` "poll `docker info` until exit 0 or timeout", `:64` "waits … up to timeout; times out gracefully". `phase-02-...md:23` model enumeration lists no `retries`/`timeout`/`delay` for a dependency/Docker step. Contrast: the research report *does* model it (`researcher-...-launch-automation-report.md:294-299`, `:484-490` — `retries`, `delayMs`).
- **Failure scenario / concrete gap:** "Wait for Docker" is named across three places but the timeout, poll interval, and — critically — **what happens to the steps that depend on Docker when it times out** are undefined. Docker Desktop cold-start on macOS routinely takes 30-60s+; a hard-coded or unstated timeout will either abort too early (IDE/terminals that needed Docker fail) or hang the perceived-blocking progress UI. "Times out gracefully" is aspirational, not verifiable, with no fields to configure it and no defined downstream behavior (skip dependents? run them anyway? mark required?).
- **Suggested fix (minimal):** Add explicit fields to the P2 schema for a dependency-wait step: `timeout_secs`, `poll_interval_ms`, and an `on_timeout: skip_dependents | continue | fail_run` policy. Give the P3 success criterion a concrete assertion (e.g. "with Docker stopped, the run reports Docker `failed` after N s and dependents are `skipped`, not hung").

---

### 3. [High] Re-entrant / concurrent launch is a backend-state hazard deferred to a UI phase as an "open question"

- **Evidence:** `phase-05-...md:26` "a second launch of a different workspace is allowed (or queued — see open question)", `:60` "Concurrent launches confusing progress UI … decide single-active vs queued (open question)". `phase-03-...md` (owns `launch_workspace`, orchestrator, event stream, `metadata.last_launched` write) — **no mention** of re-entrancy, in-flight guards, or per-run event scoping. Research flags it too: `researcher-...-launch-automation-report.md:527`.
- **Failure scenario / concrete gap:** The concurrency decision is a **backend concern** (in-flight run registry, event `run_id` scoping, atomic `metadata.last_launched` writes, TCC prompt racing two osascript calls) but the plan only raises it in the P5 UI phase. If P3 emits `launch:progress` without a `run_id`, two overlapping launches (same or different workspace) interleave into one event stream and the progress UI mis-attributes steps. Double-launching the *same* workspace can also double-open windows and race the metadata write. By the time P5 "decides," P3's event contract is already built without the field needed to support either choice.
- **Suggested fix (minimal):** Decide now (single-active-run is the YAGNI default) and bake it into P3: add `run_id` to every `launch:progress`/`launch:done` event, reject/queue a launch while one is active, and note same-workspace re-entrancy is blocked. Remove the "open question" from P5 or reduce it to a UI presentation detail once the backend contract is fixed.

---

### 4. [High] `retry_step` is a success criterion but its execution semantics are unspecified (stateful re-entry gap)

- **Evidence:** `phase-03-...md:39` (`retry_step` command), `:56` "re-runs a single failed step", `:65` "the failed step is retryable". `phase-05-...md:24` "per-step retry via Phase 3 `retry_step`". No description of how a single step is re-executed outside the orchestrator loop, whether the detection cache (`:48` "Cache within a launch run") is still valid, or how env-var/hook context (P6) is reconstructed for a lone step.
- **Failure scenario / concrete gap:** The orchestrator is described as a single sequential pass that builds an ordered list and emits events. `retry_step(id, step_id)` re-runs one step *after* that pass has ended — but the plan never says where the per-step context (resolved cwd, escaped command, injected env from P6, detection result) lives so it can be rebuilt. If context is recomputed from scratch, detection may now differ; if it's cached, the cache lifetime ("within a launch run") has already ended. Retrying a Docker-dependent step also has no defined re-check of the dependency. This is a classic under-specified stateful-re-entry bug that passes a happy-path test and breaks on real partial-restore.
- **Suggested fix (minimal):** Specify that a launch run persists its resolved step plan (with per-step resolved args + env) keyed by `run_id`, and `retry_step` re-executes from that stored plan (not a fresh recompute). State whether a retried dependency step re-runs its wait. Add a test: "fail IDE by removing it, restore it, `retry_step` succeeds and emits `ok` for that step only."

---

### 5. [Medium] "MVP usable at end of Phase 3" is overstated — the only way to reach launch is a `#[cfg(debug_assertions)]` dev seed + a throwaway button

- **Evidence:** `plan.md:98` "**One-click launch** of a seeded workspace … **🎯 MVP usable**", `:104` "the point at which the product becomes useful". `phase-02-...md:46` seed is "a `dev_seed_workspace` command (behind `#[cfg(debug_assertions)]`)". `phase-03-...md:57` "a **temporary** 'Launch' button on the dev shell (full UI is Phase 4/5)". No create/edit UI until P4.
- **Failure scenario / concrete gap:** The MVP milestone is real for *engineering validation* but not *user-usable*: a debug-only seed and a temporary dev button are not a shippable increment — a user cannot create, pick, or launch their own workspace until P4. Calling P3 "MVP usable" / "the product becomes useful" risks a stakeholder expecting a demoable app and a scope argument later. It also means P3's own manual-validation step (`:59`, `:63`) depends on the P2 seed existing and being rich enough (IDE + iTerm2 terminal + Docker + URL) — tighten that dependency.
- **Suggested fix (minimal):** Relabel the P3 milestone as "**MVP launch engine proven** (dev-seeded)" and move the "user-usable one-click" milestone to P4/P5 where a real workspace can be created and launched from the UI. Ensure the P2 seed fixture explicitly contains the full tool matrix P3's success criteria assert against.

---

### 6. [Medium] Before-Close hooks depend on a window-close handler whose firing is unreliable on macOS (async teardown race)

- **Evidence:** `phase-06-...md:25` "runs user-defined commands when the user closes the workspace/app", `:33` "`lib.rs` (window close handler for before-close)", `:44` "register a window/workspace-close handler that runs `before_close` hooks", `:53` success criterion "Before-close hooks run on workspace/app close".
- **Failure scenario / concrete gap:** On macOS/Tauri, "close" is ambiguous and unreliable for running *async, possibly-long* shell hooks (e.g. `docker compose down`): closing the last window vs. Cmd-Q vs. force-quit vs. logout fire different (or no) events, and the OS does not wait for a spawned async hook to finish before the process dies. The plan sets a bare success criterion with no statement of *which* close events are honored or how it prevents the app from exiting before the hook completes. Likely to "pass" a manual click-the-red-button test and silently no-op on Cmd-Q or during shutdown.
- **Suggested fix (minimal):** Scope it explicitly: intercept a defined event (e.g. `WindowEvent::CloseRequested` and/or an in-app "Close workspace" action), run before-close hooks to completion *before* allowing exit (with the per-hook timeout as the bound), and document that force-quit/logout are not covered. Add that boundary to the success criterion so it's testable rather than aspirational.

---

### 7. [Medium] Schema-drift mitigation is two hand-written definitions + a shared fixture — fragile exactly where it's load-bearing (hooks/env in P6)

- **Evidence:** `phase-02-...md:25` "hand-written TS interfaces … + a Zod schema kept structurally identical", `:59` risk "Rust/TS schema drift", mitigation = doc comment + shared example fixture, "`ts-rs`/`specta` … future option". `phase-06-...md:40` "add hook `timeout`/`failure_policy` … in both Rust structs and Zod/TS (keep in sync per Phase 2 contract)", `:35` bumps schema again.
- **Failure scenario / concrete gap:** Three separate definitions (Rust serde, TS interface, Zod) kept in sync by *a comment and one example fixture* is a known drift trap. The single shared example only catches drift on fields the example exercises; optional/rare fields (hook `failure_policy`, env masking, per-URL browser, startup-step delay) can diverge silently and a malformed save round-trips through `#[serde(default)]` as data loss rather than an error. P6 adds required-ish fields and bumps `schema_version`, multiplying the surface. This isn't wrong for v1, but "structurally identical, verified by one fixture" over-promises the safety.
- **Suggested fix (minimal):** Either (a) commit to `ts-rs`/`specta` codegen now for the Rust→TS types (Zod stays hand-written but derives from the generated type), which is a small YAGNI-justified investment given the schema is touched in P2, P4, and P6; or (b) keep hand-written but require the shared test fixture to be **exhaustive** (every optional field populated) and assert Rust and Zod both accept *and reject* the same edge cases, not just the happy example.

---

### 8. [Medium] Cross-cutting failure modes named in prose have no owning acceptance criterion — corrupt JSON, missing/moved `path`, first-run

- **Evidence:** `plan.md:122` "JSON schema evolution" and P2 "corrupt file skipped" (`phase-02-...md:53`) — covered. But **missing/moved workspace `path`** is only "existence checked at launch, not save" (`phase-02-...md:43`) with no P3 success criterion for what launch does when `path` no longer exists; `phase-04-...md` validates path *format*, not existence. **First-run/no-workspaces** appears only as a P5 empty-state (`phase-05-...md:45`), not as a P2/P3 concern (what does `launch_workspace` do if the config dir or file is absent/deleted between list and launch?).
- **Failure scenario / concrete gap:** A workspace whose `path` was deleted/moved (common: project archived, external drive unmounted) will reach the launchers, where `open -a "<IDE>" <missing-path>` and `cd <missing-cwd>` behave inconsistently (IDE may open empty, `cd` fails and the terminal command still runs in `$HOME`). No criterion asserts a clean "path missing → step failed with actionable message." Similarly, deleting a workspace file mid-session, or launching immediately after first-run before any dir exists, has no defined behavior in P3.
- **Suggested fix (minimal):** Add a P3 pre-flight validation step: before running launchers, verify workspace `path` (and each terminal `cwd` after resolution) exists; if not, mark those steps `failed`/`skipped` with a "path not found" message rather than invoking tools against a dead path. Add one success criterion: "launching a workspace whose `path` was removed reports a clear failure and does not open the IDE at a bogus location."

---

## What is genuinely well-scoped (brief, for calibration)

- **Sequencing is sound.** P1→P2→P3→(P4/P5)→P6→P7 has no phase secretly depending on a later one, *except* the framing issues in Findings 1 and 5. The P4-needs-P3-`detect_tools` and P6-extends-P4 dependencies are correctly declared.
- **Security boundary is right.** "One audited `escape.rs`, tests-first, fine-grained ACL default-deny, no `sh -c`" (`phase-03-...md:32`, `:47`, `:73`) is the correct posture and is not over-engineered.
- **YAGNI held on the big levers.** JSON-not-SQLite, Zustand-only (TanStack deferred), single window, icon/color constrained (`phase-04-...md:67`), virtualization deferred (`phase-05-...md:61`) — no gratuitous abstraction or manager-for-its-own-sake. `< 1s` startup correctly treated as a budget, not a hard gate (`phase-07-...md:63`).
- **Warp-as-documented-limitation** (not a bug) is the right call — the only problem is that the *example config* contradicts it (Finding 1).

---

## Unresolved questions for the planner

1. Single-active-run vs. queued launches — this needs a decision *in P3*, not P5 (Finding 3). Which is intended?
2. Is `ts-rs`/`specta` codegen acceptable now (Finding 7), or is the hand-written+fixture contract a deliberate accept-the-risk call?
3. Does "MVP usable at P3" need to survive as a stakeholder-facing milestone, or can it be relabeled to "launch engine proven" (Finding 5)?

---

Status: DONE_WITH_CONCERNS
Summary: Plan is well-structured with correct security posture and YAGNI discipline, but has one self-contradicting acceptance criterion (Warp example config vs. launch-only reality) and several under-specified failure paths (Docker timeout policy, re-entrant launch, retry semantics, before-close reliability, missing-path handling).
Findings: 1 critical, 3 high, 4 medium
Report: /Users/quoc/Workspace/quocnguyen2001/devdocks/plans/reports/from-code-reviewer-to-planner-red-team-failure-scope-plan-review-report.md
