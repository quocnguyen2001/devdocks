import { describe, expect, it } from "vitest";
import { isHexColor } from "@/lib/color";

describe("isHexColor", () => {
  it("accepts 6-digit hex", () => {
    expect(isHexColor("#b8232c")).toBe(true);
    expect(isHexColor("#FFFFFF")).toBe(true);
  });

  it("accepts 3-digit hex", () => {
    expect(isHexColor("#abc")).toBe(true);
  });

  it("rejects missing hash, wrong length, and non-hex", () => {
    expect(isHexColor("b8232c")).toBe(false);
    expect(isHexColor("#12")).toBe(false);
    expect(isHexColor("#1234")).toBe(false);
    expect(isHexColor("#gggggg")).toBe(false);
    expect(isHexColor("")).toBe(false);
  });
});
