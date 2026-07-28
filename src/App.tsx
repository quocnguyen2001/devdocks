import { lazy, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AppShell, type NavSection } from "@/components/app-shell";
import { LazyBoundary } from "@/components/lazy-boundary";
import { Toaster } from "@/components/ui/toast";
import { Dashboard } from "@/features/dashboard/dashboard";
import { WorkspaceEditorSkeleton } from "@/features/workspace-config/workspace-editor-skeleton";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { WorkflowEditorSkeleton } from "@/features/workflows/workflow-editor-skeleton";
import { WorkflowList } from "@/features/workflows/workflow-list";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { runBeforeCloseHooks } from "@/lib/launch-ipc";
import { useLaunchStore } from "@/store/launch-store";
import { useWorkspaceStore } from "@/store/workspace-store";
import { useWorkflowStore } from "@/store/workflow-store";
import type { Workspace } from "@/types/workspace";
import type { Workflow } from "@/types/workflow";

// Both editors pull in React Hook Form + Zod (and the workflow editor also
// pulls in @dnd-kit); lazy-load them so the dashboard boots with a lean
// initial bundle.
const WorkspaceEditor = lazy(() =>
  import("@/features/workspace-config/workspace-editor").then((m) => ({
    default: m.WorkspaceEditor,
  })),
);
const WorkflowEditor = lazy(() =>
  import("@/features/workflows/workflow-editor").then((m) => ({
    default: m.WorkflowEditor,
  })),
);

type View =
  | { mode: "list" }
  | { mode: "new" }
  | { mode: "edit"; ws: Workspace }
  | { mode: "settings" }
  | { mode: "workflows" }
  | { mode: "workflow-new" }
  | { mode: "workflow-edit"; wf: Workflow };

function App() {
  const [view, setView] = useState<View>({ mode: "list" });
  const save = useWorkspaceStore((s) => s.save);
  const saveWorkflow = useWorkflowStore((s) => s.save);

  useKeyboardShortcuts({
    onNew: () => setView((v) => (v.mode === "list" ? { mode: "new" } : v)),
    onEscape: () =>
      setView((v) => {
        switch (v.mode) {
          // The workflow editor owns Escape: it routes through the same
          // dirty-check / ConfirmDialog as its Cancel button (Phase 4).
          // Suppress the window-level handler here.
          case "workflow-new":
          case "workflow-edit":
            return v;
          // Workflow section stays in Workflows — never warps to Workspaces.
          case "workflows":
            return { mode: "workflows" };
          // Existing workspace-editor / settings / list behavior is
          // intentionally unchanged.
          default:
            return v.mode === "list" ? v : { mode: "list" };
        }
      }),
  });

  const navigate = (section: NavSection) =>
    setView(
      section === "settings"
        ? { mode: "settings" }
        : section === "workflows"
          ? { mode: "workflows" }
          : { mode: "list" },
    );

  // Best-effort before-close hooks for the last-launched workspace on a graceful
  // window close (not guaranteed on force-quit/crash/logout — review M1).
  const lastLaunchedId = useLaunchStore((s) => s.lastLaunchedWorkspaceId);
  const lastRef = useRef<string | null>(null);
  useEffect(() => {
    lastRef.current = lastLaunchedId;
  }, [lastLaunchedId]);
  useEffect(() => {
    let cleanup = () => {};
    try {
      const win = getCurrentWindow();
      const unlisten = win.onCloseRequested(async (event) => {
        // Close-to-menu-bar: always intercept and HIDE (never destroy) so the app
        // keeps running in the menu bar. ⌘Q and the tray "Quit" do the real exit.
        // Single close handler here — no competing Rust CloseRequested handler
        // (avoids the destroy-vs-hide collision flagged in red-team).
        event.preventDefault();
        const id = lastRef.current;
        if (id) {
          try {
            await runBeforeCloseHooks(id);
          } catch {
            /* best-effort */
          }
        }
        await win.hide();
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

  const handleSaveWorkflow = async (wf: Workflow) => {
    await saveWorkflow(wf);
    setView({ mode: "workflows" });
  };

  const backToWorkflows = () => setView({ mode: "workflows" });

  return (
    <AppShell
      active={
        view.mode === "settings"
          ? "settings"
          : view.mode === "workflows" || view.mode.startsWith("workflow-")
            ? "workflows"
            : "workspaces"
      }
      onNavigate={navigate}
    >
      {view.mode === "list" && (
        <Dashboard
          onNew={() => setView({ mode: "new" })}
          onEdit={(ws) => setView({ mode: "edit", ws })}
        />
      )}
      {view.mode === "settings" && <SettingsScreen />}
      {view.mode === "workflows" && (
        <WorkflowList
          onNew={() => setView({ mode: "workflow-new" })}
          onEdit={(wf) => setView({ mode: "workflow-edit", wf })}
        />
      )}
      <LazyBoundary fallback={<WorkspaceEditorSkeleton />}>
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
      </LazyBoundary>
      <LazyBoundary fallback={<WorkflowEditorSkeleton />}>
        {view.mode === "workflow-new" && (
          <WorkflowEditor onSave={handleSaveWorkflow} onCancel={backToWorkflows} />
        )}
        {view.mode === "workflow-edit" && (
          <WorkflowEditor
            initial={view.wf}
            onSave={handleSaveWorkflow}
            onCancel={backToWorkflows}
          />
        )}
      </LazyBoundary>
      <Toaster />
    </AppShell>
  );
}

export default App;
