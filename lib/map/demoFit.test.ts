import { describe, expect, it } from "vitest";
import { FIXTURE_SHOPS } from "../fixtures/shops";
import { ASK_CHIP_ROW_PX, DEMO_FIT_MAX_ZOOM, demoFitPadding, fittedZoom, screenGapPx, shopBounds, shopsForDemoFit } from "./demoFit";

describe("demo map fit", () => {
  it("clears the Ask and coupon chip row at 390 and 1280", () => {
    const phone = demoFitPadding(390);
    const wide = demoFitPadding(1280);
    expect(DEMO_FIT_MAX_ZOOM).toBe(15);
    expect(ASK_CHIP_ROW_PX).toBe(64);
    expect(phone.top).toBe(ASK_CHIP_ROW_PX + 16);
    expect(phone.top).toBeGreaterThan(72);
    expect(wide.top).toBe(phone.top);
    expect(phone.bottom).toBeGreaterThanOrEqual(180);
    expect(wide.bottom).toBeGreaterThanOrEqual(140);
  });

  it("fits only is_demo shops during a demo session", () => {
    const shops = [
      { id: "real", lat: 1, lng: 1, isDemo: false },
      { id: "farm", lat: 12.57, lng: 99.96, isDemo: true },
      { id: "plain", lat: 3, lng: 3 },
    ];
    expect(shopsForDemoFit(shops, true).map((shop) => shop.id)).toEqual(["farm"]);
    expect(shopsForDemoFit(shops, false)).toHaveLength(3);
    const bounds = shopBounds(shopsForDemoFit(shops, true));
    expect(bounds).toEqual([
      [99.96, 12.57],
      [99.96, 12.57],
    ]);
  });

  it("keeps Farm to Go and the coconut stand at least 40px apart at 390 and 1280", () => {
    const farm = FIXTURE_SHOPS.find((shop) => shop.slug === "mala-mafia");
    const coconut = FIXTURE_SHOPS.find((shop) => shop.slug === "coconut-shake-stand");
    expect(farm).toBeTruthy();
    expect(coconut).toBeTruthy();
    const phoneHeight = 844 - 84 - 196;
    const wideHeight = 800;
    for (const box of [
      { width: 390, height: phoneHeight },
      { width: 1280, height: wideHeight },
    ]) {
      const zoom = fittedZoom({ shops: FIXTURE_SHOPS, width: box.width, height: box.height });
      expect(zoom).toBeLessThanOrEqual(DEMO_FIT_MAX_ZOOM);
      expect(screenGapPx(farm!, coconut!, zoom)).toBeGreaterThanOrEqual(40);
    }
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
