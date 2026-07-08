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
import { listWorkflows } from "@/lib/workflow-ipc";
import { listWorkspaces } from "@/lib/workspace-ipc";
import { filterByQuery, sortRecentFirst } from "@/popover/quick-launch";
import { cn } from "@/lib/utils";
import type { Workflow } from "@/types/workflow";
import type { Workspace } from "@/types/workspace";

type Section = "workspaces" | "workflows";

/** Columns in the workspace grid; also the ↑/↓ keyboard step. */
const GRID_COLS = 2;

/** Shorten a home-relative path for display: `/Users/me/code/x` → `~/code/x`. */
function prettyPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+\//, "~/").replace(/^\/home\/[^/]+\//, "~/");
}

/** Sample rows for the browser dev preview only (see `refresh`). Not shipped. */
const DEV_PREVIEW_WORKSPACES = [
  { id: "1", name: "Bok Admin", path: "/Users/quoc/code/bok-labs/bok-admin", accentColor: "#6366f1" },
  { id: "2", name: "Laravel CRM", path: "/Users/quoc/Projects/crm", accentColor: "#ef4444" },
  { id: "3", name: "Next Storefront", path: "/Users/quoc/work/storefront", accentColor: "#10b981" },
  { id: "4", name: "API Gateway", path: "/Users/quoc/services/gateway", accentColor: "#f59e0b" },
  { id: "5", name: "Design System", path: "/Users/quoc/code/ds", accentColor: "#ec4899" },
] as unknown as Workspace[];

/** Menu-bar quick-actions popover: search + a recent-first quick-launch grid,
 *  keyboard driven, auto-hides on focus loss. Reuses the existing launch engine. */
export function PopoverApp() {
  const [section, setSection] = useState<Section>("workspaces");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const refreshWorkspaces = useCallback(async () => {
    try {
      setWorkspaces(
        sortRecentFirst(
          await listWorkspaces(),
          (w) => w.metadata.lastLaunched,
          (w) => w.name,
        ),
      );
    } catch {
      // Best-effort; leave the previous list. In a plain-browser dev preview
      // (no Tauri IPC) seed sample rows so the grid is inspectable — this branch
      // is stripped from production builds and never runs inside the app.
      if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
        setWorkspaces(DEV_PREVIEW_WORKSPACES);
      }
    }
  }, []);

  const refreshWorkflows = useCallback(async () => {
    try {
      setWorkflows(
        sortRecentFirst(
          await listWorkflows(),
          (w) => w.metadata.lastRunAt,
          (w) => w.name,
        ),
      );
    } catch {
      /* best-effort; leave the previous list */
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([refreshWorkspaces(), refreshWorkflows()]);
  }, [refreshWorkspaces, refreshWorkflows]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh + focus search when shown; refresh on any workspace/workflow change (from main).
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
      listen("workspaces:changed", () => void refreshWorkspaces()),
      listen("workflows:changed", () => void refreshWorkflows()),
    ];
    return () => {
      subs.forEach((s) => void s.then((un) => un()));
    };
  }, [refresh, refreshWorkspaces, refreshWorkflows]);

  // Auto-hide on focus loss, deferred so a transient blur doesn't hide it.
  // Guarded: the window API throws outside the Tauri runtime (e.g. a browser
  // preview) — swallow it so the popover still renders instead of crashing.
  useEffect(() => {
    let timer: number | undefined;
    let cleanup = () => {};
    try {
      const win = getCurrentWindow();
      const unlisten = win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          if (timer) clearTimeout(timer);
        } else {
          timer = window.setTimeout(() => void win.hide(), 120);
        }
      });
      cleanup = () => void unlisten.then((un) => un());
    } catch {
      /* non-Tauri context */
    }
    return () => cleanup();
  }, []);

  const visibleWorkspaces = useMemo(
    () =>
      filterByQuery(workspaces, query, (w) => [w.name, w.path]),
    [workspaces, query],
  );
  const visibleWorkflows = useMemo(
    () => filterByQuery(workflows, query, (w) => [w.name]),
    [workflows, query],
  );
  const visible: Array<Workspace | Workflow> =
    section === "workspaces" ? visibleWorkspaces : visibleWorkflows;

  useEffect(() => setSelected(0), [query]);
  useEffect(() => setSelected(0), [section]);

  const hide = () => void getCurrentWindow().hide();

  const launch = useCallback(async (ws: Workspace) => {
    try {
      await invoke("launch_workspace", { workspace: ws });
    } catch {
      /* progress/errors surface in the main window */
    }
    hide();
  }, []);

  // Fire-and-hide: `run_workflow` resolves to a run_id immediately and the run
  // continues on the backend; the main window's run store observes it (any
  // `AlreadyRunning` rejection just means an already-visible run keeps going).
  const runWorkflow = useCallback(async (wf: Workflow) => {
    try {
      await invoke("run_workflow", { workflowId: wf.id });
    } catch {
      /* observed/surfaced in the main window's run store */
    }
    hide();
  }, []);

  const activate = useCallback(
    (item: Workspace | Workflow) => {
      if (section === "workspaces") void launch(item as Workspace);
      else void runWorkflow(item as Workflow);
    },
    [section, launch, runWorkflow],
  );

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
      const item = visible[selected];
      if (item) activate(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  };

  return (
    <div
      onKeyDown={onKeyDown}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-strong bg-popover text-popover-foreground"
    >
      <div className="relative border-b border-border">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <input
          ref={searchRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            section === "workspaces" ? "Search workspaces…" : "Search workflows…"
          }
          className="w-full bg-transparent py-3 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex gap-1 border-b border-border p-1.5">
        {(["workspaces", "workflows"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(s)}
            className={cn(
              "flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-none",
              section === s
                ? "bg-brand-muted text-brand"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-2">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {section === "workspaces"
              ? workspaces.length === 0
                ? "No workspaces yet."
                : "No matches."
              : workflows.length === 0
                ? "No workflows yet."
                : "No matches."}
          </p>
        ) : (
          <div
            role="listbox"
            aria-label={section === "workspaces" ? "Workspaces" : "Workflows"}
            className="grid grid-cols-2 gap-1.5"
          >
            {visible.map((item, i) => {
              const isSelected = i === selected;
              const accent = item.accentColor || undefined;
              const subtitle =
                section === "workspaces"
                  ? prettyPath((item as Workspace).path)
                  : `${(item as Workflow).steps.length} step${
                      (item as Workflow).steps.length === 1 ? "" : "s"
                    }`;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  ref={
                    isSelected
                      ? (el) => el?.scrollIntoView({ block: "nearest" })
                      : undefined
                  }
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => activate(item)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border p-1.5 text-left transition-colors focus-visible:outline-none",
                    isSelected
                      ? "border-brand/60 bg-brand-muted"
                      : "border-transparent hover:bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-white shadow-sm",
                      !accent && "bg-brand",
                    )}
                    style={accent ? { backgroundColor: accent } : undefined}
                    aria-hidden
                  >
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium leading-tight">
                      {item.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] leading-tight text-muted-foreground">
                      {subtitle}
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
