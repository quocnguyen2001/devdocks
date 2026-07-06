import { describe, it, expect } from "vitest";
import { filterByQuery, sortRecentFirst } from "@/popover/quick-launch";
import type { Workspace } from "@/types/workspace";

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

describe("popover quick-launch", () => {
  it("sorts recent-first, then by name", () => {
    const list = [
      ws("Beta", "/b", null),
      ws("Alpha", "/a", "2026-01-02T00:00:00Z"),
      ws("Gamma", "/g", "2026-01-03T00:00:00Z"),
    ];
    expect(sortRecentFirst(list).map((w) => w.name)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
  });

  it("does not mutate the input", () => {
    const list = [ws("B", "/b", null), ws("A", "/a", "x")];
    const snapshot = [...list];
    sortRecentFirst(list);
    expect(list).toEqual(snapshot);
  });

  it("filters by name or path, case-insensitive", () => {
    const list = [ws("Laravel CRM", "/Users/me/crm", null), ws("API", "/srv/api", null)];
    expect(filterByQuery(list, "CRM").map((w) => w.name)).toEqual(["Laravel CRM"]);
    expect(filterByQuery(list, "/srv").map((w) => w.name)).toEqual(["API"]);
    expect(filterByQuery(list, "   ")).toHaveLength(2);
  });
});
