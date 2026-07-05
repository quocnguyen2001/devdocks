import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/features/dashboard/dashboard";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { runBeforeCloseHooks } from "@/lib/launch-ipc";
import { useLaunchStore } from "@/store/launch-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import type { Workspace } from "@/types/workspace";

// The editor pulls in React Hook Form + Zod; lazy-load it so the dashboard boots
// with a lean initial bundle.
const WorkspaceEditor = lazy(() =>
  import("@/features/workspace-config/workspace-editor").then((m) => ({
    default: m.WorkspaceEditor,
  })),
);

type View =
  | { mode: "list" }
  | { mode: "new" }
  | { mode: "edit"; ws: Workspace };

function App() {
  const [view, setView] = useState<View>({ mode: "list" });
  const save = useWorkspaceStore((s) => s.save);

  useKeyboardShortcuts({
    onNew: () => setView((v) => (v.mode === "list" ? { mode: "new" } : v)),
    onEscape: () => setView((v) => (v.mode === "list" ? v : { mode: "list" })),
  });

  // Best-effort before-close hooks for the last-launched workspace on a graceful
  // window close (not guaranteed on force-quit/crash/logout — review M1).
  const lastLaunchedId = useLaunchStore((s) => s.lastLaunchedWorkspaceId);
  const lastRef = useRef<string | null>(null);
  const closingRef = useRef(false);
  useEffect(() => {
    lastRef.current = lastLaunchedId;
  }, [lastLaunchedId]);
  useEffect(() => {
    let cleanup = () => {};
    try {
      const win = getCurrentWindow();
      const unlisten = win.onCloseRequested(async (event) => {
        const id = lastRef.current;
        if (closingRef.current || !id) return; // nothing to run → close normally
        event.preventDefault();
        closingRef.current = true;
        try {
          await runBeforeCloseHooks(id);
        } catch {
          /* best-effort */
        }
        await win.destroy();
      });
      cleanup = () => void unlisten.then((f) => f());
    } catch {
      /* window API unavailable (e.g. non-Tauri context) */
    }
    return () => cleanup();
  }, []);

  const handleSave = async (ws: Workspace) => {
    await save(ws);
    setView({ mode: "list" });
  };

  const backToList = () => setView({ mode: "list" });

  return (
    <AppShell>
      {view.mode === "list" && (
        <Dashboard
          onNew={() => setView({ mode: "new" })}
          onEdit={(ws) => setView({ mode: "edit", ws })}
        />
      )}
      <Suspense
        fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}
      >
        {view.mode === "new" && (
          <WorkspaceEditor onSave={handleSave} onCancel={backToList} />
        )}
        {view.mode === "edit" && (
          <WorkspaceEditor
            initial={view.ws}
            onSave={handleSave}
            onCancel={backToList}
          />
        )}
      </Suspense>
    </AppShell>
  );
}

export default App;
