import { Button } from "@/components/ui/button";
import { useWorkflowRunStore } from "@/store/workflow-run-store";
import type { StepStatus } from "@/types/launch";

const statusColor: Record<StepStatus, string> = {
  pending: "text-muted-foreground",
  running: "text-brand",
  ok: "text-success",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
  cancelled: "text-muted-foreground",
};

/** Live workflow run feedback: per-step status + a Cancel button + a terminal
 *  summary. Observes the module-scope run store, so a run started from any
 *  window (including the popover) is visible here. Renders nothing when no
 *  run has started yet. */
export function WorkflowRunPanel() {
  const { order, steps, summary, isRunning, error, cancel } =
    useWorkflowRunStore();
  if (order.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-elevated/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Run progress
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={!isRunning}
          onClick={() => void cancel()}
        >
          Cancel
        </Button>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {order.map((id) => {
          const s = steps[id];
          return (
            <li key={id} className="flex items-center justify-between gap-2">
              <span>
                <span className={statusColor[s.status]}>{s.status}</span>{" "}
                {s.label}
                {s.message && (
                  <span className="text-muted-foreground"> — {s.message}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {summary && (
        <p className="mt-2 text-xs text-muted-foreground">
          {summary.ok} ok · {summary.failed} failed · {summary.skipped} skipped
          {summary.cancelled > 0 ? ` · ${summary.cancelled} cancelled` : ""}
          {" · "}
          {summary.status}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
