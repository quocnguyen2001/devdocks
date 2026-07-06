# DevDock FAQ

## I closed the window but the app is still running

DevDock is a **menu-bar app**: closing the window **hides it to the menu bar** so
quick actions stay available in the background. **Left-click** the tray icon to
open the quick-launch popover; choose **Open DevDock** (or **right-click** the
tray → Open DevDock) to bring the window back; use **⌘Q** or the tray **Quit** to
exit completely. (Clicking the Dock icon to reopen isn't wired yet — use the tray.)

## Why did macOS ask to control Terminal / iTerm?

DevDock automates your terminal via AppleScript to open a window, `cd` to your
project, and run your startup command. macOS shows a one-time **Automation**
permission prompt (**System Settings → Privacy & Security → Automation**). Grant
it, or terminal launches will fail with a message pointing you here.

## An installed IDE/app shows as "not found"

DevDock detects CLIs on your **login-shell PATH** and apps in `/Applications`,
`~/Applications`, and via Spotlight. If a tool isn't detected:

- **VS Code / Zed / Cursor**: install the shell command (VS Code → Command
  Palette → "Shell Command: Install 'code' command in PATH"; Zed → "Install CLI
  Binary").
- Or set a **custom path override** for the tool in the workspace editor.

## Warp doesn't run my command

Warp has no scripting API, so DevDock can only **launch** it — it can't auto-`cd`
or run a command. Use **iTerm2** or **Terminal.app** for full automation, or run
your command manually in Warp.

## My before-close hook didn't run

Before-close hooks are **best-effort** and run only on a graceful quit. A
**force-quit, crash, or logout won't run them** — macOS doesn't wait for
asynchronous commands during shutdown. Don't rely on them for critical teardown.

## Are environment variables secret?

No. Workspace env vars are stored in the workspace's JSON config and injected
into launched terminals via the shell — they land in your shell history and
process environment. Treat them as configuration, not secrets.

## The app warns it's from an unidentified developer

If you're running an unsigned build, macOS Gatekeeper blocks it on first open.
Right-click the app → **Open** → **Open** to allow it. Notarized builds (which
require an Apple Developer ID) open without this step.
