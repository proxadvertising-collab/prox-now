import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseLogoFix, straightenLogo, themeFromBrand } from "./brand";
import { fallbackTheme, PROX_ACCENT } from "./palette";

const fix = {
  box: [0.25, 0.25, 0.75, 0.75],
  rotation: 0,
  colors: ["#FF8A3D", "#112233"],
  mood: "elegant",
};

describe("book brand", () => {
  it("reads a logo box, rotation, colors, and mood", () => {
    expect(parseLogoFix(fix)?.mood).toBe("elegant");
    expect(parseLogoFix(fix)?.colors).toEqual(["#FF8A3D", "#112233"]);
    expect(parseLogoFix({ ...fix, mood: "fancy" })).toBeNull();
    expect(parseLogoFix({ ...fix, colors: ["#FF8A3D"] })).toBeNull();
    expect(parseLogoFix(null)).toBeNull();
  });

  it("keeps the brand colors and falls back when the read fails", () => {
    const themed = themeFromBrand(parseLogoFix(fix));
    expect(themed.mood).toBe("elegant");
    expect(themed.colors).toEqual(["#FF8A3D", "#112233"]);
    expect(themed.swatches[0]).toBe("#FF8A3D");
    const fallback = themeFromBrand(null);
    expect(fallback.mood).toBe("bold");
    expect(fallback.accent).toBe(fallbackTheme().accent);
    expect(fallback.accent).toBe(PROX_ACCENT);
  });

  it("crops the straightened logo out of the shot", async () => {
    const source = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "#112233" },
    })
      .composite([{ input: await sharp({ create: { width: 10, height: 10, channels: 3, background: "#FF8A3D" } }).png().toBuffer(), left: 15, top: 15 }])
      .jpeg()
      .toBuffer();
    const cropped = await straightenLogo(source, parseLogoFix(fix)!);
    const meta = await sharp(cropped).metadata();
    expect(meta.width).toBeGreaterThan(0);
    expect(meta.width).toBeLessThan(40);
    expect(meta.height).toBeLessThan(40);
  });
});