import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { phaseFor, remainingMs } from "../freshness";
import { haversineMeters } from "../geo";
import { makeDemoPosts } from "./demo-posts";
import { DEMO_CENTER, FIXTURE_SHOPS } from "./shops";

describe("demo fixtures", () => {
  it("has 8 unique shops near the demo centre, with placeholder coordinates marked", () => {
    const slugs = FIXTURE_SHOPS.map((shop) => shop.slug);
    expect(new Set(slugs).size).toBe(8);
    expect(slugs.sort()).toEqual([
      "baan-air",
      "beegee-barber",
      "clean-together",
      "coconut-shake-stand",
      "krua-mae-yen",
      "mala-mafia",
      "pak-kapi",
      "thuk-jai-chieo",
    ]);
    for (const shop of FIXTURE_SHOPS) {
      expect(haversineMeters(shop, DEMO_CENTER)).toBeLessThan(600);
    }
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "shops.ts"), "utf8");
    expect((source.match(/TODO_REAL_COORDS/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(FIXTURE_SHOPS.find((shop) => shop.slug === "mala-mafia")?.name).toBe("Farm to Go (demo)");
  });

  it("places the eight shops on the given coordinates", () => {
    const bySlug = new Map(FIXTURE_SHOPS.map((shop) => [shop.slug, shop]));
    const expected: Record<string, [number, number]> = {
      "mala-mafia": [12.5685, 99.9575],
      "coconut-shake-stand": [12.56835, 99.9579],
      "krua-mae-yen": [12.5687, 99.9581],
      "pak-kapi": [12.5682, 99.9573],
      "thuk-jai-chieo": [12.5686, 99.9584],
      "clean-together": [12.56805, 99.9577],
      "baan-air": [12.56885, 99.9572],
      "beegee-barber": [12.56845, 99.957],
    };
    for (const [slug, [lat, lng]] of Object.entries(expected)) {
      expect(bySlug.get(slug)?.lat).toBe(lat);
      expect(bySlug.get(slug)?.lng).toBe(lng);
    }
  });

  it("yields fresh, aging, aging, last for 105, 55, 30, and 7 minutes", () => {
    const now = 1_800_000_000_000;
    const posts = makeDemoPosts(now);
    expect(posts).toHaveLength(4);
    expect(posts.every((post) => post.status === "live")).toBe(true);
    const minutes = posts.map((post) => remainingMs(post.expires_at, now) / 60_000);
    expect(minutes).toEqual([105, 55, 30, 7]);
    const phases = posts.map((post) => phaseFor(remainingMs(post.expires_at, now)));
    expect(phases).toEqual(["fresh", "aging", "aging", "last"]);
  });
});
