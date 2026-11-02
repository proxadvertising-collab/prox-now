import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { t } from "../copy";
import { cameraAskFailed, cameraStart, shutterAction } from "./camera-gate";

describe("camera gate", () => {
  it("starts a granted camera, asks on prompt or an unsupported check, and stays closed when denied", () => {
    expect(cameraStart("granted")).toBe("auto");
    expect(cameraStart("prompt")).toBe("auto");
    expect(cameraStart(null)).toBe("auto");
    expect(cameraStart("denied")).toBe("closed");
  });

  it("shows a tap after a failed start and does not ask again on its own", () => {
    expect(cameraAskFailed(true)).toBe("gesture");
    expect(cameraAskFailed(false)).toBe("live");
    const camera = readFileSync(resolve(process.cwd(), "components/camera/LiveCamera.tsx"), "utf8");
    const boot = camera.slice(camera.indexOf("permissions?.query"), camera.indexOf("openCameraRef.current = null"));
    expect(boot.indexOf("cameraStart")).toBeLessThan(boot.indexOf("openCamera()"));
    expect(boot).toContain("setCameraClosed(true)");
    expect(camera).toContain("cameraAskFailed(true)");
    expect(camera).toContain("snap.blocked");
    expect(camera).toContain("snap.turnOn");
    expect(camera).toContain("snap.upload");
    expect(boot.match(/openCamera\(\)/g)?.length).toBe(1);
  });

  it("puts the blocked card and the turn-on control below the photo chips", () => {
    expect(t("en", "snap.blocked")).toBe(
      "Camera is blocked. Allow it in your browser settings, or use Upload photos instead.",
    );
    expect(t("en", "snap.blocked")).not.toContain("Upload image");
    expect(t("th", "snap.blocked").length).toBeGreaterThan(0);
    const camera = readFileSync(resolve(process.cwd(), "components/camera/LiveCamera.tsx"), "utf8");
    expect(camera).toContain('className="camera-gate"');
    expect(camera).toContain("camera-blocked");
    expect(camera).toContain("top-[7.5rem]");
    expect(camera).not.toContain("top-1/3");
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    const gate = css.slice(css.indexOf(".camera-gate {"), css.indexOf(".camera-blocked"));
    expect(gate).toContain("z-index: 30");
    expect(gate).toContain("top: 12rem");
    expect(gate).toContain("left: 1rem");
    expect(gate).toContain("right: 1rem");
    expect(css).toContain(".snap-tour .camera-gate");
    expect(css).toContain("top: calc(12rem + var(--tour-bar, 0px))");
    const chips = css.slice(css.indexOf(".seed-chips {"), css.indexOf(".seed-chip {"));
    expect(chips).toContain("top: 4.5rem");
    expect(chips).toContain("z-index: 20");
  });

  it("opens on a tap, uploads when the camera is closed, shoots while reviewing, and ignores pick and building", () => {
    expect(shutterAction({ streamOpen: false, cameraClosed: false, phase: "camera", reviewing: false })).toBe("open");
    expect(shutterAction({ streamOpen: false, cameraClosed: true, phase: "camera", reviewing: false })).toBe("upload");
    expect(shutterAction({ streamOpen: true, cameraClosed: false, phase: "camera", reviewing: false })).toBe("shoot");
    expect(shutterAction({ streamOpen: true, cameraClosed: false, phase: "seed", reviewing: true })).toBe("shoot");
    expect(shutterAction({ streamOpen: true, cameraClosed: false, phase: "camera", reviewing: true })).toBe("shoot");
    expect(shutterAction({ streamOpen: true, cameraClosed: false, phase: "pick", reviewing: false })).toBe("none");
    expect(shutterAction({ streamOpen: false, cameraClosed: false, phase: "building", reviewing: true })).toBe("none");
  });
});
