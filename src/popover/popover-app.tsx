import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Plus, Power, Search } from "lucide-react";
import { listWorkspaces } from "@/lib/workspace-ipc";
import { filterByQuery, sortRecentFirst } from "@/popover/quick-launch";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/workspace";

/** Columns in the workspace grid; also the ↑/↓ keyboard step. */
const GRID_COLS = 2;

/** Menu-bar quick-actions popover: search + a recent-first quick-launch grid,
 *  keyboard driven, auto-hides on focus loss. Reuses the existing launch engine. */
export function PopoverApp() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setWorkspaces(sortRecentFirst(await listWorkspaces()));
    } catch {
      /* best-effort; leave the previous list */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh + focus search when shown; refresh on any workspace change (from main).
  useEffect(() => {
    const subs = [
      listen("popover:shown", () => {
        void refresh();
        searchRef.current?.focus();
        searchRef.current?.select();
        // Re-resolve the persisted theme (same logic as the popover.html
        // pre-paint script) — this window has no ThemeProvider, so an in-app
        // theme change in the main window would otherwise leave it stale.
        const t = localStorage.getItem("theme");
        const dark =
          t === "dark" ||
          (t !== "light" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);
        document.documentElement.classList.toggle("dark", dark);
      }),
      listen("workspaces:changed", () => void refresh()),
    ];
    return () => {
      subs.forEach((s) => void s.then((un) => un()));
    };
  }, [refresh]);

  // Auto-hide on focus loss, deferred so a transient blur doesn't hide it.
  useEffect(() => {
    let timer: number | undefined;
    const win = getCurrentWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (timer) clearTimeout(timer);
      } else {
        timer = window.setTimeout(() => void win.hide(), 120);
      }
    });
    return () => void unlisten.then((un) => un());
  }, []);

  const visible = useMemo(
    () => filterByQuery(workspaces, query),
    [workspaces, query],
  );

  useEffect(() => setSelected(0), [query]);

  const hide = () => void getCurrentWindow().hide();

  const launch = useCallback(async (ws: Workspace) => {
    try {
      await invoke("launch_workspace", { workspace: ws });
    } catch {
      /* progress/errors surface in the main window */
    }
    hide();
  }, []);

  // Two-column grid navigation: ←/→ move by one, ↑/↓ move by a row (GRID_COLS).
  const last = visible.length - 1;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, last));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + GRID_COLS, last));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - GRID_COLS, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const ws = visible[selected];
      if (ws) void launch(ws);
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  };

  return (
    <div
      onKeyDown={onKeyDown}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-popover/70 text-popover-foreground shadow-popover"
    >
      <div className="relative border-b border-border">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <input
          ref={searchRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workspaces…"
          className="w-full bg-transparent py-3 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex-1 overflow-auto p-2">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {workspaces.length === 0 ? "No workspaces yet." : "No matches."}
          </p>
        ) : (
          <div
            role="listbox"
            aria-label="Workspaces"
            className="grid grid-cols-2 gap-1.5"
          >
            {visible.map((ws, i) => {
              const isSelected = i === selected;
              const accent = ws.accentColor || undefined;
              return (
                <button
                  key={ws.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  ref={
                    isSelected
                      ? (el) => el?.scrollIntoView({ block: "nearest" })
                      : undefined
                  }
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => void launch(ws)}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors focus-visible:outline-none",
                    isSelected
                      ? "border-brand bg-brand-muted"
                      : "border-border bg-surface/40 hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold text-white",
                      !accent && "bg-brand",
                    )}
                    style={accent ? { backgroundColor: accent } : undefined}
                    aria-hidden
                  >
                    {ws.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-medium leading-tight">
                      {ws.name}
                    </span>
                    <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                      {ws.path}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => {
            void invoke("open_main_window");
            hide();
          }}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-3.5 w-3.5" /> Open DevDock
        </button>
        <button
          type="button"
          onClick={() => void invoke("quit_app")}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Power className="h-3.5 w-3.5" /> Quit
        </button>
      </div>
    </div>
  );
}
