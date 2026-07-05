// UI-facing tool lists (ids match the Rust detection catalog in detect.rs).

export interface ToolOption {
  id: string;
  label: string;
}

export const IDE_OPTIONS: ToolOption[] = [
  { id: "vscode", label: "VS Code" },
  { id: "cursor", label: "Cursor" },
  { id: "windsurf", label: "Windsurf" },
  { id: "zed", label: "Zed" },
  { id: "phpstorm", label: "PhpStorm" },
  { id: "intellij", label: "IntelliJ IDEA" },
];

export const TERMINAL_OPTIONS: ToolOption[] = [
  { id: "iterm2", label: "iTerm2" },
  { id: "terminal", label: "Terminal.app" },
  { id: "warp", label: "Warp (launch-only)" },
];

export const AI_TOOL_OPTIONS: ToolOption[] = [
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "claude-code", label: "Claude Code" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini-cli", label: "Gemini CLI" },
  { id: "codex-cli", label: "Codex CLI" },
];

export const APP_OPTIONS: ToolOption[] = [
  { id: "docker-desktop", label: "Docker Desktop" },
  { id: "tableplus", label: "TablePlus" },
  { id: "dbeaver", label: "DBeaver" },
  { id: "postman", label: "Postman" },
  { id: "bruno", label: "Bruno" },
  { id: "redis-insight", label: "Redis Insight" },
  { id: "chrome", label: "Google Chrome" },
  { id: "arc", label: "Arc" },
  { id: "safari", label: "Safari" },
];

/** Every known tool id, for a one-shot detection sweep. */
export const ALL_TOOL_IDS: string[] = [
  ...IDE_OPTIONS,
  ...TERMINAL_OPTIONS,
  ...AI_TOOL_OPTIONS,
  ...APP_OPTIONS,
].map((t) => t.id);
