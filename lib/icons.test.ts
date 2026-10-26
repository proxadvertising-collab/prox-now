import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ICONS: Array<[string, number]> = [
  ["icon-180.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-maskable-512.png", 512],
];

describe("PWA icons", () => {
  for (const [name, size] of ICONS) {
    it(name + " is a " + size + " px PNG", () => {
      const buf = readFileSync(join(process.cwd(), "public", "icons", name));
      expect(Array.from(buf.subarray(0, 8))).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
      expect(buf.readUInt32BE(16)).toBe(size);
      expect(buf.readUInt32BE(20)).toBe(size);
    });
  }
});
