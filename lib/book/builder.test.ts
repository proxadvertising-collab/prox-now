import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bookHref } from "../map/pin-sheet";
import { POST_RADIUS_M } from "../snap/place";
import { snapShopHref } from "../snap/target";
import {
  BOOK_CAPTURE_STEPS,
  BOOK_PICK_CAP,
  BOOK_UPLOAD_PATH,
  addBookShots,
  atThisShop,
  viewerUsesDemoLocation,
  bookBuildHref,
  bookErrorKey,
  bookNeedsBuild,
  bookSessionForm,
  bookTileInput,
  bookUploadState,
  museCallSizes,
  nextShopNearby,
  pickedBookFiles,
  prepareBookPick,
  removeBookShot,
  summarizeBookUpload,
  uploadBookSession,
} from "./builder";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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

function photo(name: string): File {
  return new File(["x"], name, { type: "image/jpeg" });
}

describe("book capture session", () => {
  it("opens on storefront, then menu, then hours, and the screen never calls the matcher", () => {
    expect(BOOK_CAPTURE_STEPS).toEqual(["storefront", "menu", "hours"]);
    const screen = readFileSync(resolve(root, "components/book/BookBuilder.tsx"), "utf8");
    expect(screen.includes("/api/analyze")).toBe(false);
    expect(screen.includes("/api/shops")).toBe(false);
    expect(screen.includes("uploadBookSession")).toBe(true);
    expect(screen.includes('capture="environment"')).toBe(true);
    expect(screen.includes("multiple")).toBe(true);
    expect(screen.includes('accept="image/*"')).toBe(true);
  });

  it("checks presence once with the same radius as a live post", () => {
    const shop = { lat: 12.57, lng: 99.96 };
    expect(atThisShop(shop, shop)).toBe("ok");
    expect(atThisShop(null, shop)).toBe("need_location");
    expect(atThisShop(shop, null)).toBe("unknown_shop");
    const far = { lat: shop.lat + (POST_RADIUS_M + 40) / 111_320, lng: shop.lng };
    expect(atThisShop(far, shop)).toBe("too_far");
    expect(atThisShop(null, shop, true)).toBe("ok");
    expect(atThisShop(far, shop, true)).toBe("ok");
    expect(atThisShop(far, shop, false)).toBe("too_far");
  });

  it("treats demo mode and a demo account as on site, and keeps a real user on GPS", async () => {
    expect(await viewerUsesDemoLocation({ hasEnv: false, lookup: async () => ({ error: null, count: 0 }) })).toBe(true);
    expect(await viewerUsesDemoLocation({ hasEnv: true, lookup: async () => ({ error: null, count: 1 }) })).toBe(true);
    expect(await viewerUsesDemoLocation({ hasEnv: true, lookup: async () => ({ error: null, count: 0 }) })).toBe(false);
    expect(await viewerUsesDemoLocation({ hasEnv: true, lookup: async () => ({ error: new Error("no"), count: 1 }) })).toBe(
      false,
    );
  });

  it("sends storefront, three menu photos, and hours as one upload for that shop id", () => {
    let shots = addBookShots([], "storefront", [photo("front.jpg")]).shots;
    shots = addBookShots(shots, "menu", [photo("m1.jpg"), photo("m2.jpg"), photo("m3.jpg")]).shots;
    shots = addBookShots(shots, "hours", [photo("hours.jpg")]).shots;
    const form = bookSessionForm("shop-9", shots);
    expect(form.get("shop")).toBe("shop-9");
    expect(form.get("session")).toBe("1");
    expect(form.getAll("storefront")).toHaveLength(1);
    expect(form.getAll("menu")).toHaveLength(3);
    expect(form.getAll("hours")).toHaveLength(1);
    expect(BOOK_UPLOAD_PATH).toBe("/api/book/pages");
  });

  it("skipping storefront and hours still saves menu only", () => {
    const shots = addBookShots([], "menu", [photo("m1.jpg"), photo("m2.jpg"), photo("m3.jpg")]).shots;
    const form = bookSessionForm("shop-9", shots);
    expect(form.getAll("menu")).toHaveLength(3);
    expect(form.get("storefront")).toBeNull();
    expect(form.get("hours")).toBeNull();
    const kept = removeBookShot(shots, shots[1]?.id ?? "");
    expect(kept).toHaveLength(2);
  });

  it("a book upload with a shop id never calls the matcher or the new-shop path", async () => {
    const shots = addBookShots([], "menu", [photo("menu.jpg")]).shots;
    const urls: string[] = [];
    const result = await uploadBookSession("11111111-1111-4111-8111-111111111111", shots, async (url, init) => {
      urls.push(url);
      expect(init.method).toBe("POST");
      expect(init.body.get("shop")).toBe("11111111-1111-4111-8111-111111111111");
      expect(String(url).includes("analyze")).toBe(false);
      expect(String(url).includes("/api/shops")).toBe(false);
      return new Response(JSON.stringify({ pages: [] }), { status: 200 });
    });
    expect(urls).toEqual(["/api/book/pages"]);
    expect(result.url).toBe("/api/book/pages");
    expect(result.status).toBe(200);
  });

  it("keeps one storefront, queues library extras as menu, and caps menu at 8", () => {
    const mixed = addBookShots([], "storefront", [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]).shots;
    expect(mixed.map((shot) => shot.kind)).toEqual(["storefront", "menu", "menu"]);
    const many = addBookShots([], "menu", Array.from({ length: 10 }, (_, index) => photo(index + ".jpg")));
    expect(many.shots).toHaveLength(8);
    expect(many.capped).toBe(true);
    expect(museCallSizes(9)).toEqual([8, 1]);
  });

  it("offers the next shop from a GPS list and skips the one just seeded", () => {
    const next = nextShopNearby(
      [
        { id: "shop-9", slug: "just-seeded" },
        { id: "shop-2", slug: "next-door" },
      ],
      { id: "shop-9", slug: "just-seeded" },
    );
    expect(next?.slug).toBe("next-door");
    expect(nextShopNearby([{ id: "shop-9", slug: "just-seeded" }], { id: "shop-9" })).toBeNull();
  });
});
