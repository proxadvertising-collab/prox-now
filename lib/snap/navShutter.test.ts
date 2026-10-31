import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listenNavShutter, navShutterAction, pressNavShutter } from "./navShutter";

describe("nav shutter", () => {
  it("links away from /snap, shoots when the camera is open, and picks when it is closed", () => {
    expect(navShutterAction("/map", true)).toBe("link");
    expect(navShutterAction("/book/cafe", false)).toBe("link");
    expect(navShutterAction("/snap", true)).toBe("shoot");
    expect(navShutterAction("/snap", false)).toBe("pick");
    expect(navShutterAction("/snap?seed=1", false)).toBe("pick");
  });

  it("fires the live camera listener and ignores a press when none is open", () => {
    const seen: string[] = [];
    expect(pressNavShutter()).toBe(false);
    const stop = listenNavShutter(() => {
      seen.push(navShutterAction("/snap", seen.length === 0));
    });
    expect(pressNavShutter()).toBe(true);
    expect(pressNavShutter()).toBe(true);
    expect(seen).toEqual(["shoot", "pick"]);
    stop();
    expect(pressNavShutter()).toBe(false);
  });

  it("wires the nav button to the camera listener", () => {
    const nav = readFileSync(resolve(process.cwd(), "components/shell/BottomNav.tsx"), "utf8");
    const camera = readFileSync(resolve(process.cwd(), "components/camera/LiveCamera.tsx"), "utf8");
    expect(nav).toContain("navSnapMode");
    expect(nav).toContain("pressNavShutter()");
    expect(camera).toContain("listenNavShutter");
    expect(camera).toContain("navShutterAction");
    expect(camera).toContain("void shoot()");
    expect(camera).toContain("void openPicker()");
  });
});
