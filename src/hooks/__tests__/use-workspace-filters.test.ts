import { describe, it, expect } from "vitest";
import {
  allTags,
  emptyFilters,
  filterWorkspaces,
  hasActiveFilters,
  recentWorkspaces,
} from "@/hooks/use-workspace-filters";
import type { Workspace } from "@/types/workspace";

function ws(over: Partial<Workspace>): Workspace {
  return {
    id: "1",
    schemaVersion: 1,
    name: "A",
    path: "/a",
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
    metadata: { createdAt: null, updatedAt: null, lastLaunched: null },
    ...over,
  };
}

const list: Workspace[] = [
  ws({
    id: "1",
    name: "Laravel CRM",
    path: "/Projects/crm",
    tags: ["php"],
    metadata: { createdAt: null, updatedAt: null, lastLaunched: "2026-07-01T00:00:00Z" },
  }),
  ws({
    id: "2",
    name: "Next App",
    path: "/Projects/next",
    tags: ["js", "react"],
    metadata: { createdAt: null, updatedAt: null, lastLaunched: "2026-07-05T00:00:00Z" },
  }),
  ws({ id: "3", name: "API", path: "/work/api", tags: ["php", "go"] }),
];

const ids = (r: Workspace[]) => r.map((w) => w.id);

describe("filterWorkspaces", () => {
  it("searches name, path, and tags", () => {
    expect(ids(filterWorkspaces(list, { ...emptyFilters, search: "crm" }, new Set()))).toEqual(["1"]);
    expect(
      ids(filterWorkspaces(list, { ...emptyFilters, search: "projects" }, new Set())).sort(),
    ).toEqual(["1", "2"]);
    expect(ids(filterWorkspaces(list, { ...emptyFilters, search: "react" }, new Set()))).toEqual(["2"]);
  });

  it("filters to favorites only", () => {
    expect(
      ids(filterWorkspaces(list, { ...emptyFilters, favoritesOnly: true }, new Set(["2"]))),
    ).toEqual(["2"]);
  });

  it("filters by tags (OR semantics)", () => {
    expect(
      ids(filterWorkspaces(list, { ...emptyFilters, tags: ["php"] }, new Set())).sort(),
    ).toEqual(["1", "3"]);
  });

  it("sorts by name and by recent", () => {
    expect(
      filterWorkspaces(list, { ...emptyFilters, sort: "name" }, new Set()).map((w) => w.name),
    ).toEqual(["API", "Laravel CRM", "Next App"]);
    expect(
      ids(filterWorkspaces(list, { ...emptyFilters, sort: "recent" }, new Set())),
    ).toEqual(["2", "1", "3"]);
  });

  it("collects distinct sorted tags", () => {
    expect(allTags(list)).toEqual(["go", "js", "php", "react"]);
  });
});

describe("hasActiveFilters", () => {
  it("is false for empty filters", () => {
    expect(hasActiveFilters(emptyFilters)).toBe(false);
    // Sort alone is not an "active filter" (sections still show at rest).
    expect(hasActiveFilters({ ...emptyFilters, sort: "recent" })).toBe(false);
  });

  it("is true when search, tags, or favoritesOnly are set", () => {
    expect(hasActiveFilters({ ...emptyFilters, search: "x" })).toBe(true);
    expect(hasActiveFilters({ ...emptyFilters, tags: ["php"] })).toBe(true);
    expect(hasActiveFilters({ ...emptyFilters, favoritesOnly: true })).toBe(true);
  });
});

describe("recentWorkspaces", () => {
  it("returns only launched workspaces, newest first", () => {
    expect(ids(recentWorkspaces(list))).toEqual(["2", "1"]);
  });

  it("caps at the given limit", () => {
    expect(recentWorkspaces(list, 1).map((w) => w.id)).toEqual(["2"]);
  });
});
