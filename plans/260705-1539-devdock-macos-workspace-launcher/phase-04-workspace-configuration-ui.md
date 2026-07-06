---
phase: 4
title: Workspace Configuration UI
status: completed
effort: L
---

# Phase 4: Workspace Configuration UI

## Overview

The form-driven UI to create, edit, duplicate, and delete workspaces across every config section — General, IDE, Terminals, AI Tools, Additional Applications, Browser URLs, and Startup Sequence — without hand-editing JSON. Built on React Hook Form + Zod (the Phase 2 schema) and shadcn/ui, populated by the Phase 3 detection command.

**Depends on:** Phase 2 (schema + CRUD), Phase 3 (`detect_tools`). **Blocks:** Phase 5 (dashboard triggers this UI), Phase 6 (adds hooks/env sections to it).

## Requirements

- **Functional:** a multi-section workspace editor; General (name, path via folder picker, description, icon, accent color); IDE picker; repeatable Terminals (app, cwd, command, delay); AI Tools multiselect; Additional Applications multiselect; Browser URLs list; drag-to-order Startup Sequence. Create/edit/duplicate/delete wired to the Zustand store.
- **Non-functional:** Zod validation with inline field errors; unsaved-changes guard; detected-vs-configured tools clearly indicated; keyboard-accessible forms.

## Architecture

- **Forms:** React Hook Form + `@hookform/resolvers/zod` against `workspace-schema.ts` (Phase 2). One `useForm` per workspace with nested field arrays (`useFieldArray`) for terminals, browser URLs, and startup steps.
- **Sections:** a tabbed or sectioned editor (`features/workspace-config/`): `general-section.tsx`, `ide-section.tsx`, `terminals-section.tsx`, `ai-tools-section.tsx`, `applications-section.tsx`, `browser-urls-section.tsx`, `startup-sequence-section.tsx`.
- **Folder picker:** `tauri-plugin-dialog` `open({ directory: true })` for workspace `path` and terminal `cwd`.
- **Tool availability:** call `detect_tools` (Phase 3) on mount; annotate each IDE/terminal/app option with availability; show Warp's "launch-only" note inline.
- **Startup sequence:** a reorderable list (dnd or up/down controls) producing the ordered `StartupStep[]` the orchestrator consumes; each step references a configured item + optional delay.
- **Persistence:** submit → `workspace-store` `addWorkspace`/`updateWorkspace` → Phase 2 command. `duplicate`/`delete` via store actions.

## Related Code Files

- Create (TS): `src/features/workspace-config/workspace-editor.tsx` + the section components above; `src/features/workspace-config/use-workspace-form.ts`
- Create (TS): `src/components/color-picker.tsx` (accent), `src/components/icon-picker.tsx`, `src/components/folder-input.tsx`, `src/components/tool-select.tsx` (availability-aware)
- Create (TS): `src/hooks/use-detected-tools.ts` (wraps `detect_tools`), `src/hooks/use-unsaved-guard.ts`
- Modify (TS): `src/store/workspace-store.ts` (ensure duplicate/select-for-edit actions), `src/App.tsx` (route/modal to editor)
- Modify (ACL): `src-tauri/capabilities/default.json` (add `dialog:default` + folder scope)
- Add plugin: `pnpm tauri add dialog`
- Create (tests): `src/features/workspace-config/__tests__/workspace-editor.test.tsx` (validation, add/remove terminal, submit shape)

## Implementation Steps

1. **Add dialog plugin + ACL** (`pnpm tauri add dialog`; add `dialog:default` to capabilities).
2. **Form skeleton:** `use-workspace-form.ts` wiring RHF + Zod resolver to the Phase 2 schema, default values for a new workspace (UUID generated on save by Rust or client).
3. **General section:** name, description, folder-picker `path`, `icon-picker`, `color-picker` (accent). Validate required name + path.
4. **IDE section:** single-select from the supported list (VS Code, PhpStorm, Cursor, Windsurf, Zed, IntelliJ), annotated with detected availability.
5. **Terminals section:** `useFieldArray` — add/remove terminal rows (app select, `cwd` folder-input relative to workspace path, `command`, `delay`); show Warp limitation note when Warp is chosen.
6. **AI Tools + Additional Applications:** multiselect chips from the supported lists (Claude Desktop, Claude Code, ChatGPT, Gemini CLI, Codex CLI; Docker Desktop, TablePlus, DBeaver, Postman, Bruno, Redis Insight, Chrome, Arc, Safari), availability-annotated; allow a **custom app entry** — validated in the Zod schema against `^[A-Za-z0-9 ._-]+$` (reject `/`, `..`, control chars) since the name reaches `open -a`/`test -d` (red-team H1). Optionally allow a custom **binary/app path override** per tool, which `detect_tools` (P3) honors.
7. **Browser URLs:** `useFieldArray` list of URLs (+ optional per-URL browser); validate URL is **`http`/`https` scheme only** (block `file://`, `x-apple.systempreferences:`, and arbitrary URL-handler schemes — red-team H1).
8. **Startup sequence:** reorderable list aggregating configured items into ordered `StartupStep[]` with optional per-step delay; default order = canonical launch flow.
9. **Actions:** submit (create/update), duplicate, delete (with confirm), unsaved-changes guard on navigation.
10. **Tests:** Vitest — validation errors surface; add/remove terminal updates the array; submit produces a schema-valid object matching `rawplan.md` example shape.

## Success Criteria

- [ ] A workspace can be created end-to-end via the UI and round-trips through Phase 2 (on-disk camelCase JSON with the `rawplan.md` sections + system fields). A workspace configured with an iTerm2/Terminal.app terminal actually launches (cwd+command) in Phase 3; a Warp terminal shows the launch-only note.
- [ ] Folder picker sets `path` and terminal `cwd`; relative `cwd` is preserved as authored.
- [ ] Multiple terminals can be added/removed/reordered; each carries app + cwd + command + delay.
- [ ] IDE/terminal/app options show availability from `detect_tools`; choosing Warp shows the launch-only note.
- [ ] Invalid input (missing name/path, malformed URL) blocks save with inline errors; unsaved changes prompt on exit.
- [ ] Editing then saving updates the existing JSON file (not a duplicate); duplicate/delete work.

## Risk Assessment

- **Form ↔ schema drift causing invalid saves (MEDIUM).** Mitigation: single Zod schema from Phase 2 as the resolver; submit-shape test.
- **Startup-sequence model mismatch with the orchestrator (MEDIUM).** Mitigation: the section emits exactly the `StartupStep[]` the Phase 3 orchestrator consumes; shared type in `src/types`.
- **Detection latency blocking the form (LOW).** Mitigation: load availability async with a non-blocking "checking…" state; never gate save on detection.
- **Icon/color scope creep (LOW).** Mitigation: constrain icon-picker to a Lucide subset and accent to a fixed palette + custom hex; no asset uploads in v1.
