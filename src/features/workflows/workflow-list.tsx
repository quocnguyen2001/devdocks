import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Plus, Search, Workflow as WorkflowIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { WorkflowRunPanel } from "@/features/workflows/workflow-run-panel";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useWorkflowRunStore } from "@/store/workflow-run-store";
import { useWorkflowStore } from "@/store/workflow-store";
import type { Workflow } from "@/types/workflow";

interface WorkflowListProps {
  onNew: () => void;
  onEdit: (wf: Workflow) => void;
}

export function filterWorkflows(workflows: Workflow[], search: string): Workflow[] {
  const q = search.trim().toLowerCase();
  if (!q) return workflows;
  return workflows.filter((wf) => wf.name.toLowerCase().includes(q));
}

export function WorkflowList({ onNew, onEdit }: WorkflowListProps) {
  const { workflows, isLoading, error, fetch, remove, duplicate } =
    useWorkflowStore();
  const { run, isRunning, runningWorkflowId } = useWorkflowRunStore();
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const onRun = (wf: Workflow) => {
    if (isRunning) {
      toast("A run is already in progress", {
        description: "Wait for it to finish, or cancel it first.",
      });
      return;
    }
    void run(wf.id).then(() => {
      const err = useWorkflowRunStore.getState().error;
      if (err) toast("Couldn't start the run", { description: err });
    });
  };

  useEffect(() => {
    void fetch();
    // Refetch when a save (editor) or run (popover) changes the workflow set.
    const changed = listen("workflows:changed", () => void fetch());
    return () => void changed.then((un) => un());
  }, [fetch]);

  useKeyboardShortcuts({ onSearch: () => searchRef.current?.focus() });

  const filtered = useMemo(
    () => filterWorkflows(workflows, search),
    [workflows, search],
  );

  const hasWorkflows = workflows.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="pl-8"
            placeholder="Search workflows…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4" /> New workflow
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <WorkflowRunPanel />

      {!isLoading && !hasWorkflows && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <div className="rounded-full bg-brand-muted p-3 text-brand">
            <WorkflowIcon className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">No workflows yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Chain workspace launches, apps, scripts, and delays into a single
            one-click run.
          </p>
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" /> Create your first workflow
          </Button>
        </div>
      )}

      {hasWorkflows && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No workflows match the current search.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((wf) => (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              running={runningWorkflowId === wf.id}
              disabled={isRunning && runningWorkflowId !== wf.id}
              onRun={() => onRun(wf)}
              onEdit={() => onEdit(wf)}
              onDuplicate={() => void duplicate(wf.id)}
              onDelete={() => void remove(wf.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
