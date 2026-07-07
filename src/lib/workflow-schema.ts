import { z } from "zod";

import { failurePolicySchema } from "./workspace-schema"; // reuse: ["continue","halt"]

// Zod schema mirroring the Rust `Workflow` model (src-tauri/src/models/workflow.rs).
// This is the single TypeScript source of truth: types are inferred from it
// (see src/types/workflow.ts). Keys are camelCase to match serde's
// `rename_all = "camelCase"` (+ `rename_all_fields` on the step enum). Enum
// string values must equal the Rust variants exactly.

export const workflowRunStatusSchema = z.enum(["completed", "failed", "cancelled"]);
export const workflowStepKindSchema = z.enum([
  "launchWorkspace",
  "openApp",
  "runScript",
  "delay",
]);

// Common per-step fields spread into every discriminant member.
const stepBase = {
  id: z.string().default(() => crypto.randomUUID()),
  label: z.string().nullable().default(null),
  enabled: z.boolean().default(true),
  failurePolicy: failurePolicySchema.default("continue"),
};

// Mirror escape::validate_app_name: [A-Za-z0-9 ._-] only, no "..". Save-time parity with
// the runtime guard so an always-failing openApp step can't be saved green.
const appNameSchema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9 ._-]+$/, "App name has unsupported characters")
  .refine((s) => !s.includes(".."), "App name cannot contain '..'");

export const workflowStepSchema = z.discriminatedUnion("kind", [
  z.object({
    ...stepBase,
    kind: z.literal("launchWorkspace"),
    workspaceId: z.string().min(1),
  }),
  z.object({ ...stepBase, kind: z.literal("openApp"), appName: appNameSchema }),
  z.object({
    ...stepBase,
    kind: z.literal("runScript"),
    command: z.string().min(1),
    cwd: z.string().nullable().default(null),
    timeoutSecs: z.number().int().positive().max(3600).default(30),
  }),
  z.object({
    ...stepBase,
    kind: z.literal("delay"),
    durationMs: z.number().int().positive().max(3_600_000).default(1000),
  }),
]);

export const workflowMetadataSchema = z.object({
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  lastRunAt: z.string().nullable().default(null),
  lastRunStatus: workflowRunStatusSchema.nullable().default(null),
});

export const workflowSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int().default(1),
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().default(null),
  accentColor: z.string().nullable().default(null),
  steps: z.array(workflowStepSchema).default([]),
  metadata: workflowMetadataSchema.default({
    createdAt: null,
    updatedAt: null,
    lastRunAt: null,
    lastRunStatus: null,
  }),
});

/** Shape accepted as form input (optional fields may be omitted). */
export type WorkflowInput = z.input<typeof workflowSchema>;
/** Fully-resolved workflow (all defaults applied) — matches the Rust struct. */
export type Workflow = z.infer<typeof workflowSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
