import { describe, it, expect } from "vitest";
import { filterWorkflows } from "@/features/workflows/workflow-list";
import type { Workflow } from "@/types/workflow";

function wf(over: Partial<Workflow>): Workflow {
  return {
    id: "1",
    schemaVersion: 1,
    name: "A",
    description: null,
    accentColor: null,
    steps: [],
    metadata: { createdAt: null, updatedAt: null, lastRunAt: null, lastRunStatus: null },
    ...over,
  };
}

describe("filterWorkflows", () => {
  const workflows = [
    wf({ id: "1", name: "Morning routine" }),
    wf({ id: "2", name: "Deploy staging" }),
    wf({ id: "3", name: "MORNING backup" }),
  ];

  it("returns all workflows when search is blank", () => {
    expect(filterWorkflows(workflows, "")).toHaveLength(3);
    expect(filterWorkflows(workflows, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively by name substring", () => {
    const result = filterWorkflows(workflows, "morning");
    expect(result.map((w) => w.id)).toEqual(["1", "3"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterWorkflows(workflows, "nonexistent")).toEqual([]);
  });
});
