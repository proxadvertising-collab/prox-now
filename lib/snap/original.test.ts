import { describe, expect, it } from "vitest";
import { ORIGINAL_NAME, buildOriginalSave, dropOriginalMemory } from "./original";

function file(): File {
  return new File([Uint8Array.from([1, 2, 3]).buffer], "cam.jpg", { type: "image/jpeg" });
}

describe("original on the phone", () => {
  it("does nothing until the person taps, then shares or downloads", async () => {
    const calls: string[] = [];
    const shareRun = buildOriginalSave({
      canShareFiles: true,
      file: file(),
      share: (item) => {
        calls.push("share:" + item.name);
      },
      download: () => calls.push("download"),
    });
    expect(calls).toEqual([]);
    shareRun();
    expect(calls).toEqual(["share:" + ORIGINAL_NAME]);

    const downloadRun = buildOriginalSave({
      canShareFiles: false,
      file: new File([Uint8Array.from([4]).buffer], ORIGINAL_NAME, { type: "image/jpeg" }),
      share: () => calls.push("share"),
      download: (item) => calls.push("download:" + item.name),
    });
    downloadRun();
    expect(calls).toEqual(["share:" + ORIGINAL_NAME, "download:" + ORIGINAL_NAME]);
  });

  it("drops the original file and blob urls from memory", () => {
    const revoked: string[] = [];
    const next = dropOriginalMemory(["blob:one", "blob:two"], (url) => revoked.push(url));
    expect(revoked).toEqual(["blob:one", "blob:two"]);
    expect(next).toEqual({ file: null, urls: [] });
  });
});
