# DevDock

A native macOS app that restores your entire developer workspace with **one click** —
IDE, terminals (with working directory + startup command), AI tools, supporting apps,
Docker, and browser URLs, launched in a configurable, ordered sequence.

Local-first: every workspace is a plain JSON file on your machine. No account, no server.

## Features

- One-click launch of IDE / terminals / apps / AI tools / browser URLs
- Per-terminal working directory + startup command (iTerm2 & Terminal.app; Warp is launch-only)
- Wait-for-dependency (e.g. start Docker Desktop, then poll `docker info`)
- Before/after-launch and before-close hooks, plus workspace environment variables
- Live launch progress with partial-restore + per-step retry
- **Menu bar extra** — a tray icon opens a quick-launch popover (search + recent, keyboard-driven); closing the window hides the app to the menu bar (⌘Q to quit)
- Light / dark / system theming; keyboard-friendly

## Tech stack

Tauri v2 · Rust · React 19 · TypeScript · Vite · Tailwind CSS v4 · Zustand ·
React Hook Form + Zod · Motion. See [`docs/system-architecture.md`](docs/system-architecture.md).

## Prerequisites

- **macOS** (Apple Silicon or Intel)
- **Xcode Command Line Tools** — `xcode-select --install`
- **Rust** (stable) — install via [rustup](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js ≥ 22**
- **pnpm 11.2.2** — pinned in `package.json`; the easiest way is Corepack: `corepack enable`

## Getting started

```bash
git clone https://github.com/quocnguyen2001/devdocks.git
cd devdocks

corepack enable        # provides the pinned pnpm 11.2.2
pnpm install           # installs JS deps (Rust crates build on first `tauri` run)
```

> The repo's `pnpm-workspace.yaml` already allows esbuild's build script and disables
> pnpm's pre-run dependency check, so `pnpm install` works without extra prompts.

## Development

```bash
pnpm tauri dev
```

This starts the Vite dev server (port **1420**) and opens the DevDock window with
hot-reload. The Rust backend recompiles automatically on change.

> **macOS Automation prompt:** the first time you launch a terminal from a workspace,
> macOS asks DevDock for permission to control iTerm2 / Terminal (Automation). Grant it
> in **System Settings → Privacy & Security → Automation**. See [`docs/faq.md`](docs/faq.md).

Workspaces are stored at `~/Library/Application Support/com.devdock.app/workspaces/*.json`.

## Testing

```bash
pnpm test                       # frontend unit tests (Vitest)
cd src-tauri && cargo test      # Rust unit tests (models, storage, escaping)

# Rust lint / format (also enforced in CI)
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings

# E2E smoke against the Vite web UI (React layer only; native shell is manual QA)
pnpm exec playwright install    # one-time browser download
pnpm test:e2e
```

## Building

```bash
pnpm tauri build            # optimized release bundle (.app + .dmg)
pnpm tauri build --debug    # faster, unoptimized bundle for quick checks
```

Artifacts are written to `src-tauri/target/release/bundle/`:
- `macos/DevDock.app`
- `dmg/DevDock_<version>_<arch>.dmg`

> An **unsigned** local build works fine, but Gatekeeper flags it on first open —
> right-click the app → **Open** once to allow it.

## Release (signed + notarized)

`.github/workflows/release.yml` runs on a `v*` tag, builds a **universal** binary, and
(if the Apple secrets below are set) code-signs + notarizes it and drafts a GitHub Release.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Required repository secrets for a Gatekeeper-clean build (needs an Apple Developer ID):
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`. Without them the `.dmg` still builds, just unsigned.

## Project structure

```text
src/                    React 19 frontend
  components/           app + shadcn-style UI primitives
  features/             dashboard, workspace-config, launch
  hooks/  lib/  store/  types/
src-tauri/              Rust backend
  src/
    models/             serde workspace model (source of truth)
    storage/            JSON repo + migrations
    launch/             orchestrator, launchers, escaping, detection, PATH hydration
    commands/           #[tauri::command] handlers
  capabilities/         Tauri v2 ACL
  tauri.conf.json  Cargo.toml
.github/workflows/      ci.yml (test/lint), release.yml (sign + notarize)
docs/                   architecture, FAQ, changelog
plans/                  phased implementation plan + research/red-team reports
```

## Documentation

- [System architecture](docs/system-architecture.md) — stack, data flow, key decisions
- [FAQ](docs/faq.md) — Automation permission, installing IDE CLIs, Warp limitation
- [Changelog](docs/project-changelog.md)

## License

Private / unreleased.
