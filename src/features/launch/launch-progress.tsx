import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLaunchStore } from "@/store/launch-store";
import type { StepStatus } from "@/types/launch";

const statusColor: Record<StepStatus, string> = {
  pending: "text-muted-foreground",
  running: "text-foreground",
  ok: "text-green-600 dark:text-green-400",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
};

/** Live launch feedback: per-step status + per-step retry (Phase 3 `retry_step`)
 *  + partial-restore summary. Renders nothing when no run has started. */
export function LaunchProgress() {
  const { order, steps, summary, retry } = useLaunchStore();
  if (order.length === 0) return null;

  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Launch progress
      </p>
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
              {s.status === "failed" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void retry(s.stepId)}
                >
                  <RotateCw className="h-3.5 w-3.5" /> Retry
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {summary && (
        <p className="mt-2 text-xs text-muted-foreground">
          {summary.ok} ok · {summary.failed} failed · {summary.skipped} skipped
          {summary.partial ? " · partial restore" : ""}
        </p>
      )}
    </div>
  );
}
