// Mirrors the Rust launch-engine event/response shapes (camelCase serde).

export type StepStatus =
  | "pending"
  | "running"
  | "ok"
  | "failed"
  | "skipped"
  | "cancelled";

export type DetectMethod =
  | "cli"
  | "applicationsDir"
  | "spotlight"
  | "override"
  | "notFound";

export interface Detected {
  id: string;
  available: boolean;
  method: DetectMethod;
  resolvedPath?: string;
}

/** `launch:progress` event payload. */
export interface LaunchProgress {
  runId: string;
  stepId: string;
  kind: string;
  label: string;
  status: StepStatus;
  message?: string;
}

/** `launch:done` event payload + `launch_workspace` return. */
export interface LaunchSummary {
  runId: string;
  total: number;
  ok: number;
  failed: number;
  skipped: number;
  partial: boolean;
}
