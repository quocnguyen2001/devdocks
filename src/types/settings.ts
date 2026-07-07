// Appearance settings applied app-wide from the Settings screen. All font choices
// use native system font stacks — no bundled webfonts (keeps the app lean and
// first-class-native on macOS).

export type FontFamily = "system" | "rounded" | "mono" | "serif";
export type UiScale = "compact" | "default" | "comfortable";

/** CSS font stacks per choice. `ui-rounded`/`ui-serif`/`ui-monospace` resolve to
 *  SF Pro Rounded / New York / SF Mono on macOS. */
export const FONT_STACKS: Record<FontFamily, string> = {
  system:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
  serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
};

export const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  system: "System",
  rounded: "Rounded",
  mono: "Mono",
  serif: "Serif",
};

/** Interface zoom factor per choice — scales the whole UI (text + spacing), the
 *  reliable way to size a px-based design like VS Code's zoom. */
export const UI_SCALE_VALUES: Record<UiScale, number> = {
  compact: 0.9,
  default: 1,
  comfortable: 1.1,
};

export const UI_SCALE_LABELS: Record<UiScale, string> = {
  compact: "Compact",
  default: "Default",
  comfortable: "Comfortable",
};
