import type { ReactNode } from "react";
import { LayoutGrid, Settings } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export type NavSection = "workspaces" | "settings";

interface AppShellProps {
  children: ReactNode;
  active: NavSection;
  onNavigate: (section: NavSection) => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof LayoutGrid }[] = [
  { id: "workspaces", label: "Workspaces", icon: LayoutGrid },
  { id: "settings", label: "Settings", icon: Settings },
];

/**
 * Top-level application chrome for the overlay-titlebar window.
 * Translucent surfaces sit over the native NSVisualEffectView vibrancy; the top
 * strips are drag regions that clear the native traffic lights. The sidebar nav
 * is the single source of "where you are"; the theme control + version stamp
 * live in the footer.
 */
export function AppShell({ children, active, onNavigate }: AppShellProps) {
  const railHeight = { height: "var(--title-bar-height)" };
  const activeLabel =
    NAV_ITEMS.find((i) => i.id === active)?.label ?? "Workspaces";

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
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onNavigate(id)}
                className={cn(
                  // border-l-2 + pl-[10px] keeps the label aligned with the px-3 grid.
                  "flex items-center gap-2 rounded-md border-l-2 py-2 pl-[10px] pr-3 text-left font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive
                    ? "border-brand bg-brand-muted text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-2 py-2">
          <span
            className="text-mono tabular text-[10px] text-muted-foreground"
            title="App version"
          >
            v{__APP_VERSION__}
          </span>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Draggable titlebar strip over the content area. */}
        <div className="drag-region shrink-0" style={railHeight} />
        <main className="flex-1 overflow-auto">
          <h1 className="sr-only">{activeLabel}</h1>
          {children}
        </main>
      </div>
    </div>
  );
}
