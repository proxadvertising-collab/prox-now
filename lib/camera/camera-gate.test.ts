import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
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
