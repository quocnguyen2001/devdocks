import { z } from "zod";

// Zod schema mirroring the Rust `Workspace` model (src-tauri/src/models/workspace.rs).
// This is the single TypeScript source of truth: types are inferred from it
// (see src/types/workspace.ts) and Phase 4 forms use it as the RHF resolver.
// Keys are camelCase to match serde's `rename_all = "camelCase"`. Enum string
// values must equal the Rust variants exactly.

export const onTimeoutSchema = z.enum(["skipDependents", "continue", "failRun"]);
export const failurePolicySchema = z.enum(["continue", "halt"]);
export const stepKindSchema = z.enum([
  "ide",
  "terminal",
  "application",
  "aiTool",
  "dependency",
  "browserUrls",
]);

export const ideConfigSchema = z.object({ app: z.string() });

export const terminalConfigSchema = z.object({
  // Forms may omit id; it is generated here so WorkspaceInput stays ergonomic and
  // symmetric with the Rust serde default (both sides mint a UUID when absent).
  id: z.string().default(() => crypto.randomUUID()),
  app: z.string(),
  cwd: z.string().default(""),
  command: z.string().default(""),
  delay: z.number().int().nonnegative().default(0),
});

export const dependencyConfigSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  kind: z.string(),
  start: z.boolean().default(false),
  checkCmd: z.string().nullable().default(null),
  timeoutSecs: z.number().int().positive().default(60),
  pollIntervalMs: z.number().int().positive().default(1000),
  onTimeout: onTimeoutSchema.default("skipDependents"),
  required: z.boolean().default(false),
});

export const browserUrlSchema = z.object({
  url: z.string(),
  browser: z.string().nullable().default(null),
});

export const startupStepSchema = z.object({
  kind: stepKindSchema,
  target: z.string().nullable().default(null),
  delayMs: z.number().int().nonnegative().default(0),
});

export const hookConfigSchema = z.object({
  command: z.string(),
  cwd: z.string().nullable().default(null),
  timeoutSecs: z.number().int().positive().default(30),
  failurePolicy: failurePolicySchema.default("continue"),
});

export const hooksSchema = z.object({
  beforeLaunch: z.array(hookConfigSchema).default([]),
  afterLaunch: z.array(hookConfigSchema).default([]),
  beforeClose: z.array(hookConfigSchema).default([]),
});

export const envVarSchema = z.object({ key: z.string(), value: z.string() });

export const metadataSchema = z.object({
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  lastLaunched: z.string().nullable().default(null),
});

export const workspaceSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int().default(1),
  name: z.string().min(1, "Name is required"),
  path: z.string().min(1, "Path is required"),
  description: z.string().nullable().default(null),
  icon: z.string().nullable().default(null),
  accentColor: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  ide: ideConfigSchema.nullable().default(null),
  terminals: z.array(terminalConfigSchema).default([]),
  aiTools: z.array(z.string()).default([]),
  applications: z.array(z.string()).default([]),
  dependencies: z.array(dependencyConfigSchema).default([]),
  browserUrls: z.array(browserUrlSchema).default([]),
  startupSequence: z.array(startupStepSchema).default([]),
  hooks: hooksSchema.default({ beforeLaunch: [], afterLaunch: [], beforeClose: [] }),
  envVars: z.array(envVarSchema).default([]),
  metadata: metadataSchema.default({
    createdAt: null,
    updatedAt: null,
    lastLaunched: null,
  }),
});

/** Shape accepted as form input (optional fields may be omitted). */
export type WorkspaceInput = z.input<typeof workspaceSchema>;
/** Fully-resolved workspace (all defaults applied) — matches the Rust struct. */
export type Workspace = z.infer<typeof workspaceSchema>;
