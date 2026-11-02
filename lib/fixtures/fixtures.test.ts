import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { phaseFor, remainingMs } from "../freshness";
import { haversineMeters, walkingMinutes } from "../geo";
import { pinSheetContent } from "../map/pin-sheet";
import { MAP_DEFAULTS } from "../map/style";
import { makeDemoPosts } from "./demo-posts";
import { DEMO_CENTER, FIXTURE_SHOPS } from "./shops";

describe("demo fixtures", () => {
  it("has 8 unique shops spread around the demo centre", () => {
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
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "shops.ts"), "utf8");
    expect(source).not.toContain("TODO_REAL_COORDS");
    expect(FIXTURE_SHOPS.find((shop) => shop.slug === "mala-mafia")?.name).toBe("Farm to Go (demo)");
    for (const shop of FIXTURE_SHOPS) {
      const meters = haversineMeters(shop, DEMO_CENTER);
      const minutes = walkingMinutes(meters);
      expect(meters).toBeGreaterThanOrEqual(150);
      expect(meters).toBeLessThanOrEqual(900);
      expect(minutes).toBeGreaterThanOrEqual(2);
      expect(minutes).toBeLessThanOrEqual(12);
    }
  });

  it("places the eight shops on street-side coordinates", () => {
    const bySlug = new Map(FIXTURE_SHOPS.map((shop) => [shop.slug, shop]));
    const expected: Record<string, [number, number]> = {
      "mala-mafia": [12.56898, 99.95895],
      "coconut-shake-stand": [12.56745, 99.96],
      "krua-mae-yen": [12.57063, 99.95438],
      "pak-kapi": [12.56641, 99.95715],
      "thuk-jai-chieo": [12.56366, 99.95917],
      "clean-together": [12.57455, 99.95861],
      "baan-air": [12.57042, 99.95092],
      "beegee-barber": [12.56079, 99.95491],
    };
    for (const [slug, [lat, lng]] of Object.entries(expected)) {
      expect(bySlug.get(slug)?.lat).toBe(lat);
      expect(bySlug.get(slug)?.lng).toBe(lng);
    }
  });

  it("keeps each pin on its own shop and names that shop in directions", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const css = readFileSync(resolve(root, "components/map/pins.css"), "utf8");
    const fresh = css.slice(css.indexOf('[data-phase="fresh"]'));
    const pinPx = Number(fresh.match(/width:\s*(\d+)px/)?.[1]);
    expect(pinPx).toBe(44);
    const metersPerPixel =
      (156543.03392 * Math.cos((DEMO_CENTER.lat * Math.PI) / 180)) / 2 ** MAP_DEFAULTS.zoom;
    for (let i = 0; i < FIXTURE_SHOPS.length; i += 1) {
      for (let j = i + 1; j < FIXTURE_SHOPS.length; j += 1) {
        const apart = haversineMeters(FIXTURE_SHOPS[i]!, FIXTURE_SHOPS[j]!);
        expect(apart).toBeGreaterThanOrEqual(100);
        expect(apart).toBeGreaterThan(pinPx * metersPerPixel);
      }
    }
    for (const shop of FIXTURE_SHOPS) {
      expect(shop.id).toBe(shop.slug);
      const at = FIXTURE_SHOPS.filter((other) => other.lat === shop.lat && other.lng === shop.lng);
      expect(at.map((other) => other.slug)).toEqual([shop.slug]);
      const sheet = pinSheetContent({
        shop,
        posts: [],
        now: 0,
        origin: DEMO_CENTER,
        routeOrigin: DEMO_CENTER,
      });
      expect(sheet.bookHref).toBe("/book/" + shop.slug);
      expect(sheet.walkMinutes).toBe(walkingMinutes(haversineMeters(DEMO_CENTER, shop)));
      expect(sheet.goNowHref).toContain(encodeURIComponent(shop.name) + "@" + shop.lat + "," + shop.lng);
    }
    const seed = readFileSync(resolve(root, "supabase/seeds/soi102_shops.sql"), "utf8");
    const move = readFileSync(resolve(root, "supabase/migrations/0024_demo_shop_coords.sql"), "utf8");
    expect(seed).not.toContain("TODO_REAL_COORDS");
    expect(move).not.toContain("TODO_REAL_COORDS");
    for (const shop of FIXTURE_SHOPS) {
      expect(seed).toContain(shop.lat.toFixed(5));
      expect(seed).toContain(shop.lng.toFixed(5));
      expect(move).toContain(shop.lat.toFixed(5));
      expect(move).toContain(shop.lng.toFixed(5));
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
