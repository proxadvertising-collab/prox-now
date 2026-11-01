import { describe, expect, it } from "vitest";
import { cameraStart, shutterAction } from "./camera-gate";

describe("camera gate", () => {
  it("opens a granted camera, waits on a prompt, and stays closed when denied", () => {
    expect(cameraStart("granted")).toBe("auto");
    expect(cameraStart("prompt")).toBe("tap");
    expect(cameraStart("denied")).toBe("closed");
    expect(cameraStart(null)).toBe("tap");
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
