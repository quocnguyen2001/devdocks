// Appearance settings applied app-wide from the Settings screen.

/** Chosen UI font: `"system"` = the native system stack (SF Pro on macOS), or a
 *  specific installed family name enumerated from the OS (see `listSystemFonts`).
 *  No bundled webfonts — everything is a font already on the machine. */
export type FontFamily = string;

export type UiScale = "compact" | "default" | "comfortable";

/** Native system UI stack — the default, and the fallback appended after any
 *  chosen family so text stays legible if that family lacks a glyph. */
export const SYSTEM_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';

/** Resolve a `FontFamily` choice to a CSS `font-family` value. */
export function resolveFontStack(family: FontFamily): string {
  if (!family || family === "system") return SYSTEM_FONT_STACK;
  // Quote the family (names can contain spaces) and keep the system fallback.
  return `"${family}", ${SYSTEM_FONT_STACK}`;
}

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
