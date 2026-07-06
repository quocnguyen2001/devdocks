import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLaunchStore } from "@/store/launch-store";
import type { StepStatus } from "@/types/launch";

const statusColor: Record<StepStatus, string> = {
  pending: "text-muted-foreground",
  running: "text-brand",
  ok: "text-success",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
};

/** Live launch feedback: per-step status + per-step retry (Phase 3 `retry_step`)
 *  + partial-restore summary. Renders nothing when no run has started. */
export function LaunchProgress() {
  const { order, steps, summary, retry } = useLaunchStore();
  const [retrying, setRetrying] = useState<string | null>(null);
  if (order.length === 0) return null;

  const onRetry = async (stepId: string) => {
    setRetrying(stepId);
    try {
      await retry(stepId);
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-elevated/60 p-4">
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
                  loading={retrying === s.stepId}
                  onClick={() => void onRetry(s.stepId)}
                >
                  {retrying !== s.stepId && <RotateCw className="h-3.5 w-3.5" />}{" "}
                  Retry
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
