//! Executors for resolved launch actions. Processes are spawned via
//! `tokio::process` with argv arrays (no shell) — except the terminal path, which
//! uses the audited two-layer escaping in `escape`. Every spawn runs with the
//! hydrated login-shell PATH.

use std::path::Path;
use std::time::Duration;

use tokio::process::Command;
use tokio::time::{sleep, timeout};

use crate::launch::run_plan::ResolvedAction;
use crate::launch::{escape, path_env, StepOutcome, StepStatus, TermApp};
use crate::models::workspace::OnTimeout;

fn cmd(program: &str) -> Command {
    let mut c = Command::new(program);
    c.env("PATH", path_env::login_path());
    c
}

/// Execute one resolved action → its outcome.
pub async fn run_action(action: &ResolvedAction) -> StepOutcome {
    match action {
        ResolvedAction::Skip { reason } => StepOutcome::skipped(reason.clone()),
        ResolvedAction::OpenApp { app_name, args } => open_app(app_name, args).await,
        ResolvedAction::RunCli { bin, args } => run_cli(bin, args),
        ResolvedAction::WarpLaunchOnly => warp_launch().await,
        ResolvedAction::OpenUrl { browser, url } => open_url(browser.as_deref(), url).await,
        ResolvedAction::Terminal {
            term,
            cwd,
            command,
            env,
        } => run_terminal(*term, cwd, command, env).await,
        ResolvedAction::DependencyWait {
            start_app,
            check_cmd,
            timeout_secs,
            poll_ms,
            on_timeout,
        } => {
            dependency_wait(
                start_app.as_deref(),
                check_cmd.as_deref(),
                *timeout_secs,
                *poll_ms,
                *on_timeout,
            )
            .await
        }
        ResolvedAction::Hook {
            command,
            cwd,
            timeout_secs,
            env,
        } => run_hook(command, cwd.as_deref(), *timeout_secs, env).await,
    }
}

/// Run a user lifecycle hook: `sh -c <command>` with injected env, optional cwd,
/// bounded by a timeout. `command` is one argv arg to `sh` (no injection at the
/// invocation level — it is shell by the user's intent); env is passed via the
/// process environment, never string-composed.
pub async fn run_hook(
    command: &str,
    cwd: Option<&Path>,
    timeout_secs: u64,
    env: &[(String, String)],
) -> StepOutcome {
    let mut c = cmd("sh");
    c.args(["-c", command]);
    c.kill_on_drop(true); // a timed-out hook is killed when the future is dropped
    for (k, v) in env {
        c.env(k, v);
    }
    if let Some(dir) = cwd {
        c.current_dir(dir);
    }
    match timeout(Duration::from_secs(timeout_secs.max(1)), c.status()).await {
        Ok(Ok(status)) if status.success() => StepOutcome::ok(),
        Ok(Ok(status)) => StepOutcome::failed(format!("hook exited with status {status}")),
        Ok(Err(e)) => StepOutcome::failed(format!("hook failed to run: {e}")),
        Err(_) => StepOutcome::failed(format!("hook timed out after {timeout_secs}s")),
    }
}

/// Run a short-lived process (like `open`) and await its exit status.
async fn spawn_status(program: &str, args: &[String]) -> StepOutcome {
    match cmd(program).args(args).status().await {
        Ok(s) if s.success() => StepOutcome::ok(),
        Ok(s) => StepOutcome::failed(format!("{program} exited with status {s}")),
        Err(e) => StepOutcome::failed(format!("failed to run {program}: {e}")),
    }
}

async fn open_app(app_name: &str, args: &[String]) -> StepOutcome {
    // Defense in depth: validate the display name (custom names come from Phase 4).
    if escape::validate_app_name(app_name).is_err() {
        return StepOutcome::failed(format!("invalid app name: {app_name}"));
    }
    // Prevent `open` option-injection: a file arg starting with `-` would be read
    // as an `open` flag (review M2). Current args are canonical dirs; this guards
    // Phase 4 custom args.
    if args.iter().any(|a| a.starts_with('-')) {
        return StepOutcome::failed("app arguments must not start with '-'");
    }
    let mut argv = vec!["-a".to_string(), app_name.to_string()];
    argv.extend_from_slice(args);
    spawn_status("open", &argv).await
}

fn run_cli(bin: &str, args: &[String]) -> StepOutcome {
    // Launch detached; do not await the (long-lived) editor process.
    match cmd(bin).args(args).spawn() {
        Ok(_child) => StepOutcome::ok(),
        Err(e) => StepOutcome::failed(format!("failed to launch {bin}: {e}")),
    }
}

async fn warp_launch() -> StepOutcome {
    let out = spawn_status("open", &["-a".to_string(), "Warp".to_string()]).await;
    if out.status == StepStatus::Ok {
        StepOutcome::skipped("Warp launched — it can't auto-run cwd/command; set them manually")
    } else {
        out
    }
}

async fn open_url(browser: Option<&str>, url: &str) -> StepOutcome {
    if escape::validate_http_url(url).is_err() {
        return StepOutcome::failed(format!("only http(s) URLs are allowed: {url}"));
    }
    let argv = match browser {
        Some(b) => {
            if escape::validate_app_name(b).is_err() {
                return StepOutcome::failed(format!("invalid browser: {b}"));
            }
            vec!["-a".to_string(), b.to_string(), url.to_string()]
        }
        None => vec![url.to_string()],
    };
    spawn_status("open", &argv).await
}

async fn run_terminal(
    term: TermApp,
    cwd: &Path,
    command: &str,
    env: &[(String, String)],
) -> StepOutcome {
    let script = match escape::build_terminal_applescript(term, cwd, command, env) {
        Ok(s) => s,
        Err(e) => return StepOutcome::failed(e.to_string()),
    };
    match cmd("osascript").args(["-e", &script]).output().await {
        Ok(out) if out.status.success() => StepOutcome::ok(),
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            // Classify TCC denial vs a generic AppleScript error (red-team M2).
            if stderr.contains("-1743")
                || stderr.contains("errAEEventNotPermitted")
                || stderr.contains("Not authorized")
            {
                StepOutcome::failed(
                    "macOS Automation permission denied — grant it in System Settings → \
                     Privacy & Security → Automation, then retry",
                )
            } else {
                StepOutcome::failed(format!(
                    "terminal automation failed: {}",
                    redact_env(stderr.trim(), env)
                ))
            }
        }
        Err(e) => StepOutcome::failed(format!("failed to run osascript: {e}")),
    }
}

/// Redact env var values from a surfaced error string (red-team H2). Skips very
/// short values (e.g. "1", "true") to avoid mangling the message (review M4).
fn redact_env(msg: &str, env: &[(String, String)]) -> String {
    let mut out = msg.to_string();
    for (_, v) in env {
        if v.len() >= 4 {
            out = out.replace(v.as_str(), "***");
        }
    }
    out
}

async fn dependency_wait(
    start_app: Option<&str>,
    check_cmd: Option<&str>,
    timeout_secs: u64,
    poll_ms: u64,
    on_timeout: OnTimeout,
) -> StepOutcome {
    if let Some(app) = start_app {
        // Best-effort start; readiness is decided by the poll below.
        let _ = spawn_status("open", &["-a".to_string(), app.to_string()]).await;
    }
    let Some(check) = check_cmd else {
        return StepOutcome::ok(); // start-only, nothing to wait for
    };
    // Split into program + args and run via argv (no shell). Suitable for simple
    // checks like `docker info`.
    let parts: Vec<String> = check.split_whitespace().map(String::from).collect();
    let Some((program, args)) = parts.split_first() else {
        return StepOutcome::ok();
    };
    let program = program.clone();
    let args = args.to_vec();
    let poll = Duration::from_millis(poll_ms.max(1));

    let ready = timeout(Duration::from_secs(timeout_secs), async {
        loop {
            if let Ok(status) = cmd(&program).args(&args).status().await {
                if status.success() {
                    return;
                }
            }
            sleep(poll).await;
        }
    })
    .await;

    match ready {
        Ok(()) => StepOutcome::ok(),
        Err(_) => match on_timeout {
            OnTimeout::Continue => StepOutcome::skipped(format!(
                "`{check}` not ready after {timeout_secs}s; continuing"
            )),
            OnTimeout::SkipDependents | OnTimeout::FailRun => {
                StepOutcome::failed(format!("`{check}` not ready after {timeout_secs}s"))
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn hook_success() {
        assert_eq!(run_hook("true", None, 5, &[]).await.status, StepStatus::Ok);
    }

    #[tokio::test]
    async fn hook_nonzero_exit_reports_failure() {
        assert_eq!(
            run_hook("exit 3", None, 5, &[]).await.status,
            StepStatus::Failed
        );
    }

    #[tokio::test]
    async fn hook_timeout_is_reported() {
        let out = run_hook("sleep 5", None, 1, &[]).await;
        assert_eq!(out.status, StepStatus::Failed);
        assert!(out.message.unwrap().contains("timed out"));
    }

    #[tokio::test]
    async fn hook_env_is_injected() {
        let env = vec![("DEVDOCK_TEST".to_string(), "yes".to_string())];
        let out = run_hook("test \"$DEVDOCK_TEST\" = yes", None, 5, &env).await;
        assert_eq!(out.status, StepStatus::Ok);
    }
}
