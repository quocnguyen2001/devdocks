import type { ReactNode } from "react";
import { LayoutGrid } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Top-level application chrome for the overlay-titlebar window (Phase 5).
 * Translucent surfaces sit over the native NSVisualEffectView vibrancy; the top
 * strips are drag regions that clear the native traffic lights. The theme
 * control lives in the sidebar footer (single home), and the page title is not
 * repeated — the sidebar nav is the single source of "where you are".
 */
export function AppShell({ children }: { children: ReactNode }) {
  const railHeight = { height: "var(--title-bar-height)" };

  // /90 root surface: subtle vibrancy show-through while staying readable if the
  // NSVisualEffectView is absent (vibrancy-off fallback — review M1).
  return (
    <div className="flex h-full w-full overflow-hidden bg-background/90 text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-elevated/40 px-3">
        {/* Drag strip that clears the traffic lights (top-left of the window). */}
        <div className="drag-region" style={railHeight} />
        <div className="flex items-center gap-2 px-2 py-2">
          <Logo size={20} />
          <span className="text-sm font-semibold tracking-tight">DevDock</span>
        </div>
        <nav className="mt-2 flex flex-col gap-1 text-sm">
          {/* border-l-2 + pl-[10px] keeps the label aligned with the px-3 grid. */}
          <span className="flex items-center gap-2 rounded-md border-l-2 border-brand bg-brand-muted py-2 pl-[10px] pr-3 font-medium text-foreground">
            <LayoutGrid className="h-4 w-4" />
            Workspaces
          </span>
        </nav>
        <div className="mt-auto flex items-center justify-end border-t border-border py-2">
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Draggable titlebar strip over the content area. */}
        <div className="drag-region shrink-0" style={railHeight} />
        <main className="flex-1 overflow-auto">
          <h1 className="sr-only">Workspaces</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
