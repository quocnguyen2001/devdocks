/** True when `value` is a valid 3- or 6-digit hex color (with leading `#`). */
export function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}
