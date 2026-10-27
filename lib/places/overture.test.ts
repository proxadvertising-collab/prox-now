import { describe, expect, it } from "vitest";
import {
  EXPORT_COLUMNS,
  EXPORT_LIMIT,
  parseExportQuery,
  toFeatureCollection,
  toOverturePlace,
  type ShopPlaceRow,
} from "./overture";

const full: ShopPlaceRow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Mala House",
  name_local: "หม่าล่า",
  category: "street_food",
  lat: 12.5,
  lng: 99.9,
  country_code: "TH",
  address_hint: "Soi 4",
  phone_public: "+661234",
  created_at: "2026-10-27T00:00:00.000Z",
  timezone: "Asia/Bangkok",
  currency: "THB",
  claimed: false,
  created_by: "22222222-2222-4222-8222-222222222222",
  email: "person@example.com",
};

describe("overture place export", () => {
  it("maps a full row and leaves out the person who added it", () => {
    const feature = toOverturePlace(full);
    expect(feature.geometry.coordinates).toEqual([99.9, 12.5]);
    expect(feature.properties.id).toBe(full.id);
    expect(feature.properties.names).toEqual({ primary: "Mala House", common: { und: "หม่าล่า" } });
    expect(feature.properties.categories).toEqual({ primary: "street_food" });
    expect(feature.properties.addresses).toEqual([{ country: "TH", freeform: "Soi 4" }]);
    expect(feature.properties.phones).toEqual(["+661234"]);
    expect(feature.properties.confidence).toBe(0.6);
    expect(feature.properties.prox_now).toEqual({
      timezone: "Asia/Bangkok",
      currency: "THB",
      claimed: false,
    });
    const sources = feature.properties.sources as Array<{ dataset: string; record_id: string }>;
    expect(sources[0].dataset).toBe("prox-now");
    expect(sources[0].record_id).toBe(full.id);
    const dumped = JSON.stringify(feature);
    expect(dumped).not.toContain("created_by");
    expect(dumped).not.toContain(full.created_by as string);
    expect(dumped).not.toContain("person@example.com");
    expect(dumped).not.toContain("email");
  });

  it("maps a minimal row", () => {
    const feature = toOverturePlace({
      id: "shop-min",
      name: "Corner cart",
      lat: 1,
      lng: 2,
    });
    expect(feature.properties.names).toEqual({ primary: "Corner cart" });
    expect(feature.properties.addresses).toBeUndefined();
    expect(feature.properties.phones).toBeUndefined();
    expect(feature.geometry.coordinates).toEqual([2, 1]);
  });

  it("omits the local name and the phone when they are missing", () => {
    const feature = toOverturePlace({ ...full, name_local: null, phone_public: "  " });
    expect(feature.properties.names).toEqual({ primary: "Mala House" });
    expect(feature.properties.phones).toBeUndefined();
  });

  it("caps the collection and parses country and since", () => {
    const rows = Array.from({ length: EXPORT_LIMIT + 1 }, (_item, index) => ({
      id: "shop-" + index,
      name: "Shop",
      lat: 1,
      lng: 2,
    }));
    expect(toFeatureCollection(rows).features).toHaveLength(EXPORT_LIMIT);
    expect(parseExportQuery(new URLSearchParams("country=us&since=2026-10-01T00:00:00.000Z"))).toEqual({
      country: "US",
      since: "2026-10-01T00:00:00.000Z",
    });
    expect(parseExportQuery(new URLSearchParams("country=USA"))).toEqual({ error: "bad_country" });
    expect(parseExportQuery(new URLSearchParams("since=yesterday"))).toEqual({ error: "bad_since" });
    expect(EXPORT_COLUMNS).not.toContain("created_by");
    expect(EXPORT_COLUMNS).not.toContain("email");
  });
});
