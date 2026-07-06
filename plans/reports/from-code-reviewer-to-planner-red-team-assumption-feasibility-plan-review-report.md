# Red-Team Assumption & Feasibility Review — DevDock Plan

**Reviewer role:** hostile assumption-destroyer / feasibility critic
**Date:** 2026-07-05
**Scope:** `plan.md`, `phase-01`…`phase-07`, both researcher reports
**Verdict:** Structurally strong plan with correct v2 instincts (Rust-owns-launch, capability ACL, lazy TCC, atomic writes, Warp tiering). But several load-bearing assumptions are unverified or provably shaky. Fix the Critical/High items before Phase 1 and Phase 3 begin.

Findings are sorted Critical → High → Medium. Line refs are `file:LINE`.

---

## CRITICAL

### C1 — The plan's cited escaping example is provably broken; `escape.rs` inherits a false template
**Summary:** `escape.rs` is declared "the security boundary," but the research it's built on demonstrates a broken escape and the plan never states the actual safe strategy.
**Evidence:** `phase-03-launch-engine.md:32` and `:47` make `escape.rs` (`validate_path`, `shell_quote`, `applescript_string`) the single audited boundary. Its source, `researcher-...-launch-automation-report.md:200-222`, shows the "CORRECT" fix as `projectPath.replace(/"/g, '\\"')` — escaping only double-quotes. That does **not** neutralize AppleScript's own `\` , nor `$()`/backticks once the string reaches a shell via `do script`. AppleScript `do script "…"` hands its payload to the user's shell, so a `cwd` of `"$(rm -rf ~)"` survives quote-escaping and executes.
**Why it's wrong/risky:** The plan's own Success Criterion `phase-03:67` ("a path containing `"; rm -rf ~"` cannot break out") will pass a naive quote-replacer in a unit test yet fail against `$()`/backtick/backslash payloads — a phantom-green test guarding a real RCE surface. This is the highest-impact defect because every terminal/hook/env path flows through it.
**Suggested fix:** Do not pass composed strings to `osascript -e`. Prefer argv-separated invocation: build the `Command` with discrete args and pass user values as AppleScript variables via stdin/`osascript -` rather than string interpolation, OR two-layer escape (AppleScript-literal escape of `\` and `"`, THEN shell-literal single-quote wrapping of the whole `-e` arg with `'\''` handling). State the exact algorithm in the phase and make the injection test corpus include `$()`, backticks, `\`, newlines, and `'`. Treat `.replace(/"/g,...)` in the research as a known-wrong anti-example.

---

## HIGH

### H1 — Phase 1 scaffold command is unverified against the non-empty-dir failure it flags as its own risk
**Summary:** `pnpm create tauri-app@latest . --template react-ts --manager pnpm` into a repo that already has `README.md` + `.git` may abort, and the plan's fallback ("scaffold in temp, move files") is hand-waved.
**Evidence:** `phase-01:39-41` runs the command into `.`; `phase-01:67` lists "Scaffolding into a non-empty dir" as a risk with a move-files mitigation. The create-tauri-app README does **not** document non-empty-dir behavior (verified: the flag `--template react-ts` and `.` target are supported, `--manager` is valid, but overwrite/merge/refuse behavior is unspecified upstream).
**Why it's risky:** This is step 1 of the entire build. If the tool refuses, the "move files in, preserving git history" path is non-trivial (nested `src-tauri/`, `.gitignore`, lockfile, hidden files) and the plan gives no concrete procedure. A blocked Phase 1 blocks everything.
**Suggested fix:** Before committing to `.`, empirically test on a scratch clone (the greenfield repo has only `README.md` + `rawplan.md` + `.git`). If it refuses, document the exact recovery: scaffold into `../devdocks-scaffold`, then `rsync` non-conflicting files back and reconcile `.gitignore`. Also reconcile the **three divergent scaffold commands**: `phase-01:39` vs `scaffold-report:26-31` (`--binary-name --frontend-language --ui`) vs `scaffold-report:1034`. Pick one and delete the others to prevent an implementer copy-pasting a stale form.

### H2 — "< 1s cold start" is asserted as an acceptance criterion but treated as aspirational — pick one
**Summary:** The same number is a hard checkbox in one place and an explicitly-not-a-gate budget in another. Internal contradiction.
**Evidence:** `plan.md:108` lists "App launches in **< 1s** (cold) on Apple Silicon" as acceptance criterion #1 (a gate). `phase-07:63` says "the target is aspirational and can be tracked as a perf budget rather than a hard release gate." No measurement method, machine spec, or definition of "cold" (process spawn → first paint? → interactive?) is given anywhere.
**Why it's risky:** Tauri cold start on Apple Silicon is typically ~0.3–1.5s and dominated by WebView init, which the app does not control. An undefined, evidence-free gate either blocks release arbitrarily or gets silently waived — both erode the acceptance list's credibility.
**Suggested fix:** Demote to a tracked budget explicitly in `plan.md:108` to match `phase-07:63`, OR define it rigorously: machine (e.g. M1/8GB), metric (spawn→interactive), method (`tauri`'s own timing or a marked `performance.now()`), and a p50 threshold. Do not leave two contradictory statements.

### H3 — Rust↔TS schema hand-sync across 9 nested sections is a drift trap the "contract doc + dual test" only partially guards
**Summary:** Two hand-authored schema definitions (serde structs + Zod/TS) covering general/ide/terminals/ai_tools/applications/browser_urls/startup_sequence/hooks/env_vars, kept in sync by a doc comment and a shared fixture test.
**Evidence:** `phase-02:25` and `:59` describe the dual hand-written definitions with mitigation = "single schema-contract doc comment" + "Vitest + Rust test that both parse the identical example fixture." Phase 6 (`phase-06:40`) then *adds* fields (`timeout`/`failure_policy`) to both sides by hand and may bump `schema_version`.
**Why it's risky:** A shared fixture proves both sides accept **one** happy object; it does not catch a field added to Rust but forgotten in Zod, an enum variant renamed on one side, `#[serde(default)]` masking a missing field, or `snake_case`↔`camelCase` mismatches (serde default is snake; TS convention is camel — the plan never states the rename policy, and `save_workspace` will silently drop unknown keys or reject them depending on `deny_unknown_fields`).
**Suggested fix:** State the case convention explicitly (recommend `#[serde(rename_all = "camelCase")]` on every struct so JSON == TS). Either adopt `ts-rs`/`specta` codegen now (the plan lists it as YAGNI-deferred — but the cost of drift across 9 sections + a mid-project field addition likely exceeds the codegen setup), or make the dual test assert **field presence per section**, not just "one fixture parses." Decide `deny_unknown_fields` posture and document it, since it dictates forward/backward compat behavior.

### H4 — App/tool detection inherits unreliable methods from research (`open -a … --help`, `/Applications`-only)
**Summary:** `detect.rs` uses `test -d /Applications/<App>.app` and CLI `which`, but the research's "most reliable" detector is a broken `open -a "App" --help` idiom, and `/Applications`-only misses user-scoped installs.
**Evidence:** `phase-03:31` specifies `which` + `test -d /Applications/<App>.app` (and `~/Applications`). The research `launch-automation-report.md:390-403` labels `open -a appName --help` "Most Reliable" — but `open` has no `--help` passthrough to the target app; it either errors or launches the app. `:361-369` relies on exact `/Applications/<Name>.app` strings, and JetBrains/Toolbox installs frequently live outside `/Applications` (Toolbox uses `~/Applications/JetBrains Toolbox/…` and versioned paths).
**Why it's risky:** False "unavailable" for correctly-installed IDEs (esp. JetBrains via Toolbox, Setapp, Homebrew casks) directly breaks the core promise "missing tools are detected before launch" (`plan.md:112`) by reporting installed tools as missing — a silent usability failure that CI won't catch.
**Suggested fix:** In `detect.rs`, do not use `open -a --help`. Use `mdfind "kMDItemCFBundleIdentifier == '<bundle-id>'"` or `/usr/bin/mdls`, plus check `~/Applications` and Setapp paths, plus `which` for CLIs. Prefer bundle-identifier matching over display-name path matching. Add a "custom path override" per tool (Phase 4 already allows custom app entry — wire detection to honor it).

---

## MEDIUM

### M1 — Before-close hooks: window-close handler firing user shell commands is timing-fragile and may not run
**Summary:** `before_close` hooks are registered on the window/app-close handler, but macOS app termination does not reliably await async shell commands.
**Evidence:** `phase-06:44-45` and `:33` register a window/workspace-close handler that runs `before_close` hooks (e.g. `docker compose down`). Success criterion `phase-06:53` requires they "run on workspace/app close."
**Why it's risky:** Tauri's `WindowEvent::CloseRequested` can be intercepted, but if the user quits via ⌘Q or the app is force-terminated, an async `tokio` hook may be killed mid-flight; there's no guaranteed drain. "Runs commands on close" is a soft promise the OS won't always honor.
**Suggested fix:** Intercept `CloseRequested`, `prevent_close`, run hooks to completion (with the per-hook timeout), then programmatically close. Document that ⌘Q / crash / logout do **not** guarantee before-close execution — mirror the honesty already applied to Warp and before-close-≠-app-teardown.

### M2 — Docker readiness via `docker info` polling assumes `docker` is on PATH and the daemon path is fixed
**Summary:** `docker.rs` polls `docker info` until exit 0, but Docker Desktop may not be running, `docker` may be a Desktop shim not on the ACL-whitelisted PATH, and "start Docker then wait" is not the same as "wait for already-starting Docker."
**Evidence:** `phase-03:30` and `:52` define the Docker wait as `poll docker info until exit 0 or timeout`. ACL whitelists `docker` (`phase-03:34`).
**Why it's risky:** If Docker Desktop isn't launched, `docker info` fails forever until timeout — the plan waits but never *starts* Docker. Users will expect DevDock to launch Docker Desktop (it's in the app list) AND wait. Order dependency between "open -a Docker" and "poll docker info" is unspecified.
**Suggested fix:** Specify that the Docker step first `open -a Docker` (if configured) *then* polls `docker info`. Confirm `docker` resolves under the app's PATH environment (Tauri's spawned env may lack the user's shell PATH — a known Tauri gotcha; may need to resolve the absolute binary or source the login shell PATH).

### M3 — Spawned-process environment likely lacks the user's shell PATH — affects `which`, `code`, `docker`, hooks
**Summary:** Commands spawned from Rust/Tauri inherit the app bundle's environment, not the user's interactive shell PATH; the plan assumes `which code`, `docker`, `zed` resolve.
**Evidence:** Detection (`phase-03:31`), IDE CLI launch (`phase-03:26`), Docker (`phase-03:30`), and hooks (`phase-06`) all assume CLI binaries resolve by name. No phase mentions PATH hydration.
**Why it's risky:** A GUI app launched from Finder/Dock gets a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), missing `/opt/homebrew/bin`, `/usr/local/bin`, and shell-rc additions. `which code` then returns not-found for a `code` that works in the user's terminal — reproducing the H4 false-negative class and breaking hook commands that rely on PATH tools.
**Suggested fix:** On launch, resolve the user's login-shell PATH once (`$SHELL -lic 'echo $PATH'`) and pass it to every spawned `Command` env, or use absolute binary paths from detection. Add a Rust test/manual-QA note. This is a well-known Tauri/Electron macOS footgun and deserves an explicit line in Phase 3.

### M4 — Playwright "webServer port 1430" config in research is wrong for a Vite/Tauri app; smoke E2E may never connect
**Summary:** The scaffold report's Playwright config points at port 1430 with `pnpm tauri dev`, but the Vite dev server is 5173 and `tauri dev` opens a native window, not a headless HTTP endpoint.
**Evidence:** `scaffold-report:899-914` sets `port: 1430` / `baseURL: http://localhost:1430` with `command: pnpm tauri dev`. `scaffold-report:120` and `:1129` set Vite `devUrl`/server to `5173`. Phase 7 (`phase-07:26`, `:46`) relies on Playwright smoke against the dev server.
**Why it's risky:** Copy-pasting the research config yields an E2E harness that connects to nothing (1430 is Tauri's WebDriver port, which needs `tauri-driver`, not a plain Playwright HTTP client). The plan already concedes macOS WebDriver is flaky; a wrong port guarantees the "smoke" spec is dead-on-arrival, making `phase-07:56` ("Playwright smoke passes in CI") either fake or perpetually red.
**Suggested fix:** For a browser-style smoke test, target the **Vite** server on `5173` with `command: pnpm dev` (not `tauri dev`) so Playwright drives the web UI directly; accept that this tests the React layer only, not the native shell (which the plan already assigns to manual QA). If true native E2E is wanted, that's `tauri-driver` + `WebdriverIO`, not this Playwright config — decide and correct the port.

---

## Credit where due (brief, for calibration)
- **v2-correct instincts:** capabilities-in-`capabilities/*.json` not `tauri.conf.json` (`phase-01:24`), `store:default` + `pnpm tauri add store` (`phase-01:50`, verified valid), `opener:default` (verified valid), `app_config_dir()` over hardcoded `~/Library` (`phase-02:60`) — all correct v2, not v1.
- **Right risk calls:** lazy TCC (`phase-03:54`), Warp launch-only tiering (`plan.md:37`), atomic tmp+rename writes (`phase-02:24`), partial-restore + retry (`phase-03:53`), `schema_version` seam from day one (`phase-02:61`), fine-grained shell ACL over blanket `shell:execute` (`phase-03:34`) — these are the correct hard calls and are well-placed.
- **Scaffold flags verified:** `--template react-ts`, `.` target, `--manager` are all real create-tauri-app flags; shadcn init on React 19 + pnpm needs no `--force`/`--legacy-peer-deps`. The stack choice itself is sound and current.

## Unresolved questions for the planner
1. Is an Apple Developer ID actually available for Phase 7 notarization (`plan.md:134`)? Without it, `phase-07:57`'s "opens without Gatekeeper warnings" criterion is unmeetable — decide now, not at release.
2. `deny_unknown_fields` on the Rust structs: yes or no? This silently dictates the entire forward/backward-compat story (see H3).
3. Single-active vs queued launches (`phase-05:26` open question) — unresolved but referenced by the launch-store design; pick before Phase 5.

---

Status: DONE_WITH_CONCERNS
Summary: The plan is well-structured and largely v2-correct, but rests on one provably-broken escaping template (RCE-adjacent) plus several unverified assumptions (scaffold-into-non-empty-dir, spawned-process PATH, detection reliability, contradictory <1s gate, dead Playwright port).
Findings: 1 critical, 4 high, 4 medium
Report: /Users/quoc/Workspace/quocnguyen2001/devdocks/plans/reports/from-code-reviewer-to-planner-red-team-assumption-feasibility-plan-review-report.md
