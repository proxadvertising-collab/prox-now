import { describe, expect, it } from "vitest";
import { buildContext, GO_NOW_CAP, type ContextShop } from "./context";

const NOW = new Date("2026-10-29T04:00:00.000Z");
const ORIGIN = { lat: 12.5, lng: 99.9 };

function shop(id: string, lat: number, extra?: Partial<ContextShop>): ContextShop {
  return {
    id,
    slug: id,
    name: id,
    category: "street_food",
    lat,
    lng: 99.9,
    timezone: "Asia/Bangkok",
    hours: null,
    items: [],
    book: true,
    ...extra,
  };
}

describe("go-now context", () => {
  it("keeps nearby live facts and drops far shops and expired posts", () => {
    const places = buildContext({
      origin: ORIGIN,
      now: NOW,
      shops: [shop("near", 12.501), shop("far", 12.53), shop("quiet", 12.502, { book: false })],
      posts: [
        {
          shopId: "near",
          caption: "Thai tea just poured",
          createdAt: "2026-10-29T03:48:00.000Z",
          expiresAt: "2026-10-29T05:48:00.000Z",
          lat: 12.501,
          lng: 99.9,
        },
        {
          shopId: "near",
          caption: "old snap",
          createdAt: "2026-10-29T01:00:00.000Z",
          expiresAt: "2026-10-29T03:00:00.000Z",
          lat: 12.501,
          lng: 99.9,
        },
        {
          shopId: "far",
          caption: "too far",
          createdAt: "2026-10-29T03:50:00.000Z",
          expiresAt: "2026-10-29T05:50:00.000Z",
          lat: 12.53,
          lng: 99.9,
        },
      ],
    });
    expect(places.map((place) => place.shopId)).toEqual(["near"]);
    expect(places[0]?.posts).toEqual([{ caption: "Thai tea just poured", ageMinutes: 12 }]);
    expect(places[0]?.distanceM).toBeLessThan(2_000);
  });

  it("keeps the 40 nearest places", () => {
    const shops = Array.from({ length: GO_NOW_CAP + 1 }, (_, index) => shop("s" + String(index).padStart(2, "0"), 12.5 + index * 0.0001));
    const places = buildContext({ origin: ORIGIN, now: NOW, shops, posts: [] });
    expect(places).toHaveLength(GO_NOW_CAP);
    expect(places[0]?.shopId).toBe("s00");
    expect(places[GO_NOW_CAP - 1]?.shopId).toBe("s39");
  });
});
