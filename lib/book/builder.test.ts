import { describe, expect, it } from "vitest";
import {
  BOOK_PICK_CAP,
  bookBuildHref,
  bookErrorKey,
  bookNeedsBuild,
  bookTileInput,
  bookUploadState,
  pickedBookFiles,
  prepareBookPick,
  summarizeBookUpload,
} from "./builder";
import { bookHref } from "../map/pin-sheet";
import { snapShopHref } from "../snap/target";

describe("book builder entry points", () => {
  const slug = "nashville-hot-chicken";

  it("points the success screen, the pin sheet, and the empty book at the builder", () => {
    const build = bookBuildHref(slug);
    expect(build).toBe("/book/nashville-hot-chicken/build");
    expect(bookHref(slug)).toBe("/book/nashville-hot-chicken");
    expect(snapShopHref("shop-1", "NASHVILLE Hot Chicken")).toContain("/snap?shop=");
    expect(build).not.toBe(bookHref(slug));
  });

  it("offers the builder when the book is missing or thin, and not when it is complete", () => {
    expect(bookNeedsBuild(null)).toBe(true);
    expect(bookNeedsBuild(["menu"])).toBe(true);
    expect(bookNeedsBuild(["storefront", "hours"])).toBe(true);
    expect(bookNeedsBuild([])).toBe(false);
  });
});

describe("book photo picker", () => {
  it("uses a multi-select input capped at 8", () => {
    const input = bookTileInput();
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe("image/*");
    expect(input.type).toBe("file");
    expect(input.cap).toBe(8);
    expect(BOOK_PICK_CAP).toBe(8);
    const many = Array.from({ length: 10 }, (_, index) => new File([String(index)], index + ".jpg", { type: "image/jpeg" }));
    expect(pickedBookFiles(many)).toHaveLength(8);
    expect(pickedBookFiles(null)).toEqual([]);
  });

  it("sends up to 8 menu photos and keeps one photo for storefront or hours", () => {
    expect(prepareBookPick("menu", 8)).toEqual({ send: 8, capped: false });
    expect(prepareBookPick("menu", 9)).toEqual({ send: 8, capped: true });
    expect(prepareBookPick("storefront", 2)).toEqual({ error: "one" });
    expect(prepareBookPick("hours", 1)).toEqual({ send: 1, capped: false });
    expect(prepareBookPick("menu", 0)).toEqual({ error: "empty" });
  });
});

describe("book upload states", () => {
  it("sends a signed-out person to sign in and keeps a plain reason for a bad photo", () => {
    expect(bookUploadState(401, "not_signed_in")).toBe("signin");
    expect(bookUploadState(409, "not_a_menu")).toBe("rejected");
    expect(bookErrorKey("not_a_menu")).toBe("book.notMenu");
    expect(bookErrorKey("blur_failed")).toBe("book.blur");
    expect(bookErrorKey("book_hidden")).toBe("book.hidden");
    expect(bookUploadState(200, undefined)).toBe("ok");
    expect(bookUploadState(503, "ai_resting")).toBe("resting");
  });

  it("reads items, prices, hours, and palette from the upload", () => {
    const summary = summarizeBookUpload({
      pages: [{ extracted: { items: [{ name: "Hot chicken", price: "180" }, { name: " ", price: "1" }] } }],
      hours: { raw: "11:00–21:00" },
      theme: { swatches: ["#FF8A3D", "nope"] },
    });
    expect(summary.items).toEqual([{ name: "Hot chicken", price: "180" }]);
    expect(summary.hours).toBe("11:00–21:00");
    expect(summary.swatches).toEqual(["#FF8A3D"]);
  });
});
