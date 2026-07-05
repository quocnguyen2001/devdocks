//! The escaping / validation boundary — the sole security control for the
//! terminal AppleScript path, which crosses TWO interpreters: `osascript` parses
//! the AppleScript string, and `do script` / `write text` then hands its payload
//! to `/bin/sh`. A quote-only escape is a NO-OP against `$(...)`, backticks, `;`,
//! `|`, `\`, and newlines. The two-layer contract below (shell-quote inner tokens,
//! then AppleScript-escape the whole line) is the gating control — see the
//! injection corpus in the tests, which must stay exhaustive.

use std::path::{Path, PathBuf};

use crate::launch::{LaunchError, TermApp};

/// True if the string contains a newline, carriage return, or NUL — none of which
/// may appear in a composed terminal command line or an AppleScript literal.
fn has_line_break_or_nul(s: &str) -> bool {
    s.chars().any(|c| c == '\n' || c == '\r' || c == '\0')
}

/// Shell-quote a string as a single-quoted POSIX token. Everything inside single
/// quotes is literal; an embedded single quote becomes `'\''`. The result is
/// inert to the shell — no expansion, no command substitution, no word splitting.
pub fn shell_quote_single(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for ch in s.chars() {
        if ch == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(ch);
        }
    }
    out.push('\'');
    out
}

/// Escape a string for use inside an AppleScript double-quoted string literal.
/// Backslash MUST be escaped first, then the double quote.
pub fn applescript_string_literal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            _ => out.push(ch),
        }
    }
    out
}

/// Validate an env var name as a POSIX shell identifier so it is safe to place
/// before `export NAME=...`.
fn shell_env_key(k: &str) -> Result<&str, LaunchError> {
    let valid = !k.is_empty()
        && k.chars()
            .next()
            .map(|c| c.is_ascii_alphabetic() || c == '_')
            .unwrap_or(false)
        && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if valid {
        Ok(k)
    } else {
        Err(LaunchError::Escape(format!("invalid env var name: {k}")))
    }
}

/// Compose the shell line run inside a terminal: `export K='v'; … cd '<cwd>' && <command>`.
/// `cwd` and env values are single-quoted shell tokens; `command` is intentionally
/// RAW (it IS the user's shell command).
fn compose_shell_line(
    cwd: &Path,
    command: &str,
    env: &[(String, String)],
) -> Result<String, LaunchError> {
    if has_line_break_or_nul(command) {
        return Err(LaunchError::Escape(
            "terminal command contains a newline".into(),
        ));
    }
    let mut line = String::new();
    for (k, v) in env {
        if has_line_break_or_nul(v) {
            return Err(LaunchError::Escape(format!(
                "env var '{k}' value contains a newline"
            )));
        }
        line.push_str(&format!(
            "export {}={}; ",
            shell_env_key(k)?,
            shell_quote_single(v)
        ));
    }
    let cwd_token = shell_quote_single(&cwd.to_string_lossy());
    line.push_str(&format!("cd {cwd_token} && {command}"));
    Ok(line)
}

/// Build the full `osascript` program that opens a new terminal window in
/// `term_app`, cd's to `cwd`, exports `env`, and runs `command`. The whole
/// composed shell line is AppleScript-escaped as the second layer.
pub fn build_terminal_applescript(
    term_app: TermApp,
    cwd: &Path,
    command: &str,
    env: &[(String, String)],
) -> Result<String, LaunchError> {
    let line = compose_shell_line(cwd, command, env)?;
    let escaped = applescript_string_literal(&line);
    let script = match term_app {
        TermApp::Iterm2 => format!(
            "tell application \"iTerm\"\n\
             activate\n\
             create window with default profile\n\
             tell current session of current window\n\
             write text \"{escaped}\"\n\
             end tell\n\
             end tell"
        ),
        TermApp::Terminal => format!(
            "tell application \"Terminal\"\n\
             activate\n\
             do script \"{escaped}\"\n\
             end tell"
        ),
    };
    Ok(script)
}

/// Resolve a workspace-relative or `~`-prefixed directory against `base`,
/// canonicalize it, and assert it is an existing directory. Returns the canonical
/// path. Injection safety comes from single-quoting the result downstream (not
/// from canonicalization); this function's job is to catch missing/moved/traversal
/// paths cleanly (a swap-after-check TOCTOU only changes the `cd` target, never
/// executes — the value is always quoted and only used as a `cd` argument).
pub fn resolve_dir(input: &str, base: &Path) -> Result<PathBuf, LaunchError> {
    if has_line_break_or_nul(input) {
        return Err(LaunchError::Escape("path contains a newline".into()));
    }
    let expanded = shellexpand::tilde(input).to_string();
    let p = Path::new(&expanded);
    let joined = if p.is_absolute() {
        p.to_path_buf()
    } else {
        base.join(p)
    };
    let canon = std::fs::canonicalize(&joined)
        .map_err(|_| LaunchError::PathNotFound(joined.to_string_lossy().into_owned()))?;
    if !canon.is_dir() {
        return Err(LaunchError::PathNotFound(
            canon.to_string_lossy().into_owned(),
        ));
    }
    Ok(canon)
}

/// Validate a user-supplied application/browser display name so it is safe to
/// pass as an `open -a <name>` argv argument. Rejects path separators, `..`, and
/// control characters.
pub fn validate_app_name(name: &str) -> Result<&str, LaunchError> {
    let valid = !name.is_empty()
        && !name.contains('/')
        && !name.contains("..")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, ' ' | '.' | '_' | '-'));
    if valid {
        Ok(name)
    } else {
        Err(LaunchError::Escape(format!("invalid app name: {name}")))
    }
}

/// Validate a browser URL: only `http`/`https` schemes (blocks `file://`,
/// `x-apple.systempreferences:`, and arbitrary URL-handler schemes).
pub fn validate_http_url(url: &str) -> Result<&str, LaunchError> {
    if (url.starts_with("http://") || url.starts_with("https://")) && !has_line_break_or_nul(url) {
        Ok(url)
    } else {
        Err(LaunchError::Escape(format!(
            "only http(s) URLs are allowed: {url}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- shell single-quoting: the inner layer ---

    #[test]
    fn shell_quote_wraps_and_is_inert() {
        assert_eq!(shell_quote_single("plain"), "'plain'");
        // Command substitution / metacharacters are literal inside single quotes.
        assert_eq!(shell_quote_single("$(rm -rf ~)"), "'$(rm -rf ~)'");
        assert_eq!(shell_quote_single("`id`"), "'`id`'");
        assert_eq!(shell_quote_single("a; b | c && d"), "'a; b | c && d'");
    }

    #[test]
    fn shell_quote_handles_embedded_single_quote() {
        // a'b  ->  'a'\''b'
        assert_eq!(shell_quote_single("a'b"), "'a'\\''b'");
    }

    // --- injection corpus: no payload can break out of the composed line ---

    // Benign baseline: the AppleScript template contributes fixed quotes (the
    // `"iTerm"`/`"Terminal"` app-name literal + the script-literal delimiters).
    // The safety property is that a malicious payload, staying escaped, adds ZERO
    // unescaped quotes beyond this baseline — an injected bare `"` would raise it.
    fn baseline_quote_count(term: TermApp) -> usize {
        let s = build_terminal_applescript(term, Path::new("/tmp"), "echo hi", &[]).unwrap();
        count_unescaped_double_quotes(&s)
    }

    #[test]
    fn terminal_script_neutralizes_cwd_injection() {
        let payloads = [
            "/tmp/$(touch /tmp/pwned)",
            "/tmp/`touch /tmp/pwned`",
            "/tmp/x; rm -rf ~",
            "/tmp/x\" ; rm -rf ~ ; \"",
            "/tmp/x' ; rm -rf ~ ; '",
            "/tmp/x\\bad",
        ];
        let baseline = baseline_quote_count(TermApp::Terminal);
        for p in payloads {
            let cwd = Path::new(p);
            // Shell layer: the payload is a single-quoted, inert token in the line.
            let line = compose_shell_line(cwd, "echo hi", &[]).unwrap();
            assert!(
                line.contains(&shell_quote_single(p)),
                "cwd payload {p:?} not single-quoted in shell line: {line}"
            );
            // AppleScript layer: the payload adds no unescaped quote (stays escaped).
            let script =
                build_terminal_applescript(TermApp::Terminal, cwd, "echo hi", &[]).unwrap();
            assert_eq!(
                count_unescaped_double_quotes(&script),
                baseline,
                "cwd payload {p:?} produced unbalanced quotes: {script}"
            );
        }
    }

    #[test]
    fn terminal_script_rejects_newline_in_command() {
        let cwd = Path::new("/tmp");
        assert!(build_terminal_applescript(TermApp::Iterm2, cwd, "echo a\nrm -rf ~", &[]).is_err());
    }

    #[test]
    fn terminal_script_escapes_double_quotes_in_command() {
        // A raw command with a double quote must be AppleScript-escaped so it does
        // not terminate the `write text "..."` literal early.
        let cwd = Path::new("/tmp");
        let script = build_terminal_applescript(TermApp::Iterm2, cwd, "echo \"hi\"", &[]).unwrap();
        assert_eq!(
            count_unescaped_double_quotes(&script),
            baseline_quote_count(TermApp::Iterm2),
            "{script}"
        );
        assert!(script.contains("echo \\\"hi\\\""));
    }

    #[test]
    fn env_values_are_quoted_and_keys_validated() {
        let cwd = Path::new("/tmp");
        let env = vec![("API_KEY".to_string(), "secret'; rm -rf ~; '".to_string())];
        let script = build_terminal_applescript(TermApp::Terminal, cwd, "echo hi", &env).unwrap();
        assert!(script.contains("export API_KEY="));
        assert_eq!(
            count_unescaped_double_quotes(&script),
            baseline_quote_count(TermApp::Terminal),
            "{script}"
        );
        // Invalid key rejected.
        let bad = vec![("BAD KEY".to_string(), "v".to_string())];
        assert!(build_terminal_applescript(TermApp::Terminal, cwd, "echo hi", &bad).is_err());
    }

    // --- app name + URL validation ---

    #[test]
    fn app_name_validation() {
        assert!(validate_app_name("Visual Studio Code").is_ok());
        assert!(validate_app_name("iTerm2").is_ok());
        assert!(validate_app_name("x.app; rm -rf ~").is_err());
        assert!(validate_app_name("../evil").is_err());
        assert!(validate_app_name("a/b").is_err());
        assert!(validate_app_name("").is_err());
    }

    #[test]
    fn url_scheme_validation() {
        assert!(validate_http_url("https://example.com").is_ok());
        assert!(validate_http_url("http://localhost:3000").is_ok());
        assert!(validate_http_url("file:///etc/passwd").is_err());
        assert!(validate_http_url("x-apple.systempreferences:foo").is_err());
        assert!(validate_http_url("javascript:alert(1)").is_err());
    }

    // Count double-quote chars NOT immediately preceded by a backslash.
    fn count_unescaped_double_quotes(s: &str) -> usize {
        let bytes = s.as_bytes();
        let mut count = 0;
        for (i, &b) in bytes.iter().enumerate() {
            if b == b'"' && (i == 0 || bytes[i - 1] != b'\\') {
                count += 1;
            }
        }
        count
    }
}
