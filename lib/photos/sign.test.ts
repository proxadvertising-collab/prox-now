import { describe, expect, it } from "vitest";
import { cachedSignedUrl, clearSignedUrlCache, SIGNED_URL_REUSE_MS, SIGNED_URL_TTL_SECONDS, signedPhotoUrl } from "./sign";

describe("signed photo urls", () => {
  it("points storage paths at the signing route and never at a public object", () => {
    expect(signedPhotoUrl("user/post-1.jpg", "post-photos")).toBe("/api/media/post-photos/user/post-1.jpg");
    expect(signedPhotoUrl("/demo/mala-mafia-logo.svg", "shop-book")).toBe("/demo/mala-mafia-logo.svg");
    expect(
      signedPhotoUrl("https://example.supabase.co/storage/v1/object/public/shop-book/shop-1/menu.jpg", "shop-book"),
    ).toBe("/api/media/shop-book/shop-1/menu.jpg");
    expect(signedPhotoUrl("https://example.supabase.co/storage/v1/object/public/shop-book/shop-1/menu.jpg", "shop-book")).not.toContain(
      "/object/public/",
    );
  });

  it("reuses a signed url until it is stale", async () => {
    clearSignedUrlCache();
    let calls = 0;
    const sign = async () => {
      calls += 1;
      return "https://example.supabase.co/storage/v1/object/sign/post-photos/a.jpg?token=abc";
    };
    const first = await cachedSignedUrl("post-photos", "a.jpg", sign, 1_000);
    const second = await cachedSignedUrl("post-photos", "a.jpg", sign, 1_000 + 60_000);
    expect(first).toContain("token=abc");
    expect(second).toBe(first);
    expect(calls).toBe(1);
    clearSignedUrlCache();
  });

  it("keeps a signed url alive 10 minutes past the reuse window", () => {
    expect(SIGNED_URL_TTL_SECONDS * 1000).toBeGreaterThanOrEqual(SIGNED_URL_REUSE_MS + 10 * 60 * 1000);
  });
});
