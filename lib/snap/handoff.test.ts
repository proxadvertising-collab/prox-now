import { describe, expect, it } from "vitest";
import { resetSnapHandoff, snapRoute, stageSnapFile, subscribeSnapFile, takeSnapFile } from "./handoff";

describe("snap handoff", () => {
  it("keeps one file until the snap page takes it, and stays on /snap", () => {
    resetSnapHandoff();
    const file = new File([new Uint8Array([1])], "shop.jpg", { type: "image/jpeg" });
    expect(snapRoute("/map")).toBe("/snap");
    expect(snapRoute("/snap")).toBeNull();
    stageSnapFile(file);
    expect(takeSnapFile()).toBe(file);
    expect(takeSnapFile()).toBeNull();
  });

  it("gives the file to an open snap page instead of storing a second copy", () => {
    resetSnapHandoff();
    const seen: File[] = [];
    const stop = subscribeSnapFile((file) => seen.push(file));
    const file = new File([new Uint8Array([2])], "shop.jpg", { type: "image/jpeg" });
    stageSnapFile(file);
    expect(seen).toEqual([file]);
    expect(takeSnapFile()).toBeNull();
    stop();
  });
});
