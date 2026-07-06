import { describe, it, expect } from "vitest";
import { workspaceSchema } from "@/lib/workspace-schema";

// Guards Rust↔Zod drift: the schema must accept a full rawplan-shaped workspace
// (plus system fields) and reject malformed input. Enum string values must match
// the Rust serde variants exactly.
const fullWorkspace = {
  id: "ws-1",
  schemaVersion: 1,
  name: "Laravel CRM",
  path: "/Users/me/Projects/laravel-crm",
  description: "CRM built on Laravel",
  icon: "boxes",
  accentColor: "#b8232c",
  tags: ["php", "laravel"],
  ide: { app: "phpstorm" },
  terminals: [
    { id: "t1", app: "iterm2", cwd: ".", command: "npm run dev", delay: 0 },
    {
      id: "t2",
      app: "iterm2",
      cwd: "backend",
      command: "php artisan queue:work",
      delay: 500,
    },
  ],
  aiTools: ["claude-desktop"],
  applications: ["docker-desktop", "tableplus"],
  dependencies: [
    {
      id: "d1",
      kind: "docker",
      start: true,
      checkCmd: "docker info",
      timeoutSecs: 60,
      pollIntervalMs: 1000,
      onTimeout: "skipDependents",
      required: true,
    },
  ],
  browserUrls: [{ url: "https://example.test", browser: null }],
  startupSequence: [{ kind: "ide", target: null, delayMs: 0 }],
  hooks: {
    beforeLaunch: [
      {
        command: "docker compose up -d",
        cwd: null,
        timeoutSecs: 30,
        failurePolicy: "halt",
      },
    ],
    afterLaunch: [],
    beforeClose: [],
  },
  envVars: [{ key: "NODE_ENV", value: "development" }],
  metadata: { createdAt: null, updatedAt: null, lastLaunched: null },
};

describe("workspaceSchema", () => {
  it("accepts a full rawplan-shaped workspace with every optional field populated", () => {
    const parsed = workspaceSchema.parse(fullWorkspace);
    expect(parsed.name).toBe("Laravel CRM");
    expect(parsed.terminals).toHaveLength(2);
    expect(parsed.dependencies[0].onTimeout).toBe("skipDependents");
    expect(parsed.hooks.beforeLaunch[0].failurePolicy).toBe("halt");
  });

  it("applies defaults for omitted optional sections", () => {
    const parsed = workspaceSchema.parse({ id: "x", name: "X", path: "/p" });
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.tags).toEqual([]);
    expect(parsed.ide).toBeNull();
    expect(parsed.hooks.beforeLaunch).toEqual([]);
  });

  it("rejects an empty name", () => {
    expect(() => workspaceSchema.parse({ id: "x", name: "", path: "/p" })).toThrow();
  });

  it("rejects an invalid onTimeout enum value", () => {
    const bad = {
      ...fullWorkspace,
      dependencies: [{ ...fullWorkspace.dependencies[0], onTimeout: "bogus" }],
    };
    expect(() => workspaceSchema.parse(bad)).toThrow();
  });
});
