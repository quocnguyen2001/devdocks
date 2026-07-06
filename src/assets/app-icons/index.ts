// Real brand logos (downloaded from the dashboard-icons / svgl icon sets), keyed
// by catalog id -> imported (fingerprinted) SVG url. Imports guarantee Vite
// bundles each asset and fails the build if a file goes missing, instead of a
// runtime 404 from a public path. Ids without an entry (iterm2, tableplus,
// dbeaver — no real SVG available upstream) fall back to `AppMonogram`.

import arc from "./arc.svg";
import chatgpt from "./chatgpt.svg";
import chrome from "./chrome.svg";
import claudeCode from "./claude-code.svg";
import claudeDesktop from "./claude-desktop.svg";
import codexCli from "./codex-cli.svg";
import cursor from "./cursor.svg";
import dockerDesktop from "./docker-desktop.svg";
import geminiCli from "./gemini-cli.svg";
import intellij from "./intellij.svg";
import phpstorm from "./phpstorm.svg";
import postman from "./postman.svg";
import redisInsight from "./redis-insight.svg";
import safari from "./safari.svg";
import terminal from "./terminal.svg";
import vscode from "./vscode.svg";
import warp from "./warp.svg";
import windsurf from "./windsurf.svg";
import zed from "./zed.svg";

export const APP_ICON_URLS: Record<string, string> = {
  arc,
  chatgpt,
  chrome,
  "claude-code": claudeCode,
  "claude-desktop": claudeDesktop,
  "codex-cli": codexCli,
  cursor,
  "docker-desktop": dockerDesktop,
  "gemini-cli": geminiCli,
  intellij,
  phpstorm,
  postman,
  "redis-insight": redisInsight,
  safari,
  terminal,
  vscode,
  warp,
  windsurf,
  zed,
};
