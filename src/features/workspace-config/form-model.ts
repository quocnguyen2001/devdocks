import { z } from "zod";
import type { Workspace } from "@/types/workspace";

// A flat, form-friendly model. It decouples React Hook Form from the strict
// nested/nullable Workspace shape (Phase 2), then maps to/from it — preserving
// fields not edited in the form (startupSequence, dependencies, metadata,
// schemaVersion). The Rust `validate()` on save is the real gate.

export const terminalFormSchema = z.object({
  id: z.string(),
  app: z.string().min(1, "Select a terminal"),
  cwd: z.string(),
  command: z.string(),
  delay: z.number().int().min(0),
});

export const browserUrlFormSchema = z.object({
  url: z
    .string()
    .refine(
      (u) => u.startsWith("http://") || u.startsWith("https://"),
      "Must be an http(s) URL",
    ),
  browser: z.string(),
});

export const hookFormSchema = z.object({
  command: z.string().min(1, "Command required"),
  cwd: z.string(), // "" = workspace dir
  timeoutSecs: z.number().int().min(1),
  failurePolicy: z.enum(["continue", "halt"]),
});

export const envVarFormSchema = z.object({
  key: z.string().min(1, "Key required"),
  value: z.string(),
});

export const workspaceFormSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  path: z.string().min(1, "Path is required"),
  description: z.string(),
  icon: z.string(),
  accentColor: z.string(),
  tags: z.string(), // comma-separated in the UI
  ideApp: z.string(), // "" = none
  terminals: z.array(terminalFormSchema),
  aiTools: z.array(z.string()),
  applications: z.array(z.string()),
  browserUrls: z.array(browserUrlFormSchema),
  hooks: z.object({
    beforeLaunch: z.array(hookFormSchema),
    afterLaunch: z.array(hookFormSchema),
    beforeClose: z.array(hookFormSchema),
  }),
  envVars: z.array(envVarFormSchema),
});

export type WorkspaceForm = z.infer<typeof workspaceFormSchema>;
export type HookForm = z.infer<typeof hookFormSchema>;

const emptyHooks = () => ({
  beforeLaunch: [] as HookForm[],
  afterLaunch: [] as HookForm[],
  beforeClose: [] as HookForm[],
});

export function newFormDefaults(): WorkspaceForm {
  return {
    id: crypto.randomUUID(),
    name: "",
    path: "",
    description: "",
    icon: "",
    accentColor: "",
    tags: "",
    ideApp: "",
    terminals: [],
    aiTools: [],
    applications: [],
    browserUrls: [],
    hooks: emptyHooks(),
    envVars: [],
  };
}

const hookToForm = (h: Workspace["hooks"]["beforeLaunch"][number]): HookForm => ({
  command: h.command,
  cwd: h.cwd ?? "",
  timeoutSecs: h.timeoutSecs,
  failurePolicy: h.failurePolicy,
});

export function fromWorkspace(ws: Workspace): WorkspaceForm {
  return {
    id: ws.id,
    name: ws.name,
    path: ws.path,
    description: ws.description ?? "",
    icon: ws.icon ?? "",
    accentColor: ws.accentColor ?? "",
    tags: ws.tags.join(", "),
    ideApp: ws.ide?.app ?? "",
    terminals: ws.terminals,
    aiTools: ws.aiTools,
    applications: ws.applications,
    browserUrls: ws.browserUrls.map((u) => ({
      url: u.url,
      browser: u.browser ?? "",
    })),
    hooks: {
      beforeLaunch: ws.hooks.beforeLaunch.map(hookToForm),
      afterLaunch: ws.hooks.afterLaunch.map(hookToForm),
      beforeClose: ws.hooks.beforeClose.map(hookToForm),
    },
    envVars: ws.envVars,
  };
}

const hookFromForm = (h: HookForm) => ({
  command: h.command,
  cwd: h.cwd.trim() || null,
  timeoutSecs: h.timeoutSecs,
  failurePolicy: h.failurePolicy,
});

/** Merge form values into a Workspace, preserving base fields not in the form. */
export function toWorkspace(form: WorkspaceForm, base?: Workspace): Workspace {
  const tags = form.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    id: form.id,
    schemaVersion: base?.schemaVersion ?? 1,
    name: form.name.trim(),
    path: form.path.trim(),
    description: form.description.trim() || null,
    icon: form.icon.trim() || null,
    accentColor: form.accentColor.trim() || null,
    tags,
    ide: form.ideApp ? { app: form.ideApp } : null,
    terminals: form.terminals,
    aiTools: form.aiTools,
    applications: form.applications,
    dependencies: base?.dependencies ?? [],
    browserUrls: form.browserUrls.map((u) => ({
      url: u.url.trim(),
      browser: u.browser.trim() || null,
    })),
    startupSequence: base?.startupSequence ?? [],
    hooks: {
      beforeLaunch: form.hooks.beforeLaunch.map(hookFromForm),
      afterLaunch: form.hooks.afterLaunch.map(hookFromForm),
      beforeClose: form.hooks.beforeClose.map(hookFromForm),
    },
    envVars: form.envVars,
    metadata: base?.metadata ?? {
      createdAt: null,
      updatedAt: null,
      lastLaunched: null,
    },
  };
}
