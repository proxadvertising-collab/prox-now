import { describe, expect, it } from "vitest";
import { bookPhotoVisible, cutoutShopId, extractedMentions, postPhotoAudience, postPhotoVisible, type PostPhotoRow } from "./access";

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

function row(patch: Partial<PostPhotoRow> = {}): PostPhotoRow {
  return {
    author_id: "author-1",
    shop_id: "shop-1",
    status: "live",
    expires_at: future,
    ...patch,
  };
}

describe("media visibility", () => {
  it("shows a live post to anyone and hides it once it is over", () => {
    expect(postPhotoVisible([row()], null, new Set())).toBe(true);
    expect(postPhotoAudience([row({ status: "kept" })], null, new Set())).toBe("public");
    expect(postPhotoVisible([row({ status: "kept", expires_at: past })], null, new Set())).toBe(true);
    expect(postPhotoAudience([row({ expires_at: past })], "author-1", new Set())).toBe("private");
    expect(postPhotoVisible([row({ expires_at: past })], null, new Set())).toBe(false);
    expect(postPhotoVisible([], null, new Set())).toBe(false);
  });

  it("still shows an ended post to its author and the verified owner", () => {
    const ended = row({ status: "live", expires_at: past });
    expect(postPhotoVisible([ended], "author-1", new Set())).toBe(true);
    expect(postPhotoVisible([ended], "owner-1", new Set(["shop-1"]))).toBe(true);
    expect(postPhotoAudience([ended], "author-1", new Set())).toBe("private");
    expect(postPhotoAudience([ended], "owner-1", new Set(["shop-1"]))).toBe("private");
    expect(postPhotoVisible([ended], "stranger", new Set())).toBe(false);
    expect(postPhotoVisible([ended], "owner-1", new Set(["other-shop"]))).toBe(false);
  });

  it("treats a live book page as public and a cutout as part of that page", () => {
    expect(bookPhotoVisible("shop-1", "live")).toBe(true);
    expect(bookPhotoVisible("shop-1", "hidden")).toBe(false);
    expect(bookPhotoVisible(null, "live")).toBe(false);
    expect(cutoutShopId("book-cutouts/shop-1/logo.webp")).toBe("shop-1");
    expect(cutoutShopId("shop-1/menu.jpg")).toBeNull();
    expect(extractedMentions({ logo_url: "book-cutouts/shop-1/logo.webp" }, "book-cutouts/shop-1/logo.webp")).toBe(true);
    expect(extractedMentions({}, "book-cutouts/shop-1/logo.webp")).toBe(false);
  });
});
