import { describe, it, expect } from "vitest";
import { workflowSchema, workflowStepSchema } from "@/lib/workflow-schema";

// Guards Rust<->Zod drift: enum string values and wire shapes must match the
// Rust serde variants exactly (src-tauri/src/models/workflow.rs).

describe("workflowStepSchema", () => {
  it("round-trips a launchWorkspace step", () => {
    const parsed = workflowStepSchema.parse({
      id: "s1",
      kind: "launchWorkspace",
      workspaceId: "ws-1",
    });
    expect(parsed.kind).toBe("launchWorkspace");
    expect(parsed.enabled).toBe(true);
    expect(parsed.failurePolicy).toBe("continue");
  });

  it("round-trips an openApp step", () => {
    const parsed = workflowStepSchema.parse({
      kind: "openApp",
      appName: "Visual Studio Code",
    });
    if (parsed.kind !== "openApp") throw new Error("expected openApp");
    expect(parsed.appName).toBe("Visual Studio Code");
  });

  it("fills defaults for a runScript step with only kind + command", () => {
    const parsed = workflowStepSchema.parse({ kind: "runScript", command: "npm run dev" });
    if (parsed.kind !== "runScript") throw new Error("expected runScript");
    expect(parsed.timeoutSecs).toBe(30);
    expect(parsed.cwd).toBeNull();
    expect(parsed.enabled).toBe(true);
  });

  it("round-trips a delay step", () => {
    const parsed = workflowStepSchema.parse({ kind: "delay", durationMs: 1000 });
    if (parsed.kind !== "delay") throw new Error("expected delay");
    expect(parsed.durationMs).toBe(1000);
  });

  it("rejects an openApp step with an invalid appName", () => {
    expect(() =>
      workflowStepSchema.parse({ kind: "openApp", appName: "../evil" }),
    ).toThrow();
    expect(() => workflowStepSchema.parse({ kind: "openApp", appName: "a/b" })).toThrow();
  });

  it("rejects a delay durationMs over the 1h cap", () => {
    expect(() =>
      workflowStepSchema.parse({ kind: "delay", durationMs: 3_600_001 }),
    ).toThrow();
  });

  it("rejects a runScript timeoutSecs over the 1h cap", () => {
    expect(() =>
      workflowStepSchema.parse({ kind: "runScript", command: "ls", timeoutSecs: 3601 }),
    ).toThrow();
  });

  it("rejects a non-positive durationMs or timeoutSecs", () => {
    expect(() => workflowStepSchema.parse({ kind: "delay", durationMs: 0 })).toThrow();
    expect(() =>
      workflowStepSchema.parse({ kind: "runScript", command: "ls", timeoutSecs: 0 }),
    ).toThrow();
  });

  it("cross-language fixture parity: parses the exact JSON Rust would emit for each kind", () => {
    const fixtures = [
      {
        id: "a",
        label: null,
        enabled: true,
        failurePolicy: "continue",
        kind: "launchWorkspace",
        workspaceId: "ws-1",
      },
      {
        id: "b",
        label: "Open editor",
        enabled: true,
        failurePolicy: "halt",
        kind: "openApp",
        appName: "Visual Studio Code",
      },
      {
        id: "c",
        label: null,
        enabled: false,
        failurePolicy: "continue",
        kind: "runScript",
        command: "echo hi",
        cwd: null,
        timeoutSecs: 30,
      },
      {
        id: "d",
        label: null,
        enabled: true,
        failurePolicy: "continue",
        kind: "delay",
        durationMs: 1000,
      },
    ];
    for (const fixture of fixtures) {
      expect(() => workflowStepSchema.parse(fixture)).not.toThrow();
    }
  });
});

describe("workflowSchema", () => {
  const fullWorkflow = {
    id: "wf-1",
    schemaVersion: 1,
    name: "Morning Startup",
    description: "Boot the whole stack",
    accentColor: "#3366ff",
    steps: [
      { kind: "launchWorkspace" as const, workspaceId: "ws-1" },
      { kind: "openApp" as const, appName: "Slack" },
      { kind: "runScript" as const, command: "docker compose up -d" },
      { kind: "delay" as const, durationMs: 2000 },
    ],
    metadata: {
      createdAt: null,
      updatedAt: null,
      lastRunAt: null,
      lastRunStatus: null,
    },
  };

  it("accepts a full workflow with every step kind", () => {
    const parsed = workflowSchema.parse(fullWorkflow);
    expect(parsed.steps).toHaveLength(4);
    expect(parsed.name).toBe("Morning Startup");
  });

  it("applies defaults for omitted optional sections", () => {
    const parsed = workflowSchema.parse({ id: "x", name: "X" });
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.steps).toEqual([]);
    expect(parsed.metadata.lastRunStatus).toBeNull();
  });

  it("rejects an empty name", () => {
    expect(() => workflowSchema.parse({ id: "x", name: "" })).toThrow();
  });

  it("rejects an invalid lastRunStatus enum value", () => {
    const bad = {
      ...fullWorkflow,
      metadata: { ...fullWorkflow.metadata, lastRunStatus: "bogus" },
    };
    expect(() => workflowSchema.parse(bad)).toThrow();
  });
});
