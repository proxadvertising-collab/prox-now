import { afterEach, describe, expect, it, vi } from "vitest";
import { getLivePosts, mapLiveRows, timeLeft, walkingMinutes, type LivePostRow } from "./source";

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 60 * 1000).toISOString();

function row(overrides: Partial<LivePostRow> = {}): LivePostRow {
  return {
    id: "post-1",
    shop_id: "shop-1",
    photo_path: "user/post-1.jpg",
    text_original: "ร้าน",
    text_translated: { en: "Shop" },
    created_at: new Date().toISOString(),
    expires_at: future,
    shops: { name: "Shop", name_local: "ร้าน", lat: 12.5, lng: 99.9, category: "other" },
    ...overrides,
  };
}

describe("timeLeft", () => {
  it("formats a full two hours as the whole ring", () => {
    const expires = "2026-10-26T04:00:00.000Z";
    const now = Date.parse("2026-10-26T02:00:00.000Z");
    expect(timeLeft(expires, now)).toEqual({ ms: 7_200_000, label: "2h 0m", fraction: 1 });
  });

  it("formats 1h 42m", () => {
    const now = Date.parse("2026-10-26T02:00:00.000Z");
    const expires = new Date(now + 102 * 60 * 1000).toISOString();
    const left = timeLeft(expires, now);
    expect(left.label).toBe("1h 42m");
    expect(left.fraction).toBeCloseTo(102 / 120);
  });

  it("is empty after expiry", () => {
    expect(timeLeft("2026-10-26T01:00:00.000Z", Date.parse("2026-10-26T02:00:00.000Z"))).toEqual({
      ms: 0,
      label: "0m",
      fraction: 0,
    });
  });
});

describe("walkingMinutes", () => {
  it("uses 80 metres per minute, rounded up, at least 1", () => {
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(80)).toBe(1);
    expect(walkingMinutes(81)).toBe(2);
    expect(walkingMinutes(800)).toBe(10);
  });
});

describe("mapLiveRows", () => {
  it("maps a live row to a public photo url and drops expired rows", () => {
    const posts = mapLiveRows(
      [row(), row({ id: "old", expires_at: past })],
      "https://example.supabase.co/",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: "post-1",
      shopId: "shop-1",
      shopName: "Shop",
      shopNameLocal: "ร้าน",
      photoUrl: "https://example.supabase.co/storage/v1/object/public/post-photos/user/post-1.jpg",
      textTranslated: { en: "Shop" },
      seed: false,
    });
    const seeded = mapLiveRows([row({ is_seed: true })], "https://example.supabase.co/");
    expect(seeded[0]?.seed).toBe(true);
  });
});

describe("getLivePosts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns no fixture posts when the database env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(await getLivePosts()).toEqual([]);
  });

  it("uses the injected rows and returns nothing when the query fails", async () => {
    const posts = await getLivePosts(async () => [row()]);
    expect(posts).toHaveLength(1);
    expect(await getLivePosts(async () => {
      throw new Error("down");
    })).toEqual([]);
  });
});
