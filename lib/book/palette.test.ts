import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  MIN_CONTRAST,
  PROX_ACCENT,
  SURFACE,
  contrastRatio,
  paletteFromImage,
  themeFromSwatches,
} from "./palette";

async function solid(hex: string): Promise<Buffer> {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

describe("palette", () => {
  it("keeps a saturated photo colour that clears 4.5:1", async () => {
    const theme = await paletteFromImage(await solid("#FF8A3D"));
    expect(theme.swatches).toHaveLength(5);
    expect(theme.accent).toBe("#FF8A3D");
    expect(contrastRatio(theme.accent, SURFACE)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(theme.ink, theme.accent)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(await paletteFromImage(await solid("#FF8A3D"))).toEqual(theme);
  });

  it("falls back to the Prox accent when every swatch is dull", () => {
    const theme = themeFromSwatches([
      { hex: "#C8C8C8", count: 10 },
      { hex: "#B0B0B0", count: 4 },
      { hex: "#D0D0D0", count: 3 },
      { hex: "#A8A8A8", count: 2 },
      { hex: "#E0E0E0", count: 1 },
    ]);
    expect(theme.accent).toBe(PROX_ACCENT);
    expect(contrastRatio(theme.accent, SURFACE)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(theme.ink, theme.accent)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("falls back when a saturated colour does not clear the dark surface", () => {
    const theme = themeFromSwatches([
      { hex: "#2A0000", count: 8 },
      { hex: "#1A0000", count: 2 },
      { hex: "#100000", count: 1 },
      { hex: "#220000", count: 1 },
      { hex: "#180000", count: 1 },
    ]);
    expect(theme.accent).toBe(PROX_ACCENT);
    expect(contrastRatio(theme.accent, SURFACE)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});
