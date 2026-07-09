# Workflow Editor UX Fixes Landed — The Drag Bug Was a Clip, Not a Ghost

**Date**: 2026-07-09 16:55
**Severity**: Medium (one review-caught main-thread stall; one pinned root cause)
**Component**: Workflow editor (step DnD, app picker), Settings width, form spacing, `app_icon` native command
**Status**: Resolved

## What Happened

Shipped a 4-phase pass closing six user-feedback items from `.prompts/task4/task.md`: Settings width
sync (`max-w-2xl` → `max-w-4xl` to match the Workspaces/Workflows lists), a repaired step drag-and-drop,
"no drag while a card is expanded", a real-icon searchable "Open app" picker, and roomier label→control
spacing. All gates green — `tsc`, prod build, vitest 53/53, cargo 76/76 (incl. a new path-guard test),
`cargo check`/`clippy` clean. One new frontend file (`app-select.tsx`) and one new native command
(`app_icon`); no schema/contract changes.

## The Brutal Truth

**The "items disappear when you drag" bug was never a data or state bug — it was CSS clipping.** Each step
row is an `AnimatePresence` `motion.div` with `overflow-hidden` (for the add/remove height reveal), and
dnd-kit applies its drag transform to the *inner* `StepCard`. So the moment you dragged, the card
translated out of its own clipping parent and vanished; on drop the transform reset and it "reappeared."
The tell was in the symptom the whole time ("thả ra thì xuất hiện lại" — release and it shows again). The
fix is the canonical dnd-kit pattern: render the dragged card in a `DragOverlay` portal (never clipped),
ghost the source, add an 8px pointer activation distance, and drop the clip while a drag is active.
Disabling drag on expanded cards (issue #3) fell out of the same design — only fixed-height collapsed
cards drag, so the overlay clone is always the compact header.

**The code review earned its keep on the native side.** The `app_icon` command looked done — it compiled,
tests passed, clippy was clean — but it was a plain synchronous `#[tauri::command]`, which in Tauri v2
runs on the **main thread**. A single call is a few milliseconds, so nothing local flagged it; but the
picker fires one `app_icon` per row, so first-open would fan ~77 blocking NSWorkspace/PNG-encode calls
onto the UI thread and stall the window — right inside the feature whose point was a *smooth* picker. My
own comment ("safe to run off the main thread") was aspirational, not descriptive. Fix: `#[tauri::command
(async)]` on the sync fn moves it to a worker thread while keeping the simple `Option<String>` return —
the selectors aren't `MainThreadOnly`, so off-main is sound. Saved to memory so it doesn't bite a third
Tauri command.

## What I'm Not Certain Of

Static verification was thorough, but the two marquee behaviors — real icons progressively filling the
popover, and the actual drag *feel* — can only be exercised by running the Tauri app on macOS
(`pnpm tauri dev`); the native IPC and desktop drag aren't reachable from a plain browser preview. Those
want a human eye before this is called truly done.

## Loose Ends

- Extracted icons are full-resolution (no downscale): reliable bounding needs an offscreen redraw, which
  I judged too fragile to write blind. Icons are cached and lazy, so it's a DOM-weight nuance, not a
  correctness issue — revisit if the picker feels heavy with many apps.
- The `app_icon` cache grows unbounded for the session (one small entry per app opened). Fine at this
  scale; would want an LRU only if it ever indexes thousands.
