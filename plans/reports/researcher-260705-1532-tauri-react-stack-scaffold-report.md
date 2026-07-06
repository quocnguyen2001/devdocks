# Tauri v2 + React 19 + Tailwind v4 Scaffold & Integration Report
**DevDock macOS Workspace Launcher**

---

## Executive Summary

This report validates the DevDock technology stack against current Tauri v2, React 19, and Tailwind v4 best practices. The scaffold is correct; the proposed directory layout needs adjustment. Key findings:

- **create-tauri-app** with React + TypeScript + pnpm scaffold is the standard path.
- Tailwind v4 uses `@tailwindcss/vite` plugin, NOT PostCSS; the old `tailwind.config.js` is optional.
- shadcn/ui fully supports Tailwind v4 & React 19 via `npx shadcn@latest init` (stable as of Feb 2025).
- Tauri v2 plugins use **capability-based ACL** (`src-tauri/capabilities/*.json`), NOT plugin config in `tauri.conf.json`.
- JSON config storage should live in **Rust via `#[tauri::command]`**, not frontend fs plugin—serde + `app.path().app_config_dir()` is standard.
- IPC uses `#[tauri::command]` + `invoke()`; Zustand on frontend mirrors Rust state.
- Testing: Vitest for components, Playwright for e2e (macOS WebDriver limited), Rust `#[cfg(test)]` for backend.

---

## 1. Scaffold: create-tauri-app + Directory Layout

### Command & Flow

**pnpm (recommended for DevDock):**
```bash
pnpm create tauri-app@latest devdocks \
  --binary-name devdocks \
  --frontend-language TypeScript \
  --package-manager pnpm \
  --ui react
```

Prompts:
- Tauri app name: `DevDock`
- Bundle ID: `com.devdock.app`
- Window title: `DevDock`
- Frontend UI: React
- Language: TypeScript

### Directory Layout (CORRECTED)

The scaffold creates:
```
devdocks/
├── src/                          # Frontend (React + Vite)
│   ├── App.tsx
│   ├── main.tsx
│   ├── App.css
│   └── index.css
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   └── main.rs               # Tauri entry point
│   ├── Cargo.toml
│   ├── tauri.conf.json           # v2 schema
│   └── capabilities/
│       └── default.json          # ACL/permissions
│
├── vite.config.ts               # React + Tailwind plugin
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
└── .gitignore
```

**Key note:** `components/`, `features/`, `hooks/`, `lib/`, `store/`, `types/` in rawplan should be **nested under `src/`**, not top-level:

```
src/
├── components/
├── features/
├── hooks/
├── lib/
├── store/
├── types/
├── App.tsx
└── main.tsx
```

### Key Config Files

**`vite.config.ts` (with Tailwind v4 plugin):**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
```

**`src-tauri/Cargo.toml` (essentials):**
```toml
[dependencies]
tauri = { version = "2", features = ["shell-open", "dialog-open-dir"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
tracing-subscriber = "0.3"

[target.'cfg(target_os = "macos")'.dependencies]
# macOS-specific deps if needed
```

**`src-tauri/tauri.conf.json` (v2 schema):**
```json
{
  "productName": "DevDock",
  "version": "0.1.0",
  "identifier": "com.devdock.app",
  "build": {
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "windows": [
      {
        "title": "DevDock",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "focus": true
      }
    ]
  },
  "security": {
    "csp": "default-src 'self' http://localhost:5173; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173"
  }
}
```

Note: **DO NOT** put plugin config here; use `src-tauri/capabilities/default.json` instead (see Q4).

**Dev workflow:**
```bash
# Terminal 1: Frontend dev server
pnpm dev

# Terminal 2: Tauri app
pnpm tauri dev
```

**Sources:** [Tauri Create Project](https://v2.tauri.app/start/create-project/), [tauri-apps/create-tauri-app](https://github.com/tauri-apps/create-tauri-app)

---

## 2. Tailwind CSS v4 + Vite + React 19

### Installation & Setup

```bash
pnpm add -D tailwindcss @tailwindcss/vite
```

**NO `tailwind.config.js` or PostCSS.config.js needed.** Vite plugin does it.

### CSS Entry (`src/index.css`)

Replace the entire file with a single line:
```css
@import "tailwindcss";
```

That's it. No `@tailwind` directives, no content globs, no theme config. v4 discovers your source files automatically.

### Optional: Custom Theme (if needed)

If you need `@theme` inline variables:
```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(65% 0.15 142);
  --color-accent: oklch(68% 0.12 280);
}
```

Or use CSS custom properties in your components:
```tsx
<div style={{ '--color-primary': 'oklch(65% 0.15 142)' }}>
```

### Dark Mode via Tailwind v4 + shadcn/ui

shadcn/ui uses the `.dark` class approach. Tailwind v4's `@custom-variant` lets you define custom breakpoints:
```css
@import "tailwindcss";

@custom-variant dark (&.dark);
```

Then toggle dark mode in your root:
```tsx
// In your App.tsx or Layout
const [isDark, setIsDark] = useState(false);

useEffect(() => {
  document.documentElement.classList.toggle('dark', isDark);
}, [isDark]);
```

### Integration Gotchas

- **shadcn/ui v1+ (Feb 2025)** includes Tailwind v4 components by default; no migration needed if starting fresh.
- `tailwind-merge` & `clsx` still work unchanged; use them for dynamic class composition.
- **No CSS variable prefixing required** like v3's `--tw-*`; v4's OKLCH colors are native.

**Sources:** [Tailwind CSS v4 Installation](https://tailwindcss.com/docs/installation/using-vite), [DEV: Tailwind v4 Vite React Setup](https://dev.to/lord_potato_c8a8c0086ffb5/tailwind-css-v4-vite-react-setup-the-clean-way-338j), [Medium: React 19 + Tailwind v4 + Vite](https://medium.com/@osamajavaid/setting-up-react-19-with-tailwind-css-v4-using-vite-in-just-two-steps-3748f55b06fd)

---

## 3. shadcn/ui on Tailwind v4 + React 19

### Initialization

```bash
pnpm dlx shadcn-ui@latest init
```

Choose:
- Style: `new-york` (shadcn's default for v4)
- Color: Pick one (e.g., `slate` for neutral)
- Dark mode: `class` (applies `.dark` to documentElement)
- Aliases: Accept defaults or customize tsconfig paths

This creates:
```
src/
└── components/
    └── ui/
        ├── button.tsx
        ├── card.tsx
        ├── dialog.tsx
        └── ... (components you add)
```

### Adding Components

```bash
pnpm dlx shadcn-ui@latest add button card dialog select
```

Each component is auto-updated for Tailwind v4 syntax (no `@tailwind` directives, uses `@import "tailwindcss"`).

### React 19 Compatibility

- **ForwardRef deprecation:** shadcn v4 removed explicit `forwardRef()` wrappers; all Radix primitives work natively.
- **Use client:** shadcn components are already client-side in React 19; no additional SSR config needed for a desktop app.
- **Radix deps:** All Radix UI primitives pinned to React 19–compatible versions (e.g., `@radix-ui/react-primitive@2.0+`).

### Theming with CSS Variables

shadcn/ui v4 defines CSS variables in `globals.css` (added during init):
```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.6%;
    /* ... more vars */
  }

  .dark {
    --background: 0 0% 3.6%;
    --foreground: 0 0% 98%;
  }
}
```

Then components use:
```tsx
// button.tsx
<button className="bg-background text-foreground hover:bg-muted">
```

DevDock can extend these for accent colors:
```css
:root {
  --accent: 142 71% 45%; /* primary brand color */
  --muted: 0 0% 96.1%;
}

.dark {
  --accent: 142 71% 55%;
  --muted: 0 0% 14.9%;
}
```

Then use in components:
```tsx
<button className="bg-[hsl(var(--accent))]">Launch</button>
```

### Known Issues (as of Feb 2025)

- **New `tw-animate-css`:** replaces deprecated `tailwindcss-animate`. If using animated components, install `tw-animate-css` (or use Framer Motion for DevDock's animations).
- **sonner vs toast:** shadcn deprecated the `toast` component in favor of `sonner` (3rd-party lib). DevDock doesn't require toast yet; defer this.

**Sources:** [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4), [shadcn/ui Changelog Feb 2025](https://ui.shadcn.com/docs/changelog/2025-02-tailwind-v4), [GitHub Issue: Tailwind v4 + React 19](https://github.com/shadcn-ui/ui/issues/6585)

---

## 4. Tauri v2 Plugins, Capabilities & ACL

### Plugin Ecosystem for DevDock

Official plugins available for DevDock's needs:

| Plugin | Purpose | macOS | Notes |
|--------|---------|-------|-------|
| `@tauri-apps/plugin-fs` | Read/write JSON configs | ✅ | Scoped file access |
| `@tauri-apps/plugin-dialog` | Folder picker for workspace path | ✅ | Native dialogs |
| `@tauri-apps/plugin-notification` | Toast notifications | ✅ | Native macOS notifications |
| `@tauri-apps/plugin-store` | Persistent key-value store | ✅ | Alternative to manual JSON |
| `@tauri-apps/plugin-shell` | Execute shell commands (launch IDEs) | ✅ | Run `open` commands |
| `@tauri-apps/plugin-opener` | Open files/URLs | ✅ | Wrapper around `open` |
| `@tauri-apps/plugin-deep-link` | Deep link / URI scheme handling | ✅ | `devdock://` protocol |

[Full plugin list](https://v2.tauri.app/plugin/)

### Plugin Installation

```bash
# Install via Tauri CLI (recommended)
pnpm tauri plugin add fs
pnpm tauri plugin add dialog
pnpm tauri plugin add notification
pnpm tauri plugin add shell
```

Or manually in `src-tauri/Cargo.toml`:
```toml
[dependencies]
tauri-plugin-fs = "2.0"
tauri-plugin-dialog = "2.0"
tauri-plugin-notification = "2.0"
tauri-plugin-shell = "2.0"
```

And in `src-tauri/src/main.rs`:
```rust
fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![...])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
```

### Capabilities & ACL (v2 Security Model)

**CRITICAL:** In Tauri v2, permissions are **NOT** in `tauri.conf.json`. They live in separate JSON/TOML files under `src-tauri/capabilities/`.

**Create `src-tauri/capabilities/default.json`:**
```json
{
  "version": 1,
  "identifier": "default",
  "description": "default permissions for DevDock",
  "windows": ["main"],
  "permissions": [
    "fs:default",
    "fs:scope-app-config",
    "dialog:default",
    "notification:default",
    "shell:open",
    "shell:execute",
    "deep-link:default"
  ]
}
```

**Then reference in `tauri.conf.json`:**
```json
{
  "app": { "windows": [...] },
  "security": {
    "capabilities": ["default"]
  }
}
```

### Permission Identifiers

Common permission identifiers (v2 format):
- `fs:default` — read/write with scopes (defined below)
- `fs:scope-app-config` — read/write in app config dir
- `fs:scope-download` — read/write in Downloads
- `dialog:default` — open file/folder dialogs
- `notification:default` — send notifications
- `shell:open` — open URLs/files with system apps
- `shell:execute` — run shell commands (powerful!)
- `deep-link:default` — register URI schemes

### Scoped File Access

To restrict fs plugin to specific directories, extend the capability:
```json
{
  "permissions": [
    {
      "identifier": "fs:scope-app-config",
      "allow": [
        { "path": "$APPCONFIG/workspaces/*" }
      ]
    },
    {
      "identifier": "fs:scope-projects",
      "allow": [
        { "path": "$HOME/Projects/*" }
      ]
    }
  ]
}
```

Available path variables:
- `$APPCONFIG` — `~/Library/Application Support/com.devdock.app`
- `$HOME`, `$DOCUMENT`, `$DOWNLOAD`, `$DESKTOP`, `$CACHE`, `$LOG`, `$TEMP`

**Sources:** [Tauri Plugin Development](https://v2.tauri.app/develop/plugins/), [Using Plugin Permissions](https://v2.tauri.app/learn/security/using-plugin-permissions/), [Capabilities](https://v2.tauri.app/security/capabilities/), [Tauri Plugin Store](https://v2.tauri.app/plugin/store/), [Tauri File System](https://v2.tauri.app/plugin/file-system/)

---

## 5. JSON Config Storage: Rust via #[tauri::command] (Recommended)

### Pattern: Rust as Source of Truth

**DevDock should store workspace JSON in Rust**, not the frontend fs plugin. Why:

- **Single source of truth:** Rust owns state & persistence; frontend is view layer.
- **Transaction safety:** Write JSON atomically in Rust; avoid partial writes from async JS.
- **Platform conventions:** App config lives in `~/Library/Application Support/com.devdock.app/` — Rust's `app.path()` handles macOS paths.
- **Testability:** Rust serialization logic is synchronous & unit-testable.

### Rust Implementation

**`src-tauri/src/models/workspace.rs`:**
```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub ide: IdeConfig,
    pub terminals: Vec<TerminalConfig>,
    pub applications: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeConfig {
    pub app: String, // "vscode", "phpstorm", etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    pub app: String,
    pub cwd: String,
    pub command: String,
    #[serde(default)]
    pub delay: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub created_at: String,
    pub updated_at: String,
    pub last_launched: Option<String>,
}

// Workspace schema version (for migrations)
pub const WORKSPACE_SCHEMA_VERSION: u32 = 1;
```

**`src-tauri/src/commands/workspace.rs`:**
```rust
use tauri::State;
use std::fs;
use std::path::PathBuf;
use crate::models::workspace::Workspace;

#[tauri::command]
pub fn list_workspaces(app_handle: tauri::AppHandle) -> Result<Vec<Workspace>, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    
    let workspaces_dir = config_dir.join("workspaces");
    
    if !workspaces_dir.exists() {
        fs::create_dir_all(&workspaces_dir).map_err(|e| e.to_string())?;
        return Ok(vec![]);
    }
    
    let mut workspaces = vec![];
    
    for entry in fs::read_dir(&workspaces_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        
        if path.extension().map_or(false, |ext| ext == "json") {
            let content = fs::read_to_string(&path)
                .map_err(|e| e.to_string())?;
            let workspace: Workspace = serde_json::from_str(&content)
                .map_err(|e| e.to_string())?;
            workspaces.push(workspace);
        }
    }
    
    Ok(workspaces)
}

#[tauri::command]
pub fn save_workspace(
    app_handle: tauri::AppHandle,
    workspace: Workspace,
) -> Result<String, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    
    let workspaces_dir = config_dir.join("workspaces");
    fs::create_dir_all(&workspaces_dir).map_err(|e| e.to_string())?;
    
    let filepath = workspaces_dir.join(format!("{}.json", workspace.id));
    let json = serde_json::to_string_pretty(&workspace)
        .map_err(|e| e.to_string())?;
    
    fs::write(&filepath, json).map_err(|e| e.to_string())?;
    
    Ok(filepath.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_workspace(
    app_handle: tauri::AppHandle,
    workspace_id: String,
) -> Result<(), String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    
    let filepath = config_dir.join("workspaces").join(format!("{}.json", workspace_id));
    fs::remove_file(&filepath).map_err(|e| e.to_string())?;
    
    Ok(())
}
```

**`src-tauri/src/main.rs`:**
```rust
mod models;
mod commands;

use commands::workspace::{list_workspaces, save_workspace, delete_workspace};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_workspaces,
            save_workspace,
            delete_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Schema Versioning & Migration

Add a version field to workspace JSON and migrate on load:

```rust
pub fn migrate_workspace(mut ws: Workspace) -> Result<Workspace, String> {
    // v1 → v2 migration example
    if ws.metadata.is_none() {
        ws.metadata = Some(Metadata {
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            last_launched: None,
        });
    }
    Ok(ws)
}
```

### Frontend IPC Call

```typescript
// src/lib/workspace.ts
import { invoke } from '@tauri-apps/api/core';

export async function listWorkspaces() {
  return invoke<Workspace[]>('list_workspaces');
}

export async function saveWorkspace(workspace: Workspace) {
  return invoke<string>('save_workspace', { workspace });
}

export async function deleteWorkspace(workspaceId: string) {
  return invoke<void>('delete_workspace', { workspaceId });
}
```

### Why NOT tauri-plugin-store?

The store plugin is a key-value store that serializes to a file. It's fine for app settings (theme, window size) but **not ideal for workspace configs** because:
- Limited query/filtering (key-only lookup)
- No schema versioning built-in
- Overkill when Rust + serde already does the job

**Decision:** Use Rust `#[tauri::command]` for workspace CRUD, reserve `tauri-plugin-store` for app-level settings (theme, recent workspaces list).

**Sources:** [Tauri Calling Rust from Frontend](https://v2.tauri.app/develop/calling-rust/), [Tauri Store Plugin](https://v2.tauri.app/plugin/store/), [Tauri Configuration Files](https://v2.tauri.app/develop/configuration-files/)

---

## 6. IPC & State Management: Commands + Zustand

### Command Pattern (Rust → Frontend)

Every Rust function callable from JS is a `#[tauri::command]`:

```rust
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}
```

Invoked from React:
```typescript
import { invoke } from '@tauri-apps/api/core';

export async function greet(name: string) {
  return invoke<string>('greet', { name });
}

// In a component:
const handleGreet = async () => {
  const msg = await greet('DevDock');
  console.log(msg); // "Hello, DevDock!"
};
```

### Tauri Managed State

For shared state across commands, use `tauri::State`:

```rust
use std::sync::Mutex;

struct AppState {
    workspaces: Mutex<Vec<Workspace>>,
}

#[tauri::command]
fn get_workspace_count(state: tauri::State<AppState>) -> usize {
    state.workspaces.lock().unwrap().len()
}

#[tauri::command]
fn clear_workspaces(state: tauri::State<AppState>) {
    state.workspaces.lock().unwrap().clear();
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            workspaces: Mutex::new(vec![]),
        })
        .invoke_handler(tauri::generate_handler![
            get_workspace_count,
            clear_workspaces,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Note:** For DevDock, avoid loading all workspaces into Rust state at startup. Instead, load from disk on demand and rely on frontend caching.

### Zustand as Frontend Cache

Zustand mirrors Rust state on the frontend; it's the single source of truth for UI:

```typescript
// src/store/workspace-store.ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { Workspace } from '../types/workspace';

interface WorkspaceStore {
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchWorkspaces: () => Promise<void>;
  addWorkspace: (ws: Workspace) => Promise<void>;
  updateWorkspace: (ws: Workspace) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  isLoading: false,
  error: null,

  fetchWorkspaces: async () => {
    set({ isLoading: true, error: null });
    try {
      const ws = await invoke<Workspace[]>('list_workspaces');
      set({ workspaces: ws, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  addWorkspace: async (ws) => {
    try {
      await invoke('save_workspace', { workspace: ws });
      set((state) => ({ workspaces: [...state.workspaces, ws] }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updateWorkspace: async (ws) => {
    try {
      await invoke('save_workspace', { workspace: ws });
      set((state) => ({
        workspaces: state.workspaces.map((w) => (w.id === ws.id ? ws : w)),
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteWorkspace: async (id) => {
    try {
      await invoke('delete_workspace', { workspaceId: id });
      set((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== id),
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
```

### Component Usage

```tsx
import { useWorkspaceStore } from '@/store/workspace-store';

export function Dashboard() {
  const { workspaces, isLoading, error, fetchWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {workspaces.map((ws) => (
        <WorkspaceCard key={ws.id} workspace={ws} />
      ))}
    </div>
  );
}
```

### TanStack Query (Optional)

If you need advanced caching, refetching, or background updates, layer TanStack Query on top:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useFetchWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => invoke<Workspace[]>('list_workspaces'),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useSaveWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ws: Workspace) => invoke('save_workspace', { workspace: ws }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}
```

**Decision for DevDock:** Start with **Zustand only** (simpler, no extra dependencies). Add TanStack Query later if background sync / polling is needed.

**Sources:** [Tauri Calling Rust from Frontend](https://v2.tauri.app/develop/calling-rust/), [Tauri v2 Cheatsheet](https://dev.to/hiyoyok/tauri-v2-cheatsheet-commands-events-permissions-and-state-in-one-place-opd)

---

## 7. Testing Strategy: Vitest + Playwright + Rust

### Unit & Component Tests (Vitest)

**Setup:**
```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**`vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

**Example test:**
```typescript
// src/components/__tests__/button.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders with label', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles onClick', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

**Run:**
```bash
pnpm vitest
```

### E2E Tests (Playwright)

Tauri v2 + Playwright integration is **limited on macOS**:
- Tauri provides `tauri-driver` (Chromium-based), but macOS WebDriver support is incomplete.
- Alternative: Use Playwright with the Tauri CLI's dev server and test the UI as if it's a web app.

**Setup:**
```bash
pnpm add -D @playwright/test
pnpm exec playwright install
```

**`playwright.config.ts`:**
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'pnpm tauri dev',
    port: 1430, // Tauri dev server default port for WebDriver
    timeout: 120 * 1000,
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://localhost:1430',
  },
});
```

**Example test:**
```typescript
// e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test';

test('dashboard loads workspaces', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Workspaces')).toBeVisible();
  await expect(page.locator('[data-testid="workspace-card"]')).toHaveCount(1);
});

test('can create workspace', async ({ page }) => {
  await page.goto('/');
  await page.click('button:has-text("New Workspace")');
  await page.fill('input[name="name"]', 'Test Project');
  await page.click('button:has-text("Create")');
  await expect(page.locator('text=Test Project')).toBeVisible();
});
```

**Run:**
```bash
pnpm exec playwright test
pnpm exec playwright test --headed # See browser
```

**Limitations on macOS:**
- Tauri's WebDriver bridge is unstable on Intel Macs; Apple Silicon is better.
- For full app testing (window controls, menu bar, native dialogs), consider **manual testing + CI video capture**.

### Rust Tests

**`src-tauri/src/models/workspace.rs`:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_serialization() {
        let ws = Workspace {
            id: "test".to_string(),
            name: "Test".to_string(),
            path: "/home".to_string(),
            description: None,
            ide: IdeConfig { app: "vscode".to_string() },
            terminals: vec![],
            applications: vec![],
            metadata: None,
        };

        let json = serde_json::to_string(&ws).unwrap();
        let parsed: Workspace = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "test");
    }
}
```

**Run:**
```bash
cd src-tauri
cargo test
```

### Testing Reality for DevDock

**Focus on:**
- Vitest for UI component logic (renders, interactions, Zustand state changes)
- Playwright for critical user flows (dashboard → create → launch workspace)
- Rust tests for workspace serialization, path validation, command logic

**Don't test:**
- Native dialog/notification prompts (hard to automate; test the Tauri command wrapper instead)
- macOS-specific window chrome (manual QA)
- Shell command execution (mock in unit tests, manual integration test)

**Sources:** [Vitest Docs](https://vitest.dev/), [Playwright Docs](https://playwright.dev/), Tauri WebDriver limitations (acknowledged in community; no official macOS WebDriver solution yet)

---

## Key Risks & Unknowns

### 1. **Tailwind v4 Adoption Risk: LOW**
- Official, stable as of Feb 2025. shadcn/ui fully supports it.
- Migration from v3 is simple if needed later.

### 2. **Tauri v2 Plugin ACL Complexity: MEDIUM**
- Capabilities syntax is new (v2 only); many tutorials still reference v1's plugin config.
- **Mitigation:** Start with `fs:default` + `dialog:default`, add scopes incrementally.

### 3. **macOS WebDriver/Playwright Limitation: MEDIUM**
- Tauri's WebDriver bridge is buggy on macOS; full e2e testing may require manual QA.
- **Mitigation:** Prioritize Vitest component tests; use Playwright for smoke tests only.

### 4. **JSON Config Versioning: LOW-MEDIUM**
- Workspace schema will evolve (v1 → v2 → v3). Need a migration plan.
- **Mitigation:** Add `schema_version` field; write migrations explicitly in Rust.

### 5. **Shell Command Execution Safety: MEDIUM**
- Launching IDEs via `tauri-plugin-shell` requires escaping / validation (injection risk).
- **Mitigation:** Use `shell:open` for URLs/files; restrict `shell:execute` in capabilities.

### 6. **Dark Mode CSS Variables: LOW**
- shadcn/ui's `.dark` class approach is solid, but manual theme switching requires careful state sync.
- **Mitigation:** Test light/dark/system theme modes early.

### 7. **React 19 + Radix + Framer Motion: LOW**
- All are compatible. Framer Motion's latest versions support React 19.
- **Mitigation:** Pin versions in `package.json` once verified in dev.

---

## Recommended Setup for DevDock

### Phase 0: Scaffold (Day 1)

```bash
pnpm create tauri-app@latest devdocks \
  --binary-name devdocks \
  --frontend-language TypeScript \
  --package-manager pnpm \
  --ui react

cd devdocks

# Install Tailwind v4 + shadcn/ui
pnpm add -D tailwindcss @tailwindcss/vite
pnpm dlx shadcn-ui@latest init

# Install plugins
pnpm tauri plugin add fs
pnpm tauri plugin add dialog
pnpm tauri plugin add notification
pnpm tauri plugin add shell

# Install state + forms
pnpm add zustand react-hook-form zod
pnpm add -D framer-motion

# Testing
pnpm add -D vitest @testing-library/react jsdom @playwright/test

# Dev dependencies
pnpm add -D typescript @types/node
```

### Phase 1: Core Structure (Days 2–3)

1. **Organize src/ directories** per rawplan, nested under `src/`:
   ```
   src/
   ├── components/ui/    (shadcn components)
   ├── components/       (app-specific)
   ├── features/         (pages/sections)
   ├── hooks/            (custom hooks)
   ├── lib/              (utils)
   ├── store/            (Zustand stores)
   ├── types/            (TypeScript interfaces)
   ├── App.tsx
   └── main.tsx
   ```

2. **Create Rust models & commands** in `src-tauri/src/`:
   ```
   src-tauri/src/
   ├── models/
   │   └── workspace.rs
   ├── commands/
   │   └── workspace.rs
   ├── main.rs
   ├── lib.rs
   └── Cargo.toml
   ```

3. **Set up workspace store** (Zustand) to mirror Rust state.

4. **Create workspace CRUD commands** (list, save, delete, validate).

### Phase 2: UI & IPC (Days 4–5)

1. Build Dashboard component (workspace grid).
2. Build Workspace Create/Edit modal.
3. Test Zustand ↔ Tauri command roundtrip.
4. Add error handling & loading states.

### Phase 3: Launch & Lifecycle (Days 6–7)

1. Implement launch command (validate → execute shell commands).
2. Add notification feedback (success/error).
3. Test on real macOS (battery, permissions, app store sandbox if needed).

### Phase 4: Testing & Polish (Days 8–10)

1. Vitest for components.
2. Playwright smoke tests (create, delete, basic flow).
3. Dark mode theming.
4. Performance profiling (target <1s startup).

### Config Summary

**`vite.config.ts`:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
```

**`src/index.css`:**
```css
@import "tailwindcss";
```

**`src-tauri/Cargo.toml` (essentials):**
```toml
[package]
name = "devdocks"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["shell-open", "dialog-open-dir"] }
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"
tauri-plugin-shell = "2"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
tracing-subscriber = "0.3"
uuid = { version = "1.0", features = ["v4", "serde"] }
```

**`src-tauri/tauri.conf.json`:** (from scaffold, no plugin config here)

**`src-tauri/capabilities/default.json`:**
```json
{
  "version": 1,
  "identifier": "default",
  "description": "default permissions for DevDock",
  "windows": ["main"],
  "permissions": [
    "fs:scope-app-config",
    "dialog:default",
    "notification:default",
    "shell:open"
  ]
}
```

---

## Unresolved Questions

1. **AppleScript vs shell commands:** When should DevDock use AppleScript for IDE launch vs `open` + shell? (Answer: Use `open` first; AppleScript only if IDE doesn't respond to `open`.)

2. **Workspace validation:** How strictly to validate workspace paths before launch? (Answer: Check path exists; defer IDE/terminal availability checks to launch time.)

3. **Offline mode:** What happens if a workspace's IDE is uninstalled? Should DevDock skip gracefully or error? (Answer: Skip with notification; log in session.)

4. **Menu bar app (roadmap):** How to architect for future menu bar + dock app duality? (Answer: Abstract launch logic into commands; UI is separate.)

5. **Playwright on Apple Silicon:** Is WebDriver stable enough for CI on GHA macOS runners? (Answer: Test in CI; manual fallback if unstable.)

---

## Summary

The DevDock stack is **sound and current**. The scaffold path is `pnpm create tauri-app` + manual plugin setup. Tailwind v4 + shadcn/ui is plug-and-play with no config. Tauri v2's capabilities system is more robust but requires reading per-plugin docs. **Store workspace JSON in Rust via `#[tauri::command]`**, not the frontend fs plugin. Test with Vitest + Playwright + Rust `#[cfg(test)]`, accepting that macOS WebDriver is limited.

**Next step:** Use this report to refine the implementation plan in `plans/` before coding.

---

**Report compiled:** 2026-07-05  
**Sources verified:** 8 web queries, 2 fetches (official Tauri v2 & shadcn/ui docs)  
**Constraints:** Tauri v2 only; Tailwind v4; React 19; macOS target
