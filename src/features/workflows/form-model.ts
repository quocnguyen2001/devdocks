import { z } from "zod";
import { failurePolicySchema } from "@/lib/workspace-schema";
import type { Workflow, WorkflowStep } from "@/types/workflow";

// A flat, form-friendly model — mirrors workspace-config/form-model.ts. It
// decouples React Hook Form from the strict nested/nullable Workflow shape,
// then maps to/from it — preserving fields not edited in the form
// (schemaVersion, metadata). The Rust `validate()` on save is the real gate.

const stepBase = {
  id: z.string(),
  label: z.string(), // "" = none
  enabled: z.boolean(),
  failurePolicy: failurePolicySchema, // "continue" | "halt"
};

// Mirror workflow-schema.ts's appNameSchema so a form-level failure surfaces
// before the backend's runtime guard.
const appNameSchema = z
  .string()
  .trim()
  .min(1, "App name required")
  .regex(/^[A-Za-z0-9 ._-]+$/, "Unsupported characters")
  .refine((s) => !s.includes(".."), "App name cannot contain '..'");

export const stepFormSchema = z.discriminatedUnion("kind", [
  z.object({
    ...stepBase,
    kind: z.literal("launchWorkspace"),
    workspaceId: z.string().min(1, "Pick a workspace"),
  }),
  z.object({
    ...stepBase,
    kind: z.literal("openApp"),
    appName: appNameSchema,
  }),
  z.object({
    ...stepBase,
    kind: z.literal("runScript"),
    command: z.string().trim().min(1, "Command required"),
    cwd: z.string(),
    timeoutSecs: z.number().int().min(1).max(3600),
  }),
  z.object({
    ...stepBase,
    kind: z.literal("delay"),
    durationMs: z.number().int().min(1).max(3_600_000),
  }),
]);

export const workflowFormSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Name is required"),
  description: z.string(),
  accentColor: z.string(),
  steps: z.array(stepFormSchema).min(1, "Add at least one step"),
});

export type WorkflowForm = z.infer<typeof workflowFormSchema>;
export type StepForm = z.infer<typeof stepFormSchema>;

/** Factory for a new step of a given kind. Always returns the full object
 *  including the discriminant so RHF/Zod infer the union member correctly. */
export function newStep(kind: StepForm["kind"]): StepForm {
  const base = {
    id: crypto.randomUUID(),
    label: "",
    enabled: true,
    failurePolicy: "continue" as const,
  };
  switch (kind) {
    case "launchWorkspace":
      return { ...base, kind, workspaceId: "" };
    case "openApp":
      return { ...base, kind, appName: "" };
    case "runScript":
      return { ...base, kind, command: "", cwd: "", timeoutSecs: 30 };
    case "delay":
      return { ...base, kind, durationMs: 1000 };
  }
}

export function newWorkflowDefaults(): WorkflowForm {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    accentColor: "",
    steps: [],
  };
}

function stepToForm(step: WorkflowStep): StepForm {
  const base = {
    id: step.id,
    label: step.label ?? "",
    enabled: step.enabled,
    failurePolicy: step.failurePolicy,
  };
  switch (step.kind) {
    case "launchWorkspace":
      return { ...base, kind: step.kind, workspaceId: step.workspaceId };
    case "openApp":
      return { ...base, kind: step.kind, appName: step.appName };
    case "runScript":
      return {
        ...base,
        kind: step.kind,
        command: step.command,
        cwd: step.cwd ?? "",
        timeoutSecs: step.timeoutSecs,
      };
    case "delay":
      return { ...base, kind: step.kind, durationMs: step.durationMs };
  }
}

export function fromWorkflow(wf: Workflow): WorkflowForm {
  return {
    id: wf.id,
    name: wf.name,
    description: wf.description ?? "",
    accentColor: wf.accentColor ?? "",
    steps: wf.steps.map(stepToForm),
  };
}

function stepFromForm(step: StepForm): WorkflowStep {
  const base = {
    id: step.id,
    label: step.label.trim() || null,
    enabled: step.enabled,
    failurePolicy: step.failurePolicy,
  };
  switch (step.kind) {
    case "launchWorkspace":
      return { ...base, kind: step.kind, workspaceId: step.workspaceId };
    case "openApp":
      return { ...base, kind: step.kind, appName: step.appName.trim() };
    case "runScript":
      return {
        ...base,
        kind: step.kind,
        command: step.command.trim(),
        cwd: step.cwd.trim() || null,
        timeoutSecs: step.timeoutSecs,
      };
    case "delay":
      return { ...base, kind: step.kind, durationMs: step.durationMs };
  }
}

/** Merge form values into a Workflow, preserving base fields not in the form. */
export function toWorkflow(form: WorkflowForm, base?: Workflow): Workflow {
  return {
    id: form.id,
    schemaVersion: base?.schemaVersion ?? 1,
    name: form.name.trim(),
    description: form.description.trim() || null,
    accentColor: form.accentColor.trim() || null,
    steps: form.steps.map(stepFromForm),
    metadata: base?.metadata ?? {
      createdAt: null,
      updatedAt: null,
      lastRunAt: null,
      lastRunStatus: null,
    },
  };
}
