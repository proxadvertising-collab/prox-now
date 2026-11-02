import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { t } from "../copy";
import { photoHash } from "./dedupe";
import { resizeToJpeg } from "../image/resize";
import { sha256Hex } from "./sha256";
import { bookFailNote, duplicateBookHref, pagePhotoHash, photosAlreadyLive } from "./cameraSave";
import { prepareBookShots, uploadBookSession, type BookShot } from "./builder";

vi.mock("../image/resize", () => ({
  resizeToJpeg: vi.fn(async (file: Blob) => file),
}));

const HASH = "ab".repeat(32);
const OTHER = "cd".repeat(32);

function photo(name: string): File {
  return new File([name], name, { type: "image/jpeg" });
}

describe("camera book save", () => {
  it("shows the menu-full and already-there lines, and keeps the other refusals", () => {
    expect(bookFailNote(409, "page_limit")).toBe("book.pageLimit");
    expect(t("en", "book.pageLimit")).toBe("This menu is full.");
    expect(t("th", "book.pageLimit")).toBe("เมนูนี้เต็มแล้ว");
    expect(bookFailNote(409, "already_there")).toBe("book.already");
    expect(t("en", "book.already")).toBe("That page is already in the book.");
    expect(bookFailNote(403, "not_owner")).toBe("owner");
    expect(bookFailNote(409, "book_hidden")).toBe("generic");
    expect(bookFailNote(400, "bad_image")).toBe("generic");
    expect(bookFailNote(422, "blur_failed")).toBe("generic");
    const camera = readFileSync(resolve(process.cwd(), "components/camera/LiveCamera.tsx"), "utf8");
    const save = camera.slice(camera.indexOf("async function save"), camera.indexOf("async function flip"));
    expect(save.indexOf("duplicateBookHref")).toBeGreaterThan(-1);
    expect(save.indexOf("duplicateBookHref")).toBeLessThan(save.indexOf("uploadBookSession"));
    expect(save).toContain("if (!createdHere)");
    expect(save).toContain("bookFailNote(");
    expect(save).toContain('t(langRef.current, fail)');
    expect(save).toContain("The owner manages this shop's book.");
    expect(save).toContain("The book did not save.");
  });

  it("opens the book when every photo is already live, and sends the batch otherwise", () => {
    expect(pagePhotoHash({ photo_hash: HASH })).toBe(HASH);
    expect(pagePhotoHash({ photo_hash: HASH.toUpperCase() })).toBe(HASH);
    expect(pagePhotoHash({})).toBeNull();
    expect(pagePhotoHash(null)).toBeNull();
    expect(photosAlreadyLive([], [HASH])).toBe(false);
    expect(photosAlreadyLive([HASH], [])).toBe(false);
    expect(photosAlreadyLive([HASH], [HASH, OTHER])).toBe(true);
    expect(photosAlreadyLive([HASH, OTHER], [HASH])).toBe(false);
    const shop = { shopId: "11111111-1111-4111-8111-111111111111", slug: "hard-rock", shotHashes: [HASH], liveHashes: [HASH] };
    expect(duplicateBookHref(shop)).toBe("/book/hard-rock");
    expect(duplicateBookHref({ ...shop, shotHashes: [HASH, OTHER] })).toBeNull();
    expect(duplicateBookHref({ ...shop, slug: shop.shopId, shopId: shop.shopId })).toBeNull();
  });

  it("hashes the same bytes the server stores, and does not resize a repeated Done", async () => {
    const bytes = Buffer.from("cafe-menu-a");
    expect(await sha256Hex(bytes)).toBe(photoHash(bytes));
    vi.mocked(resizeToJpeg).mockClear();
    const shots: BookShot[] = [
      { id: "a", kind: "auto", file: photo("a.jpg") },
      { id: "b", kind: "auto", file: photo("b.jpg") },
    ];
    const first = await prepareBookShots(shots);
    const second = await prepareBookShots(shots);
    expect(resizeToJpeg).toHaveBeenCalledTimes(2);
    expect(second.hashes).toEqual(first.hashes);
    expect(second.shots.map((shot) => shot.file)).toEqual(first.shots.map((shot) => shot.file));
    expect(photosAlreadyLive(second.hashes, first.hashes)).toBe(true);
    const calls: FormData[] = [];
    await uploadBookSession("shop-9", second.shots, async (_url, init) => {
      calls.push(init.body);
      return new Response(JSON.stringify({ slug: "hard-rock" }), { status: 200 });
    }, "improve", false, { prepared: true });
    expect(resizeToJpeg).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.get("mode")).toBe("improve");
  });
});