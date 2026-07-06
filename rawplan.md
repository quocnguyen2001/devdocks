# DevDock --- Final Technical Stack & Product Plan

## Vision

DevDock is a native macOS application that restores an entire developer
workspace with one click.

The application should launch IDEs, terminals, AI tools, Docker,
browsers, databases, and any configured utilities automatically,
allowing developers to start working immediately.

------------------------------------------------------------------------

# Final Technology Stack

## Desktop

-   Tauri v2
-   Rust

## Frontend

-   React 19
-   TypeScript
-   Vite

## Styling

-   Tailwind CSS v4
-   CSS Variables
-   tailwind-merge
-   clsx

## UI Components

-   shadcn/ui
-   Radix UI
-   Lucide Icons

## Animation

-   Motion (Framer Motion)

## State Management

-   Zustand

## Forms

-   React Hook Form
-   Zod

## Data Layer

-   TanStack Query (for async state if needed)
-   Local-first architecture

## Local Database

-   SQLite
-   rusqlite or SQLx

## Configuration

-   JSON
-   serde (Rust serialization)

## Native Integration

-   Tauri Shell
-   Tauri FS
-   Tauri Dialog
-   Tauri Notification
-   Tauri Store
-   Tauri Deep Links
-   AppleScript (when native automation is required)
-   macOS `open` command

## Logging

-   tracing
-   tracing-subscriber

## Testing

-   Vitest
-   Playwright
-   Rust tests

## Build & CI

-   GitHub Actions
-   cargo
-   pnpm

------------------------------------------------------------------------

# Folder Structure

``` text
devdock/
├── src/
├── src-tauri/
├── components/
├── features/
├── hooks/
├── lib/
├── store/
├── types/
├── workspaces/
├── assets/
└── docs/
```

------------------------------------------------------------------------

# Core Features

## Dashboard

-   Workspace cards
-   Search
-   Favorites
-   Recent workspaces
-   Tags
-   Quick launch

## Workspace Configuration

### General

-   Name
-   Path
-   Description
-   Icon
-   Accent Color

### IDE

Supported:

-   VS Code
-   PhpStorm
-   Cursor
-   Windsurf
-   Zed
-   IntelliJ IDEA

### Terminal

Support multiple terminals.

Each terminal contains:

-   Application
-   Working directory
-   Startup command
-   Delay

Supported:

-   Warp
-   iTerm2
-   Terminal.app

### AI Tools

-   Claude Desktop
-   Claude Code
-   ChatGPT Desktop
-   Gemini CLI
-   Codex CLI

### Additional Applications

Examples:

-   Docker Desktop
-   TablePlus
-   DBeaver
-   Postman
-   Bruno
-   Redis Insight
-   Chrome
-   Arc
-   Safari

### Browser URLs

Automatically open URLs after launch.

### Startup Sequence

Launch tools in configurable order.

### Hooks

-   Before Launch
-   After Launch
-   Before Close

### Environment Variables

Workspace-specific environment support.

------------------------------------------------------------------------

# Launch Flow

1.  Validate workspace
2.  Execute pre-launch hooks
3.  Launch Docker (optional)
4.  Wait for dependencies
5.  Launch IDE
6.  Launch terminals
7.  Execute commands
8.  Launch AI tools
9.  Launch browsers
10. Save session metadata

------------------------------------------------------------------------

# Workspace Configuration Example

``` json
{
  "name": "Laravel CRM",
  "path": "/Users/me/Projects/laravel-crm",
  "ide": { "app": "phpstorm" },
  "terminals": [
    {
      "app": "warp",
      "cwd": ".",
      "command": "npm run dev"
    },
    {
      "app": "warp",
      "cwd": "backend",
      "command": "php artisan queue:work"
    }
  ],
  "applications": [
    "docker-desktop",
    "tableplus",
    "claude-desktop"
  ]
}
```

------------------------------------------------------------------------

# UI & UX

## Design Language

-   Modern
-   Premium
-   Native macOS inspired
-   Minimal
-   Clean
-   Spacious

## Themes

-   Light
-   Dark
-   Follow System

## Animations

-   Smooth transitions
-   Hover feedback
-   Card animations
-   Page transitions
-   Micro interactions

## Performance

-   Startup target under 1 second
-   Low memory usage
-   Smooth scrolling
-   Instant navigation

## Accessibility

-   Keyboard shortcuts
-   Keyboard navigation
-   Focus states
-   High contrast compatibility

------------------------------------------------------------------------

# Future Roadmap

-   Menu Bar app
-   Raycast extension
-   Spotlight integration
-   CLI (`devdock open workspace-name`)
-   Workspace templates
-   Git integration
-   Docker Compose awareness
-   SSH workspaces
-   Plugin system
-   Team workspace sharing
-   Cloud sync (optional)

------------------------------------------------------------------------

# Product Goal

DevDock should feel as polished as Raycast, Warp, Cursor, Arc Browser,
and Claude Desktop while remaining lightweight, fast, and completely
local-first.
