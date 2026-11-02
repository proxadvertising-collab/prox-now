import { describe, expect, it } from "vitest";
import { FIXTURE_SHOPS } from "../fixtures/shops";
import { DEMO_FIT_MAX_ZOOM, demoFitPadding, shopBounds } from "./demoFit";

describe("demo map fit", () => {
  it("pads for the tour card and the bottom bar at 390 and 1280", () => {
    const phone = demoFitPadding(390);
    const wide = demoFitPadding(1280);
    expect(DEMO_FIT_MAX_ZOOM).toBe(15);
    expect(phone.top).toBeGreaterThanOrEqual(48);
    expect(phone.bottom).toBeGreaterThanOrEqual(180);
    expect(wide.top).toBeGreaterThanOrEqual(48);
    expect(wide.bottom).toBeGreaterThanOrEqual(140);
    expect(phone.left).toBeGreaterThanOrEqual(22);
    expect(wide.right).toBeGreaterThanOrEqual(22);
  });

  it("bounds every demo shop, including the southern and western pins", () => {
    const bounds = shopBounds(FIXTURE_SHOPS);
    expect(bounds).not.toBeNull();
    const [[west, south], [east, north]] = bounds!;
    const lats = FIXTURE_SHOPS.map((shop) => shop.lat);
    const lngs = FIXTURE_SHOPS.map((shop) => shop.lng);
    expect(south).toBe(Math.min(...lats));
    expect(north).toBe(Math.max(...lats));
    expect(west).toBe(Math.min(...lngs));
    expect(east).toBe(Math.max(...lngs));
    expect(shopBounds([])).toBeNull();
  });
});
