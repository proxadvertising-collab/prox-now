import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { navRadar } from "./navShutter";

describe("nav radar", () => {
  it("hides on the camera, the book, and while an order is open", () => {
    expect(navRadar("/map", false, 0)).toBe(true);
    expect(navRadar("/wallet", false, 0)).toBe(true);
    expect(navRadar("/snap", false, 0)).toBe(false);
    expect(navRadar("/snap/extra", false, 0)).toBe(false);
    expect(navRadar("/snap?x", false, 0)).toBe(false);
    expect(navRadar("/snap?seed=1", false, 0)).toBe(false);
    expect(navRadar("/book/a", false, 0)).toBe(false);
    expect(navRadar("/book/cafe", false, 0)).toBe(false);
    expect(navRadar("/map", true, 0)).toBe(false);
    expect(navRadar("/wallet", false, 1)).toBe(false);
    expect(navRadar("/me", false, 2)).toBe(false);
  });

  it("links the nav radar and leaves the camera shutter on the camera screen", () => {
    const nav = readFileSync(resolve(process.cwd(), "components/shell/BottomNav.tsx"), "utf8");
    const camera = readFileSync(resolve(process.cwd(), "components/camera/LiveCamera.tsx"), "utf8");
    expect(nav).toContain("navRadar");
    expect(nav).toContain('href="/snap"');
    expect(nav).toContain("size={64}");
    expect(nav).toContain("size={40}");
    expect(nav).toContain('className="nav-radar"');
    expect(camera).not.toContain("listenNavShutter");
    expect(camera).not.toContain("navShutterAction");
    expect(camera).toContain("RadarButton");
    expect(camera).toContain("void shoot()");
  });
});
