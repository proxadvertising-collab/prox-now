import { describe, expect, it } from "vitest";
import { dupePlan, photoHash } from "./dedupe";

describe("photo dedupe", () => {
  it("skips the same bytes and ignores a different photo", () => {
    const first = Buffer.from("cafe-menu-a");
    const second = Buffer.from("cafe-menu-b");
    const hash = photoHash(first);
    expect(photoHash(first)).toBe(hash);
    expect(photoHash(second)).not.toBe(hash);
    const live = [{ id: "page-1", hash }];
    expect(dupePlan(hash, live)).toEqual({ action: "skip", pageId: "page-1" });
    expect(dupePlan(photoHash(second), live)).toBeNull();
    expect(dupePlan(hash, [{ id: "page-2", hash: null }])).toBeNull();
  });
});
