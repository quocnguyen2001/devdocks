import { describe, it, expect } from "vitest";
import {
  fromWorkspace,
  newFormDefaults,
  toWorkspace,
  workspaceFormSchema,
} from "@/features/workspace-config/form-model";

describe("workspace form model", () => {
  it("rejects empty name/path", () => {
    const result = workspaceFormSchema.safeParse(newFormDefaults());
    expect(result.success).toBe(false);
  });

  it("rejects a non-http(s) browser URL", () => {
    const form = {
      ...newFormDefaults(),
      name: "X",
      path: "/p",
      browserUrls: [{ url: "file:///etc/passwd", browser: "" }],
    };
    expect(workspaceFormSchema.safeParse(form).success).toBe(false);
  });

  it("maps form → workspace (ide, tags, urls, terminals)", () => {
    const parsed = workspaceFormSchema.parse({
      ...newFormDefaults(),
      name: "CRM",
      path: "/p",
      tags: "php, api",
      ideApp: "phpstorm",
      terminals: [
        { id: "t", app: "iterm2", cwd: ".", command: "npm run dev", delay: 0 },
      ],
      browserUrls: [{ url: "https://x.test", browser: "" }],
    });
    const ws = toWorkspace(parsed);
    expect(ws.name).toBe("CRM");
    expect(ws.ide).toEqual({ app: "phpstorm" });
    expect(ws.tags).toEqual(["php", "api"]);
    expect(ws.browserUrls[0]).toEqual({ url: "https://x.test", browser: null });
    expect(ws.terminals).toHaveLength(1);
    expect(ws.schemaVersion).toBe(1);
  });

  it("round-trips fromWorkspace → toWorkspace preserving id + base fields", () => {
    const ws = toWorkspace(
      workspaceFormSchema.parse({ ...newFormDefaults(), name: "X", path: "/p" }),
    );
    const back = toWorkspace(workspaceFormSchema.parse(fromWorkspace(ws)), ws);
    expect(back.id).toBe(ws.id);
    expect(back.schemaVersion).toBe(ws.schemaVersion);
    expect(back.metadata).toEqual(ws.metadata);
  });

  it("maps hooks and env vars", () => {
    const parsed = workspaceFormSchema.parse({
      ...newFormDefaults(),
      name: "X",
      path: "/p",
      hooks: {
        beforeLaunch: [
          {
            command: "docker compose up -d",
            cwd: "",
            timeoutSecs: 30,
            failurePolicy: "halt",
          },
        ],
        afterLaunch: [],
        beforeClose: [],
      },
      envVars: [{ key: "NODE_ENV", value: "development" }],
    });
    const ws = toWorkspace(parsed);
    expect(ws.hooks.beforeLaunch[0]).toEqual({
      command: "docker compose up -d",
      cwd: null,
      timeoutSecs: 30,
      failurePolicy: "halt",
    });
    expect(ws.envVars).toEqual([{ key: "NODE_ENV", value: "development" }]);
  });

  it("rejects a hook with an empty command", () => {
    const form = {
      ...newFormDefaults(),
      name: "X",
      path: "/p",
      hooks: {
        beforeLaunch: [
          { command: "", cwd: "", timeoutSecs: 30, failurePolicy: "continue" },
        ],
        afterLaunch: [],
        beforeClose: [],
      },
    };
    expect(workspaceFormSchema.safeParse(form).success).toBe(false);
  });
});
