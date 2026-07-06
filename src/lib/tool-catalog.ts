// UI-facing tool lists (ids match the Rust detection catalog in detect.rs).

import { APP_ICON_URLS } from "@/assets/app-icons";

export interface ToolOption {
  id: string;
  label: string;
  /** Brand hex color, used for the `AppMonogram` fallback tile. */
  brandColor?: string;
  /** Imported (fingerprinted) SVG logo url; auto-attached from APP_ICON_URLS by
   *  id when a real logo is bundled, else undefined -> monogram fallback. */
  icon?: string;
}

/** Attach the bundled real logo (if any) to each option by id, so the id list
 *  stays the single source of truth and icons wire up automatically. */
function withIcons(options: Omit<ToolOption, "icon">[]): ToolOption[] {
  return options.map((o) => ({ ...o, icon: APP_ICON_URLS[o.id] }));
}

export const IDE_OPTIONS: ToolOption[] = withIcons([
  { id: "vscode", label: "VS Code", brandColor: "#007ACC" },
  { id: "cursor", label: "Cursor", brandColor: "#1A1A1A" },
  { id: "windsurf", label: "Windsurf", brandColor: "#58E6D9" },
  { id: "zed", label: "Zed", brandColor: "#084CCF" },
  { id: "phpstorm", label: "PhpStorm", brandColor: "#B345F1" },
  { id: "intellij", label: "IntelliJ IDEA", brandColor: "#FE315D" },
]);

export const TERMINAL_OPTIONS: ToolOption[] = withIcons([
  { id: "iterm2", label: "iTerm2", brandColor: "#2E2E2E" },
  { id: "terminal", label: "Terminal.app", brandColor: "#3A3A3A" },
  { id: "warp", label: "Warp (launch-only)", brandColor: "#01A4FF" },
]);

export const AI_TOOL_OPTIONS: ToolOption[] = withIcons([
  { id: "claude-desktop", label: "Claude Desktop", brandColor: "#D97757" },
  { id: "claude-code", label: "Claude Code", brandColor: "#D97757" },
  { id: "chatgpt", label: "ChatGPT", brandColor: "#10A37F" },
  { id: "gemini-cli", label: "Gemini CLI", brandColor: "#4285F4" },
  { id: "codex-cli", label: "Codex CLI", brandColor: "#412991" },
]);

export const APP_OPTIONS: ToolOption[] = withIcons([
  { id: "docker-desktop", label: "Docker Desktop", brandColor: "#2496ED" },
  { id: "tableplus", label: "TablePlus", brandColor: "#4A67E3" },
  { id: "dbeaver", label: "DBeaver", brandColor: "#372923" },
  { id: "postman", label: "Postman", brandColor: "#FF6C37" },
  { id: "bruno", label: "Bruno", brandColor: "#F9814A" },
  { id: "redis-insight", label: "Redis Insight", brandColor: "#DC382D" },
  { id: "chrome", label: "Google Chrome", brandColor: "#4285F4" },
  { id: "arc", label: "Arc", brandColor: "#FF5257" },
  { id: "safari", label: "Safari", brandColor: "#0FB4E7" },
]);

/** Every known tool id, for a one-shot detection sweep. */
export const ALL_TOOL_IDS: string[] = [
  ...IDE_OPTIONS,
  ...TERMINAL_OPTIONS,
  ...AI_TOOL_OPTIONS,
  ...APP_OPTIONS,
].map((t) => t.id);
