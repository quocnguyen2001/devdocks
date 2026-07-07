import { describe, it, expect } from "vitest";
import {
  fromWorkflow,
  newStep,
  newWorkflowDefaults,
  stepFormSchema,
  toWorkflow,
  workflowFormSchema,
} from "@/features/workflows/form-model";
import type { Workflow } from "@/types/workflow";

describe("workflow form model", () => {
  it("rejects empty name / empty step list", () => {
    const result = workflowFormSchema.safeParse(newWorkflowDefaults());
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const form = { ...newWorkflowDefaults(), name: "   ", steps: [newStep("delay")] };
    expect(workflowFormSchema.safeParse(form).success).toBe(false);
  });

  it("newStep produces a valid step per kind", () => {
    for (const kind of ["launchWorkspace", "openApp", "runScript", "delay"] as const) {
      const step = newStep(kind);
      expect(step.kind).toBe(kind);
    }
  });

  it("launchWorkspace with no workspace selected fails with 'Pick a workspace'", () => {
    const step = newStep("launchWorkspace");
    const result = stepFormSchema.safeParse(step);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Pick a workspace");
    }
  });

  it("rejects whitespace-only command/appName so a form pass can't fail the backend", () => {
    const script = { ...newStep("runScript"), command: "   " };
    expect(stepFormSchema.safeParse(script).success).toBe(false);

    const app = { ...newStep("openApp"), appName: "   " };
    expect(stepFormSchema.safeParse(app).success).toBe(false);
  });

  it("maps form → workflow for each step kind; empty label/cwd → null", () => {
    const form = workflowFormSchema.parse({
      ...newWorkflowDefaults(),
      name: "Morning routine",
      steps: [
        { ...newStep("launchWorkspace"), workspaceId: "ws-1" },
        { ...newStep("openApp"), appName: "Slack" },
        { ...newStep("runScript"), command: "echo hi", cwd: "", timeoutSecs: 10 },
        { ...newStep("delay"), durationMs: 2000 },
      ],
    });
    const wf = toWorkflow(form);
    expect(wf.steps).toHaveLength(4);
    expect(wf.steps[0]).toMatchObject({ kind: "launchWorkspace", workspaceId: "ws-1" });
    expect(wf.steps[1]).toMatchObject({ kind: "openApp", appName: "Slack" });
    expect(wf.steps[2]).toMatchObject({ kind: "runScript", command: "echo hi", cwd: null });
    expect(wf.steps[3]).toMatchObject({ kind: "delay", durationMs: 2000 });
    expect(wf.steps.every((s) => s.label === null)).toBe(true);
  });

  it("round-trips fromWorkflow → toWorkflow preserving id, schemaVersion, metadata", () => {
    const wf: Workflow = {
      id: "wf-1",
      schemaVersion: 1,
      name: "Deploy",
      description: "desc",
      accentColor: "#abcdef",
      steps: [
        {
          id: "s1",
          label: "Build",
          enabled: true,
          failurePolicy: "halt",
          kind: "runScript",
          command: "npm run build",
          cwd: "backend",
          timeoutSecs: 60,
        },
      ],
      metadata: {
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        lastRunAt: "2026-01-03T00:00:00Z",
        lastRunStatus: "completed",
      },
    };
    const form = fromWorkflow(wf);
    const back = toWorkflow(workflowFormSchema.parse(form), wf);
    expect(back.id).toBe(wf.id);
    expect(back.schemaVersion).toBe(wf.schemaVersion);
    expect(back.metadata).toEqual(wf.metadata);
    expect(back.steps[0]).toEqual(wf.steps[0]);
  });
});
