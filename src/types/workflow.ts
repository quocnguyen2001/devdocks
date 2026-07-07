// Workflow types are inferred from the single Zod source of truth
// (src/lib/workflow-schema.ts) so there is no second hand-maintained
// definition to drift. Import workflow types from here.
import type { z } from "zod";
import type {
  workflowSchema,
  workflowStepSchema,
  workflowStepKindSchema,
  workflowRunStatusSchema,
  workflowMetadataSchema,
} from "@/lib/workflow-schema";

export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowStepKind = z.infer<typeof workflowStepKindSchema>;
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;
export type WorkflowMetadata = z.infer<typeof workflowMetadataSchema>;

// `workflow:progress` reuses the existing `LaunchProgress` type (imported from
// `types/launch` where consumed) — same fields, new event name, no separate
// mirror. `WorkflowSummary` (the `workflow:done` payload) is genuinely new.
export interface WorkflowSummary {
  runId: string;
  workflowId: string;
  total: number;
  ok: number;
  failed: number;
  skipped: number;
  cancelled: number;
  status: WorkflowRunStatus;
}
