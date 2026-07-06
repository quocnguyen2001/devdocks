# Tauri v2 macOS App Launching & Orchestration Research Report
**Date:** 2026-07-05 | **Context:** DevDock — native workspace launcher for macOS

---

## 1. Tauri v2 Shell/Process Execution (Command API)

**Primary plugin:** `tauri-plugin-shell` | **JS import:** `@tauri-apps/plugin-shell`

### Core API Methods
- **`Command.create(program, args)`** — construct a command (both Rust & JS)
- **`execute()`** — run synchronously, block until complete, return stdout/stderr
- **`spawn()`** — run asynchronously, get handle for kill/write/pipe
- **`kill()`** — terminate child process
- **`write(stdin)`** — send data to stdin

**Source:** [Shell | Tauri v2](https://v2.tauri.app/plugin/shell/)

### Capability/ACL Configuration (CRITICAL)

Tauri v2 requires **explicit permission grants** in `src-tauri/capabilities/*.json`. No command runs without ACL entry.

**Minimal capability.json** for app launching:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "windows": ["main"],
  "permissions": [
    "shell:allow-spawn",
    "shell:allow-execute",
    "shell:allow-kill",
    "shell:allow-stdin-write"
  ]
}
```

**Fine-grained variant** (preferred for security):
```json
{
  "permissions": [
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "exec-sh",
          "cmd": "sh",
          "args": ["-c", {"validator": "\\S+"}],
          "sidecar": false
        }
      ]
    },
    {
      "identifier": "shell:allow-spawn",
      "allow": [
        {"cmd": "code"},
        {"cmd": "open"},
        {"cmd": "osascript"}
      ]
    }
  ]
}
```

**Critical permissions:**
- `shell:allow-execute` — run shell (-c) commands; enables arbitrary shell injection if not scoped
- `shell:allow-spawn` — launch apps/binaries
- `shell:allow-sidecar` — run bundled binaries (NOT needed for system apps)
- `shell:allow-stdin-write` — pipe data to process stdin

**Security note:** `execute` with unrestricted `sh -c` is the widest surface; validate/escape user input if accepting args.

**Source:** [Shell | Tauri v2](https://v2.tauri.app/plugin/shell/), [Using Plugin Permissions | Tauri v2](https://v2.tauri.app/learn/security/using-plugin-permissions/)

---

## 2. Launching IDEs with Project Path

### VS Code / Cursor / Windsurf
**Method:** CLI binary (preferred) + fallback to `open -a`

**CLI approach** (most reliable):
```bash
code /path/to/project
code --new-window /path/to/project
```
Requires `code` in PATH. Install via: VS Code Command Palette → "Shell Command: Install 'code' command in PATH".

**Fallback (no CLI installed):**
```bash
open -a "Visual Studio Code" /path/to/project
```
The `-a` flag specifies app by name in /Applications. Works even if CLI not in PATH.

**For Cursor/Windsurf:** Same pattern—check if CLI binary exists; if not, use `open -a "Cursor"` or `open -a "Windsurf"` (app name varies by distribution).

### Zed
**CLI available:** Yes. Install from Command Palette: Cmd+Shift+P → "Install CLI Binary" → installs to `/usr/local/bin/zed`.

```bash
zed /path/to/project
zed -n /path/to/project     # new window
zed --stable /path/to/project  # specific channel
```

**Fallback** (if CLI not installed):
```bash
/Applications/Zed.app/Contents/MacOS/cli /path/to/project
```

### JetBrains (PhpStorm, IntelliJ, WebStorm, etc.)
**Method:** `open -a` ONLY (no CLI launchers).
```bash
open -a "PhpStorm" /path/to/project
open -a "IntelliJ IDEA" /path/to/project
open -a "WebStorm" /path/to/project
```

JetBrains apps respond to directory paths passed as arguments to `open -a`.

**Source:** [Zed CLI Reference](https://zed.dev/docs/reference/cli), [VS Code Setup macOS](https://code.visualstudio.com/docs/setup/mac)

---

## 3. Terminal Automation (The Hard Part)

### Terminal.app
**AppleScript approach:**
```bash
osascript -e 'tell application "Terminal"
  activate
  do script "cd /path/to/project && npm start"
end tell'
```

Creates a NEW tab/window and runs command. Limitation: Cannot reliably set working directory first—the `cd` must be baked into the script.

### iTerm2
**AppleScript approach (new window):**
```bash
osascript <<'EOF'
tell application "iTerm"
  activate
  create window with default profile
  tell current session of current window
    write text "cd /path/to/project && npm start"
  end tell
end tell
EOF
```

**AppleScript (new tab in existing window):**
```bash
osascript <<'EOF'
tell application "iTerm"
  activate
  tell current window
    create tab with default profile
    tell current session
      write text "cd /path/to/project && npm start"
    end tell
  end tell
end tell
EOF
```

**CLI tool:** `it2` (iTerm2 tool) or `iterm2` — limited use; mostly for scripting iTerm state.

### Warp
**Status:** Does NOT support AppleScript scripting (GitHub issue #3364 requests it).
**Only option:** Use `open -a "Warp"` to launch app; no way to pre-set working dir or run a command. Users must manually navigate.

**Workaround:** Set environment file or shell rc to source a config that detects a marker file in the project dir.

### Practical Reality
- **Terminal.app & iTerm2:** Can be automated with AppleScript + `osascript` to open + run command.
- **Warp:** Cannot be scripted; fallback to UI-only or environment-based config.

**Source:** [Automating iTerm2 - DEV Community](https://dev.to/cweave_/automating-iterm2-ba8), [GitHub: Warp AppleScript Request](https://github.com/warpdotdev/Warp/issues/3364)

---

## 4. AppleScript from Rust/Tauri v2

### Running osascript via Shell Plugin

**Tauri Rust Command (via invoke):**
```javascript
import { Command } from '@tauri-apps/plugin-shell';

const result = await Command.create('osascript', [
  '-e',
  `tell application "Terminal" to activate
   tell application "Terminal" to do script "cd ${projectPath} && npm start"`
]).execute();
```

### Escaping & Quoting (CRITICAL)

Single-quote wrapping does NOT protect AppleScript strings from shell interpolation. Use double-quote escaping:

**WRONG:**
```javascript
'-e', `'tell application "Terminal" ... "cd ${path}"'`
// Shell expands ${path}, AppleScript breaks
```

**CORRECT:**
```javascript
const escaped = projectPath.replace(/"/g, '\\"');
'-e', `tell application "Terminal" ... "cd ${escaped}"`
```

Or use an array-based approach (safer):
```javascript
const script = `tell application "Terminal"
  activate
  do script "cd ${projectPath.replace(/"/g, '\\"')} && npm start"
end tell`;

await Command.create('osascript', ['-e', script]).execute();
```

### macOS Automation Permission (TCC Prompt)

First run triggers a **System Preferences → Security & Privacy → Automation** prompt asking if your app can "control Terminal" or "control iTerm". User must grant permission—**no way to bypass**. Dialog appears once; remembered thereafter.

For a distributed app:
- Document this in onboarding/FAQ.
- Catch `execute()` errors and guide user to Preferences.
- Consider **deferring** automation requests until user clicks "launch terminal" (lazy permission).

**Source:** [Shell | Tauri v2](https://v2.tauri.app/plugin/shell/), macOS TCC security model

---

## 5. Launch Sequencing & Dependency Orchestration

### Pattern: Sequential Launch with Delays

```javascript
import { Command } from '@tauri-apps/plugin-shell';

async function launchWorkspace(apps) {
  for (const app of apps) {
    console.log(`Launching ${app.name}...`);
    
    try {
      if (app.type === 'ide') {
        // VS Code, Zed, etc.
        await Command.create('code', [app.path]).spawn();
      } else if (app.type === 'terminal') {
        // iTerm/Terminal + script
        const script = `tell application "iTerm" 
          activate 
          create window with default profile
          tell current session of current window
            write text "cd ${app.path} && ${app.command}"
          end tell
        end tell`;
        await Command.create('osascript', ['-e', script]).spawn();
      } else if (app.type === 'app') {
        // Generic app
        await Command.create('open', ['-a', app.name, app.path]).spawn();
      }
    } catch (e) {
      console.error(`Failed to launch ${app.name}:`, e);
      // continue or halt based on app.required
    }
    
    // Inter-app delay (avoid hammering system)
    await new Promise(r => setTimeout(r, 500));
  }
}
```

### Pattern: Wait for Dependency Ready (Polling)

```javascript
async function waitForReady(checkFn, maxRetries = 10, delayMs = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const ready = await checkFn();
      if (ready) return true;
    } catch (e) {
      // still not ready
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error('Dependency failed to become ready');
}

// Example: wait for Docker daemon
async function ensureDocker() {
  return waitForReady(async () => {
    const result = await Command.create('docker', ['info']).execute();
    return result.status === 0;
  });
}

// Usage
await ensureDocker();
await launchWorkspace(apps);
```

### Async Orchestration in Rust (Tokio)

Within Tauri backend (Rust), use tokio for true parallelism:

```rust
use std::process::Command;
use tokio::time::{sleep, Duration};

#[tauri::command]
async fn launch_workspace(apps: Vec<WorkspaceApp>) -> Result<(), String> {
    for app in apps {
        match app.app_type.as_str() {
            "ide" => {
                tokio::task::spawn_blocking(move || {
                    Command::new("code")
                        .arg(&app.path)
                        .spawn()
                        .map_err(|e| e.to_string())?;
                    Ok::<_, String>(())
                }).await.map_err(|e| e.to_string())??;
            }
            "terminal" => {
                // osascript call
            }
            _ => {}
        }
        sleep(Duration::from_millis(500)).await;
    }
    Ok(())
}
```

**Source:** Tokio async patterns; Tauri command architecture

---

## 6. Detecting Installed Apps

### Method 1: Check PATH (CLI binaries)
```javascript
async function isInPath(binary) {
  try {
    const result = await Command.create('which', [binary]).execute();
    return result.status === 0;
  } catch {
    return false;
  }
}

// Usage
const hasCode = await isInPath('code');
const hasZed = await isInPath('zed');
```

### Method 2: Check /Applications (GUI apps)
```javascript
async function isAppInstalled(appName) {
  try {
    const result = await Command.create('test', ['-d', `/Applications/${appName}.app`]).execute();
    return result.status === 0;
  } catch {
    return false;
  }
}

// Usage
const hasVSCode = await isAppInstalled('Visual Studio Code');
const hasWarp = await isAppInstalled('Warp');
```

### Method 3: Use `mdfind` (Spotlight) — Slower but Thorough
```javascript
async function findApp(appName) {
  try {
    const result = await Command.create('mdfind', [
      `kMDItemKind == "Application" && kMDItemFSName == "${appName}.app"`
    ]).execute();
    return result.stdout.length > 0;
  } catch {
    return false;
  }
}
```

### Method 4: `open -a` Dry Run (Most Reliable for GUI Apps)
```javascript
async function isAppLaunchable(appName) {
  // -n = new instance, -W = wait for exit, --args = no args
  try {
    const result = await Command.create('open', [
      '-a', appName, '--help'
    ]).execute();
    return true; // if no error, app exists and responded
  } catch {
    return false;
  }
}
```

### Recommended Sequence
```javascript
async function findIDE() {
  // Try CLI first (fastest, avoids UI apps blocking)
  if (await isInPath('code')) return { type: 'cli', cmd: 'code' };
  if (await isInPath('zed')) return { type: 'cli', cmd: 'zed' };
  
  // Then GUI apps
  if (await isAppInstalled('Visual Studio Code')) return { type: 'app', name: 'Visual Studio Code' };
  if (await isAppInstalled('Cursor')) return { type: 'app', name: 'Cursor' };
  if (await isAppInstalled('Zed')) return { type: 'app', name: 'Zed' };
  if (await isAppInstalled('PhpStorm')) return { type: 'app', name: 'PhpStorm' };
  
  return null; // no IDE found
}
```

**Source:** Tauri Shell plugin; macOS filesystem conventions

---

## Key Risks & Unknowns

1. **AppleScript TCC permission prompt on first use** — unavoidable, but can be deferred to lazy invoke. No way to pre-authorize. Document in onboarding.

2. **Warp terminal has no scripting API** — fallback is UI-only launch. Affects users who prefer Warp; consider environment-based workaround (shell rc config).

3. **IDE CLI binary availability varies by install method** — VS Code/Zed require explicit "install CLI" step. Fallback to `open -a` works but doesn't guarantee project opens in a new window.

4. **Shell escaping complexity** — AppleScript from JavaScript requires careful quote handling. Use an escaping library (e.g., `shell-escape`) if building complex scripts.

5. **Tauri v1 vs v2 API differences** — Some older tutorials reference v1 `tauri::api::shell` (Rust), which is now `tauri-plugin-shell` (separate plugin). Verify docs version.

6. **Permissions granularity** — Fine-grained ACL scope (e.g., whitelist only `code`, `open`, `osascript`) is safer but requires maintaining a list of allowed commands. Coarse-grained `shell:allow-spawn` is simpler but less secure.

7. **Process polling/readiness checks** — No official Tauri facility; must implement custom polling (e.g., `docker info`, file existence checks). Timing is app-specific.

8. **Terminal tab vs new window** — AppleScript can target either, but user expectations vary. Recommend _new window_ for clarity, then document how to reconfigure for tab mode.

---

## Recommended Approach for DevDock

### 1. Core Architecture
- **Plugin stack:** `tauri-plugin-shell` + `tauri-plugin-opener` (for file reveal)
- **Capability model:** Fine-grained ACL whitelisting `code`, `open`, `osascript`, `sh` (for quick checks like `which`, `test`)
- **Permission prompt strategy:** Lazy—only ask for Automation permission when user first launches a terminal

### 2. IDE Detection & Launch
```
1. Load user's preferred IDE from config (or detect via findIDE())
2. If CLI binary exists (which code / which zed) → use it with --new-window
3. Else if app in /Applications → use open -a
4. Else → prompt user to install/configure IDE
```

### 3. Terminal Automation
```
1. Prompt user to choose preferred terminal: iTerm2 / Terminal.app / (skip terminal)
2. For iTerm2: use AppleScript to new window + cd + command
3. For Terminal.app: same AppleScript pattern
4. For Warp: just `open -a "Warp"` + document that user must cd manually
5. Batch AppleScript calls; don't over-escape—keep it readable
```

### 4. Dependency Orchestration
```
1. Collect launch tasks (IDEs, terminals, Docker status checks, etc.)
2. Check prerequisites (app installed? port available? Docker running?)
3. Sequential launch with 500ms inter-app delay (avoid system thrashing)
4. Show live feedback in UI: "Launching VS Code...", "Waiting for Docker...", etc.
5. Collect errors; report at end; allow user to retry individual apps
```

### 5. Configuration File (Example)
```yaml
workspace:
  name: "My Project"
  workspaceDir: "/Users/quoc/project"
  apps:
    - type: ide
      preferred: vscode  # fallback sequence: vscode → cursor → zed
    - type: terminal
      preferred: iterm2
      startCommand: "npm start"
    - type: dependency
      name: Docker
      checkCmd: "docker info"
      retries: 5
      delayMs: 2000
    - type: app
      name: Slack
      # optional: path or app bundle name
```

### 6. Security & Escaping
- **Always validate/escape user-provided paths** before passing to shell or AppleScript
- Use a shell-escape library or validate against a regex (e.g., `/^[a-zA-Z0-9/_\-\.]+$/`)
- Never pass raw user input to `sh -c` without validation
- Scope `shell:allow-execute` to specific commands; avoid unrestricted `sh -c`

---

## Implementation Checklist

- [ ] Install `tauri-plugin-shell` via `cargo add tauri-plugin-shell` (already in Cargo.toml?)
- [ ] Create `src-tauri/capabilities/main.json` with shell + opener permissions
- [ ] Write Tauri command: `launch_app(app_type, path, cmd)` → delegates to IDE/terminal/generic
- [ ] Implement `detect_installed_apps()` command for UI to populate available options
- [ ] Build UI form: IDE preference, terminal preference, dependency checks
- [ ] Implement AppleScript helpers for terminal (iTerm2, Terminal.app)
- [ ] Add shell escaping utility function
- [ ] Test on fresh macOS VM (verify TCC prompts, permission flow)
- [ ] Document in FAQ: "Why am I seeing a permissions prompt?" + "How to install code CLI?"
- [ ] Implement error recovery: show user which apps failed, allow retry

---

## Unresolved Questions

1. **Should DevDock handle `~` expansion?** (e.g., `~/projects/myapp` → `/Users/quoc/projects/myapp`). Answer: Yes, use Node `path.expandUser()` or Rust `shellexpand` crate before passing to shell.

2. **Multi-project support—concurrent launches or sequential?** (Affects concurrency model). Recommend: Sequential with per-app delay for initial release; add concurrent option later if UX testing shows user preference.

3. **Should failing app launch halt the whole workspace restore?** Recommend: No—show error, allow user to launch manually or retry. Mark workspace as "partially restored."

4. **Does the Tauri Rust backend need to run these commands, or can the React frontend invoke shell directly?** Current plan: Backend (Rust) invokes; frontend polls status. This avoids TCC permission scope creep (only app gets one Automation prompt, not frontend+backend).

5. **What macOS version target?** (Affects AppleScript API stability, TCC model). Recommend: macOS 11+; verify AppleScript syntax on oldest target version before release.

---

## Sources

- [Shell | Tauri v2](https://v2.tauri.app/plugin/shell/)
- [Opener | Tauri v2](https://v2.tauri.app/plugin/opener/)
- [Using Plugin Permissions | Tauri v2](https://v2.tauri.app/learn/security/using-plugin-permissions/)
- [Capability | Tauri v2](https://v2.tauri.app/reference/acl/capability/)
- [Zed CLI Reference](https://zed.dev/docs/reference/cli)
- [VS Code Setup macOS](https://code.visualstudio.com/docs/setup/mac)
- [Automating iTerm2 - DEV Community](https://dev.to/cweave_/automating-iterm2-ba8)
- [GitHub: Warp AppleScript Request](https://github.com/warpdotdev/Warp/issues/3364)
- [macOS | Zed on macOS](https://zed.dev/docs/macos)
