import { describe, it, expect } from "vitest";
import { applyProgress, type StepState } from "@/store/workflow-run-store";
import type { LaunchProgress } from "@/types/launch";

function progress(overrides: Partial<LaunchProgress> = {}): LaunchProgress {
  return {
    runId: "run-1",
    stepId: "step-1",
    kind: "delay",
    label: "Wait",
    status: "running",
    ...overrides,
  };
}

/** Matches `applyProgress`'s `Pick<WorkflowRunStore, "order" | "steps">` input shape. */
interface OrderSteps {
  order: string[];
  steps: Record<string, StepState>;
}

function emptyState(): OrderSteps {
  return { order: [], steps: {} };
}

describe("workflow run store applyProgress", () => {
  it("appends an unseen stepId to order once and upserts its status", () => {
    let state: OrderSteps = emptyState();

    const afterFirst = applyProgress(state, progress({ status: "running" }));
    state = { order: afterFirst.order, steps: afterFirst.steps };
    expect(state.order).toEqual(["step-1"]);
    expect(state.steps["step-1"].status).toBe("running");
    expect(afterFirst.isRunning).toBe(true);
    expect(afterFirst.runId).toBe("run-1");

    const afterSecond = applyProgress(state, progress({ status: "ok" }));
    state = { order: afterSecond.order, steps: afterSecond.steps };
    // Same stepId — order stays length 1, status upgraded in place.
    expect(state.order).toEqual(["step-1"]);
    expect(state.steps["step-1"].status).toBe("ok");
  });

  it("appends a second distinct stepId in arrival order", () => {
    let state: OrderSteps = emptyState();
    state = {
      ...state,
      ...applyProgress(state, progress({ stepId: "a", status: "ok" })),
    };
    state = {
      ...state,
      ...applyProgress(state, progress({ stepId: "b", status: "running" })),
    };
    expect(state.order).toEqual(["a", "b"]);
  });

  it("carries the message through", () => {
    const result = applyProgress(
      emptyState(),
      progress({ status: "failed", message: "boom" }),
    );
    expect(result.steps["step-1"].message).toBe("boom");
  });
});
