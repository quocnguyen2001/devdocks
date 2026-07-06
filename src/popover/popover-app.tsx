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
import { Play, Plus, Power, Search } from "lucide-react";
import { listWorkspaces } from "@/lib/workspace-ipc";
import { filterByQuery, sortRecentFirst } from "@/popover/quick-launch";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/workspace";

/** Menu-bar quick-actions popover: search + recent-first quick-launch, keyboard
 *  driven, auto-hides on focus loss. Reuses the existing launch engine. */
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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
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

      <div className="flex-1 overflow-auto p-1.5">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {workspaces.length === 0 ? "No workspaces yet." : "No matches."}
          </p>
        ) : (
          <ul role="listbox" aria-label="Workspaces">
            {visible.map((ws, i) => (
              <li key={ws.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === selected}
                  ref={
                    i === selected
                      ? (el) => el?.scrollIntoView({ block: "nearest" })
                      : undefined
                  }
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => void launch(ws)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                    i === selected
                      ? "bg-brand text-brand-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  <Play
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      i !== selected && "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {ws.name}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        i === selected
                          ? "text-brand-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {ws.path}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => {
            void invoke("open_main_window");
            hide();
          }}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Open DevDock
        </button>
        <button
          type="button"
          onClick={() => void invoke("quit_app")}
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent hover:text-foreground"
        >
          <Power className="h-3.5 w-3.5" /> Quit
        </button>
      </div>
    </div>
  );
}
