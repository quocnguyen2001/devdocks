import type { ReactNode } from "react";
import { LayoutGrid } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Top-level application chrome: a sidebar, a header, and a scrollable content
 * region. Navigation and feature routes are filled in by later phases.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-surface text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-elevated/30 p-4">
        <div className="flex items-center gap-2 px-2 py-1">
          <Logo size={20} />
          <span className="text-sm font-semibold tracking-tight">DevDock</span>
        </div>
        <nav className="mt-6 flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2 rounded-md bg-brand-muted px-3 py-2 font-medium text-foreground">
            <LayoutGrid className="h-4 w-4" />
            Workspaces
          </span>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <h1 className="text-sm font-medium">Workspaces</h1>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
