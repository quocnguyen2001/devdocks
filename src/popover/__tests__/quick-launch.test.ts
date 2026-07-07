import { describe, it, expect } from "vitest";
import { filterByQuery, sortRecentFirst } from "@/popover/quick-launch";
import type { Workflow } from "@/types/workflow";
import type { Workspace } from "@/types/workspace";

function wf(name: string, lastRunAt: string | null): Workflow {
  return {
    id: name,
    schemaVersion: 1,
    name,
    accentColor: null,
    steps: [],
    metadata: { createdAt: null, updatedAt: null, lastRunAt, lastRunStatus: null },
  } as unknown as Workflow;
}

function ws(name: string, path: string, lastLaunched: string | null): Workspace {
  return {
    id: name,
    schemaVersion: 1,
    name,
    path,
    description: null,
    icon: null,
    accentColor: null,
    tags: [],
    ide: null,
    terminals: [],
    aiTools: [],
    applications: [],
    dependencies: [],
    browserUrls: [],
    startupSequence: [],
    hooks: { beforeLaunch: [], afterLaunch: [], beforeClose: [] },
    envVars: [],
    metadata: { createdAt: null, updatedAt: null, lastLaunched },
  };
}

const wsStamp = (w: Workspace) => w.metadata.lastLaunched;
const wsName = (w: Workspace) => w.name;
const wsFields = (w: Workspace) => [w.name, w.path];

const wfStamp = (w: Workflow) => w.metadata.lastRunAt;
const wfName = (w: Workflow) => w.name;
const wfFields = (w: Workflow) => [w.name];

describe("popover quick-launch", () => {
  it("sorts workspaces recent-first, then by name", () => {
    const list = [
      ws("Beta", "/b", null),
      ws("Alpha", "/a", "2026-01-02T00:00:00Z"),
      ws("Gamma", "/g", "2026-01-03T00:00:00Z"),
    ];
    expect(sortRecentFirst(list, wsStamp, wsName).map((w) => w.name)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
  });

  it("does not mutate the input", () => {
    const list = [ws("B", "/b", null), ws("A", "/a", "x")];
    const snapshot = [...list];
    sortRecentFirst(list, wsStamp, wsName);
    expect(list).toEqual(snapshot);
  });

  it("filters workspaces by name or path, case-insensitive", () => {
    const list = [ws("Laravel CRM", "/Users/me/crm", null), ws("API", "/srv/api", null)];
    expect(filterByQuery(list, "CRM", wsFields).map((w) => w.name)).toEqual([
      "Laravel CRM",
    ]);
    expect(filterByQuery(list, "/srv", wsFields).map((w) => w.name)).toEqual([
      "API",
    ]);
    expect(filterByQuery(list, "   ", wsFields)).toHaveLength(2);
  });

  it("sorts workflows recent-first, then by name", () => {
    const list = [
      wf("Beta", null),
      wf("Alpha", "2026-01-02T00:00:00Z"),
      wf("Gamma", "2026-01-03T00:00:00Z"),
    ];
    expect(sortRecentFirst(list, wfStamp, wfName).map((w) => w.name)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
  });

  it("filters workflows by name, case-insensitive", () => {
    const list = [wf("Deploy Site", null), wf("Backup DB", null)];
    expect(filterByQuery(list, "deploy", wfFields).map((w) => w.name)).toEqual([
      "Deploy Site",
    ]);
    expect(filterByQuery(list, "   ", wfFields)).toHaveLength(2);
  });
});
