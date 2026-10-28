import { describe, expect, it } from "vitest";
import { bookHref, pinSheetContent, type PinSheetPost, type PinSheetShop } from "./pin-sheet";

const shop: PinSheetShop = {
  id: "shop-1",
  slug: "dawn-cafe",
  name: "Dawn Cafe",
  nameLocal: "ดอน",
  lat: 12.57,
  lng: 99.96,
};

const origin = { lat: 12.57, lng: 99.96 };
const now = Date.parse("2026-10-28T08:00:00.000Z");

function post(overrides: Partial<PinSheetPost> = {}): PinSheetPost {
  return {
    id: "post-1",
    photoUrl: "https://example.test/new.jpg",
    createdAt: "2026-10-28T07:00:00.000Z",
    expiresAt: "2026-10-28T09:00:00.000Z",
    seed: false,
    ...overrides,
  };
}

describe("pin sheet", () => {
  it("asks to be first when the shop has no live post", () => {
    const sheet = pinSheetContent({ shop, posts: [], now, origin });
    expect(sheet.photoUrl).toBeNull();
    expect(sheet.freshness).toEqual({ kind: "none" });
    expect(sheet.prompt).toBe("first");
    expect(sheet.name).toBe("Dawn Cafe");
    expect(sheet.walkMinutes).toBeGreaterThan(0);
    expect(sheet.goNowHref).toContain("12.57,99.96");
    expect(sheet.bookHref).toBe("/book/dawn-cafe");
    expect(sheet.buildHref).toBe("/book/dawn-cafe/build");
    expect(sheet.showBuild).toBe(true);
    expect(sheet.cameraHref).toBe("/snap?shop=shop-1&name=Dawn%20Cafe");
  });

  it("shows the newest live photo and an add-yours prompt", () => {
    const sheet = pinSheetContent({
      shop,
      posts: [
        post({ id: "old", photoUrl: "https://example.test/old.jpg", createdAt: "2026-10-28T06:00:00.000Z" }),
        post({ id: "new", photoUrl: "https://example.test/new.jpg", createdAt: "2026-10-28T07:30:00.000Z" }),
        post({ id: "gone", photoUrl: "https://example.test/gone.jpg", expiresAt: "2026-10-28T07:00:00.000Z" }),
      ],
      now,
      origin,
    });
    expect(sheet.photoUrl).toBe("https://example.test/new.jpg");
    expect(sheet.freshness.kind).toBe("live");
    if (sheet.freshness.kind === "live") expect(sheet.freshness.label).toContain("h");
    expect(sheet.prompt).toBe("add");
    expect(sheet.bookHref).toBe(bookHref("dawn-cafe"));
  });

  it("marks a seed post as a live demo instead of a countdown", () => {
    const sheet = pinSheetContent({
      shop,
      posts: [post({ seed: true, photoUrl: "https://example.test/seed.jpg" })],
      now,
      origin,
    });
    expect(sheet.photoUrl).toBe("https://example.test/seed.jpg");
    expect(sheet.freshness).toEqual({ kind: "seed" });
    expect(sheet.prompt).toBe("add");
    expect(sheet.bookHref).toBe("/book/dawn-cafe");
    expect(sheet.cameraHref).toContain("shop=shop-1");
  });

  it("hides the build prompt when the book is already complete", () => {
    const sheet = pinSheetContent({ shop, posts: [], now, origin, missing: [] });
    expect(sheet.showBuild).toBe(false);
    expect(sheet.buildHref).toBe("/book/dawn-cafe/build");
    expect(sheet.bookHref).toBe("/book/dawn-cafe");
  });
});
