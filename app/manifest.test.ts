import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("ships png icons, the dark theme colour, and a maskable icon", () => {
    const data = manifest();
    expect(data.theme_color).toBe("#0F0D0C");
    expect(data.background_color).toBe("#0F0D0C");
    expect(data.name).toBe("Prox Now");
    expect(data.short_name).toBe("Prox Now");
    expect(data.display).toBe("standalone");
    expect(data.start_url).toBe("/map");
    expect(data.scope).toBe("/");
    const icons = data.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      const buf = readFileSync(join(process.cwd(), "public", icon.src.replace(/^\//, "")));
      expect(Array.from(buf.subarray(0, 8))).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
    }
  });
});
