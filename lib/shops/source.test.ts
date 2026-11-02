import { describe, expect, it } from "vitest";
import { DEMO_CENTER, FIXTURE_SHOPS } from "../fixtures/shops";
import { MAP_CAP, getShopsNear, mapShopsFromRows } from "./source";

describe("getShopsNear", () => {
  it("uses fixtures when no database query is passed", async () => {
    const result = await getShopsNear({ lat: 12.5685, lng: 99.9575 });
    expect(result.demo).toBe(false);
    expect(result.candidates[0]?.id).toBe("mala-mafia");
    expect(result.candidates.every((shop) => shop.distanceM <= 600)).toBe(true);
  });

  it("uses database rows when the query returns shops", async () => {
    const result = await getShopsNear({ lat: 1, lng: 2 }, async () => [
      {
        id: "db-1",
        name: "DB Shop",
        name_local: "ร้าน",
        category: "other",
        lat: 1,
        lng: 2,
        distance_m: 12.4,
      },
    ]);
    expect(result.demo).toBe(false);
    expect(result.candidates).toEqual([
      {
        id: "db-1",
        name: "DB Shop",
        nameLocal: "ร้าน",
        category: "other",
        distanceM: 12,
        lat: 1,
        lng: 2,
      },
    ]);
  });

  it("falls back to fixtures when the query fails", async () => {
    const result = await getShopsNear({ lat: 12.5685, lng: 99.9575 }, async () => {
      throw new Error("db down");
    });
    expect(result.demo).toBe(false);
    expect(result.candidates[0]?.id).toBe("mala-mafia");
  });

  it("falls back to fixtures when demo mode returns nothing", async () => {
    const result = await getShopsNear(null, async () => []);
    expect(result.demo).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThanOrEqual(FIXTURE_SHOPS.length);
  });

  it("returns no candidates when a real fix has no shops", async () => {
    const result = await getShopsNear({ lat: 1, lng: 2 }, async () => []);
    expect(result).toEqual({ candidates: [], demo: false });
  });
});

describe("mapShopsFromRows", () => {
  it("keeps non-demo shops within 5 km and drops the rest", () => {
    const shops = mapShopsFromRows([
      {
        id: "near",
        slug: "near",
        name: "Near",
        name_local: null,
        category: "other",
        lat: DEMO_CENTER.lat,
        lng: DEMO_CENTER.lng,
        is_demo: false,
      },
      {
        id: "demo",
        slug: "demo",
        name: "Demo",
        name_local: null,
        category: "other",
        lat: DEMO_CENTER.lat,
        lng: DEMO_CENTER.lng,
        is_demo: true,
      },
      {
        id: "far",
        slug: "far",
        name: "Far",
        name_local: null,
        category: "other",
        lat: DEMO_CENTER.lat + 0.2,
        lng: DEMO_CENTER.lng,
        is_demo: false,
      },
    ]);
    expect(shops.map((shop) => shop.id)).toEqual(["near"]);
    expect(shops[0]?.isDemo).toBe(false);
  });

  it("keeps demo shops when the session asks for them", () => {
    const shops = mapShopsFromRows(
      [
        {
          id: "near",
          slug: "near",
          name: "Near",
          name_local: null,
          category: "other",
          lat: DEMO_CENTER.lat,
          lng: DEMO_CENTER.lng,
          is_demo: false,
        },
        {
          id: "demo",
          slug: "demo",
          name: "Demo",
          name_local: null,
          category: "other",
          lat: DEMO_CENTER.lat,
          lng: DEMO_CENTER.lng,
          is_demo: true,
        },
      ],
      DEMO_CENTER,
      { includeDemo: true },
    );
    expect(shops.map((shop) => shop.id).sort()).toEqual(["demo", "near"]);
    expect(shops.find((shop) => shop.id === "demo")?.isDemo).toBe(true);
    expect(shops.find((shop) => shop.id === "near")?.isDemo).toBe(false);
  });

  it("caps the list at 200", () => {
    const rows = Array.from({ length: MAP_CAP + 5 }, (_, index) => ({
      id: "s" + index,
      slug: "s" + index,
      name: "Shop " + index,
      name_local: null,
      category: "other",
      lat: DEMO_CENTER.lat,
      lng: DEMO_CENTER.lng + index * 0.00001,
      is_demo: false,
    }));
    expect(mapShopsFromRows(rows)).toHaveLength(MAP_CAP);
  });
});
