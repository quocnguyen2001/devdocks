import { useState } from "react";
import { motion } from "motion/react";
import { Copy, ListChecks, Pencil, Play, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Workflow, WorkflowRunStatus } from "@/types/workflow";

interface WorkflowCardProps {
  wf: Workflow;
  /** True only while THIS workflow's run is in flight. */
  running: boolean;
  /** True while another automation holds the single-active run slot. */
  disabled?: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const LAST_RUN_BADGE: Record<WorkflowRunStatus, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "text-success" },
  failed: { label: "Failed", cls: "text-destructive" },
  cancelled: { label: "Cancelled", cls: "text-muted-foreground" },
};

export function WorkflowCard({
  wf,
  running,
  disabled,
  onRun,
  onEdit,
  onDuplicate,
  onDelete,
}: WorkflowCardProps) {
  const accent = wf.accentColor || undefined;
  const reduced = useReducedMotion();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const initial = wf.name.trim().charAt(0).toUpperCase() || "?";
  const lastRun = wf.metadata.lastRunStatus
    ? LAST_RUN_BADGE[wf.metadata.lastRunStatus]
    : null;

  return (
    <motion.div
      className="group flex flex-col gap-3 rounded-xl border border-border bg-elevated/70 p-4 transition-[border-color] hover:border-border-strong"
      style={
        accent ? { borderLeftColor: accent, borderLeftWidth: "3px" } : undefined
      }
      {...fadeInUp(reduced)}
      whileHover={reduced ? undefined : { y: -1 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-muted text-sm font-semibold text-brand"
            style={accent ? { backgroundColor: `${accent}33`, color: accent } : undefined}
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-card-title truncate">{wf.name}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {lastRun && (
          <Badge size="sm" className={cn("shrink-0", lastRun.cls)}>
            {lastRun.label}
          </Badge>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between">
        <Button
          size="sm"
          onClick={onRun}
          loading={running}
          disabled={disabled && !running}
        >
          {!running && <Play className="h-4 w-4" />} Run
        </Button>
        {/* Secondary actions: revealed on hover/focus, always present for keyboard. */}
        <div className="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDuplicate}
            aria-label="Duplicate"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${wf.name}"?`}
        description="This removes the workflow configuration. This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={onDelete}
      />
    </motion.div>
  );
}
