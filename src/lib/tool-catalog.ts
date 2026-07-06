// UI-facing tool lists (ids match the Rust detection catalog in detect.rs).

import { APP_ICON_URLS } from "@/assets/app-icons";

export interface ToolOption {
  id: string;
  label: string;
  /** Brand hex color, used for the `AppMonogram` fallback tile. */
  brandColor?: string;
  /** Imported (fingerprinted) SVG logo url, when a bundled asset exists. */
  icon?: string;
}

export const IDE_OPTIONS: ToolOption[] = [
  { id: "vscode", label: "VS Code", brandColor: "#007ACC", icon: APP_ICON_URLS.vscode },
  { id: "cursor", label: "Cursor", brandColor: "#1A1A1A" },
  { id: "windsurf", label: "Windsurf", brandColor: "#58E6D9" },
  { id: "zed", label: "Zed", brandColor: "#084CCF", icon: APP_ICON_URLS.zed },
  { id: "phpstorm", label: "PhpStorm", brandColor: "#B345F1" },
  { id: "intellij", label: "IntelliJ IDEA", brandColor: "#FE315D" },
];

export const TERMINAL_OPTIONS: ToolOption[] = [
  {
    id: "iterm2",
    label: "iTerm2",
    brandColor: "#2E2E2E",
    icon: APP_ICON_URLS.iterm2,
  },
  {
    id: "terminal",
    label: "Terminal.app",
    brandColor: "#3A3A3A",
    icon: APP_ICON_URLS.terminal,
  },
  { id: "warp", label: "Warp (launch-only)", brandColor: "#01A4FF" },
];

export const AI_TOOL_OPTIONS: ToolOption[] = [
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    brandColor: "#D97757",
    icon: APP_ICON_URLS["claude-desktop"],
  },
  { id: "claude-code", label: "Claude Code", brandColor: "#D97757" },
  { id: "chatgpt", label: "ChatGPT", brandColor: "#10A37F" },
  { id: "gemini-cli", label: "Gemini CLI", brandColor: "#4285F4" },
  { id: "codex-cli", label: "Codex CLI", brandColor: "#412991" },
];

export const APP_OPTIONS: ToolOption[] = [
  {
    id: "docker-desktop",
    label: "Docker Desktop",
    brandColor: "#2496ED",
    icon: APP_ICON_URLS["docker-desktop"],
  },
  {
    id: "tableplus",
    label: "TablePlus",
    brandColor: "#4A67E3",
    icon: APP_ICON_URLS.tableplus,
  },
  {
    id: "dbeaver",
    label: "DBeaver",
    brandColor: "#372923",
    icon: APP_ICON_URLS.dbeaver,
  },
  {
    id: "postman",
    label: "Postman",
    brandColor: "#FF6C37",
    icon: APP_ICON_URLS.postman,
  },
  { id: "bruno", label: "Bruno", brandColor: "#F9814A" },
  {
    id: "redis-insight",
    label: "Redis Insight",
    brandColor: "#DC382D",
    icon: APP_ICON_URLS["redis-insight"],
  },
  {
    id: "chrome",
    label: "Google Chrome",
    brandColor: "#4285F4",
    icon: APP_ICON_URLS.chrome,
  },
  { id: "arc", label: "Arc", brandColor: "#FF5257", icon: APP_ICON_URLS.arc },
  {
    id: "safari",
    label: "Safari",
    brandColor: "#0FB4E7",
    icon: APP_ICON_URLS.safari,
  },
];

/** Every known tool id, for a one-shot detection sweep. */
export const ALL_TOOL_IDS: string[] = [
  ...IDE_OPTIONS,
  ...TERMINAL_OPTIONS,
  ...AI_TOOL_OPTIONS,
  ...APP_OPTIONS,
].map((t) => t.id);
