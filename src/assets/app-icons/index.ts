// Real id -> imported (fingerprinted) SVG url. Imports guarantee Vite bundles
// the asset and fails the build if a file goes missing, instead of a runtime
// 404 from a public path. Ids without an entry fall back to `AppMonogram`.

import vscode from "./vscode.svg";
import zed from "./zed.svg";
import iterm2 from "./iterm2.svg";
import terminal from "./terminal.svg";
import dockerDesktop from "./docker-desktop.svg";
import postman from "./postman.svg";
import chrome from "./chrome.svg";
import safari from "./safari.svg";
import arc from "./arc.svg";
import tableplus from "./tableplus.svg";
import dbeaver from "./dbeaver.svg";
import redisInsight from "./redis-insight.svg";
import claudeDesktop from "./claude-desktop.svg";

export const APP_ICON_URLS: Record<string, string> = {
  vscode,
  zed,
  iterm2,
  terminal,
  "docker-desktop": dockerDesktop,
  postman,
  chrome,
  safari,
  arc,
  tableplus,
  dbeaver,
  "redis-insight": redisInsight,
  "claude-desktop": claudeDesktop,
};
