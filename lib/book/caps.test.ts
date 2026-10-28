import { describe, expect, it } from "vitest";
import { uploadBlock } from "./caps";
import { bookMissing } from "./missing";
import { outputTokenBudget } from "../ai/meta";
import { MAX_IMAGES_PER_CALL, MAX_MENU_PAGES, MAX_UPLOAD_IMAGES } from "./limits";

describe("upload caps", () => {
  it("blocks a second storefront, a 13th menu page, and too many files", () => {
    expect(uploadBlock({ kind: "qr", fileCount: 1, livePages: [] })).toBe("bad_kind");
    expect(uploadBlock({ kind: "menu", fileCount: 0, livePages: [] })).toBe("bad_image");
    expect(uploadBlock({ kind: "menu", fileCount: MAX_UPLOAD_IMAGES + 1, livePages: [] })).toBe("bad_image");
    expect(uploadBlock({ kind: "logo", fileCount: 2, livePages: [] })).toBe("bad_image");
    expect(
      uploadBlock({
        kind: "logo",
        fileCount: 1,
        livePages: [{ kind: "logo", status: "live" }],
      }),
    ).toBe("already_there");
    const menus = Array.from({ length: MAX_MENU_PAGES - 1 }, () => ({ kind: "menu", status: "live" }));
    expect(uploadBlock({ kind: "menu", fileCount: 2, livePages: menus })).toBe("page_limit");
    expect(uploadBlock({ kind: "menu", fileCount: 1, livePages: menus })).toBeNull();
  });
});

describe("bookMissing", () => {
  const none = { pages: [], hours: {} };

  it("asks food shops for a menu and skips it for other kinds", () => {
    for (const category of ["street_food", "drinks", "restaurant", "fruit"]) {
      expect(bookMissing({ ...none, category })).toEqual(["storefront", "logo", "hours", "menu", "qr"]);
    }
    expect(bookMissing({ ...none, category: "laundry" })).toEqual(["storefront", "logo", "hours", "qr"]);
    expect(bookMissing({ ...none, category: "barber" })).not.toContain("menu");
  });

  it("drops a slot once a live page or saved hours exist", () => {
    expect(
      bookMissing({
        category: "street_food",
        pages: [
          { kind: "storefront", status: "live" },
          { kind: "menu", status: "removed" },
        ],
        hours: { days: [{ d: 1, open: "08:00", close: "17:00" }], source: "photo" },
      }),
    ).toEqual(["logo", "menu", "qr"]);
  });
});

describe("output token budget", () => {
  it("scales with the page count and stops at 4000", () => {
    expect(MAX_IMAGES_PER_CALL).toBe(8);
    expect(outputTokenBudget(1)).toBe(500);
    expect(outputTokenBudget(5)).toBe(1300);
    expect(outputTokenBudget(8)).toBe(1900);
    expect(outputTokenBudget(20)).toBe(4000);
  });
});
