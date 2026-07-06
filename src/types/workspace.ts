// Workspace types are inferred from the single Zod source of truth
// (src/lib/workspace-schema.ts) so there is no second hand-maintained
// definition to drift. Import workspace types from here.
import type { z } from "zod";
import type {
  workspaceSchema,
  ideConfigSchema,
  terminalConfigSchema,
  dependencyConfigSchema,
  browserUrlSchema,
  startupStepSchema,
  hookConfigSchema,
  hooksSchema,
  envVarSchema,
  metadataSchema,
  onTimeoutSchema,
  failurePolicySchema,
  stepKindSchema,
} from "@/lib/workspace-schema";

export type Workspace = z.infer<typeof workspaceSchema>;
export type IdeConfig = z.infer<typeof ideConfigSchema>;
export type TerminalConfig = z.infer<typeof terminalConfigSchema>;
export type DependencyConfig = z.infer<typeof dependencyConfigSchema>;
export type BrowserUrl = z.infer<typeof browserUrlSchema>;
export type StartupStep = z.infer<typeof startupStepSchema>;
export type HookConfig = z.infer<typeof hookConfigSchema>;
export type Hooks = z.infer<typeof hooksSchema>;
export type EnvVar = z.infer<typeof envVarSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export type OnTimeout = z.infer<typeof onTimeoutSchema>;
export type FailurePolicy = z.infer<typeof failurePolicySchema>;
export type StepKind = z.infer<typeof stepKindSchema>;
