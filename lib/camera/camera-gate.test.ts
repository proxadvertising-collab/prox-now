import { describe, expect, it } from "vitest";
import { cameraStart } from "./camera-gate";

describe("camera gate", () => {
  it("opens a granted camera, waits on a prompt, and stays closed when denied", () => {
    expect(cameraStart("granted")).toBe("auto");
    expect(cameraStart("prompt")).toBe("tap");
    expect(cameraStart("denied")).toBe("closed");
    expect(cameraStart(null)).toBe("tap");
  });
});
