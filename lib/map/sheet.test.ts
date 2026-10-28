import { describe, expect, it } from "vitest";
import type { LivePost } from "../posts/source";
import {
  clampPhotoIndex,
  photoCounter,
  photoTimeLabel,
  pinBadgeText,
  sheetCloseUsesHistory,
  sheetPhotos,
  sheetSwipeCloses,
  stackScrollBehavior,
  stackStep,
  SHEET_PHOTO_CAP,
} from "./sheet";

function post(id: string, shopId: string, createdAt: string): LivePost {
  return {
    id,
    shopId,
    photoUrl: id + ".jpg",
    textOriginal: null,
    textTranslated: {},
    createdAt,
    expiresAt: "2026-10-27T12:00:00.000Z",
    shopName: "Shop",
    shopNameLocal: null,
    lat: 1,
    lng: 2,
    category: "other",
    facts: null,
    mine: false,
    seed: false,
  };
}

describe("place sheet", () => {
  it("closes on a long drag or a flick, and ignores body scrolling", () => {
    expect(sheetSwipeCloses({ deltaY: 80, elapsedMs: 400, scrolling: false })).toBe(true);
    expect(sheetSwipeCloses({ deltaY: 79, elapsedMs: 400, scrolling: false })).toBe(false);
    expect(sheetSwipeCloses({ deltaY: 36, elapsedMs: 40, scrolling: false })).toBe(true);
    expect(sheetSwipeCloses({ deltaY: 200, elapsedMs: 40, scrolling: true })).toBe(false);
    expect(sheetSwipeCloses({ deltaY: -90, elapsedMs: 40, scrolling: false })).toBe(false);
  });

  it("pops history once, and not when the browser already popped", () => {
    expect(sheetCloseUsesHistory(false, true)).toBe(true);
    expect(sheetCloseUsesHistory(true, true)).toBe(false);
    expect(sheetCloseUsesHistory(false, false)).toBe(false);
  });

  it("orders a shop's live photos newest first and caps at 10", () => {
    const now = Date.parse("2026-10-27T10:00:00.000Z");
    const rows = [
      post("old", "shop", "2026-10-27T08:00:00.000Z"),
      post("new", "shop", "2026-10-27T09:00:00.000Z"),
      post("other", "else", "2026-10-27T09:30:00.000Z"),
      post("dead", "shop", "2026-10-27T09:30:00.000Z"),
    ];
    rows[3] = { ...rows[3], expiresAt: "2026-10-27T09:00:00.000Z" };
    const extra = Array.from({ length: 12 }, (_, index) =>
      post("p" + String(index), "shop", "2026-10-27T07:" + String(index).padStart(2, "0") + ":00.000Z"),
    );
    expect(sheetPhotos(rows, "shop", now).map((item) => item.id)).toEqual(["new", "old"]);
    expect(sheetPhotos([...rows, ...extra], "shop", now)).toHaveLength(SHEET_PHOTO_CAP);
    expect(clampPhotoIndex(-2, 3)).toBe(0);
    expect(clampPhotoIndex(9, 3)).toBe(2);
    expect(photoCounter(1, 5)).toBe("2 / 5");
  });

  it("steps a swipe, keeps a still scroll when motion is reduced, and badges a stack", () => {
    expect(stackStep(1, 5, -40)).toBe(2);
    expect(stackStep(1, 5, 40)).toBe(0);
    expect(stackStep(0, 5, 80)).toBe(0);
    expect(stackStep(1, 5, 10)).toBe(1);
    expect(stackScrollBehavior(true)).toBe("auto");
    expect(stackScrollBehavior(false)).toBe("smooth");
    expect(pinBadgeText(1)).toBeNull();
    expect(pinBadgeText(2)).toBe("2");
    expect(pinBadgeText(12)).toBe(String(SHEET_PHOTO_CAP));
    const now = Date.parse("2026-10-27T10:00:00.000Z");
    expect(photoTimeLabel({ expiresAt: "2026-10-27T12:00:00.000Z", seed: false }, now)).toBe("2h 0m left");
    expect(photoTimeLabel({ expiresAt: "2026-10-27T12:00:00.000Z", seed: true }, now)).toBe("Live demo");
  });
});
