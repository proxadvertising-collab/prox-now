import { describe, expect, it } from "vitest";
import { DEMO_CENTER, FIXTURE_SHOPS } from "./fixtures/shops";
import { haversineMeters, walkingMinutes } from "./geo";

describe("geo", () => {
  it("measures a short north step and zero for the same point", () => {
    expect(haversineMeters(DEMO_CENTER, DEMO_CENTER)).toBe(0);
    const north = { lat: DEMO_CENTER.lat + 0.001, lng: DEMO_CENTER.lng };
    const distance = haversineMeters(DEMO_CENTER, north);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });

  it("keeps neighbouring demo shops within 200 m", () => {
    const mala = FIXTURE_SHOPS.find((shop) => shop.slug === "mala-mafia");
    const coconut = FIXTURE_SHOPS.find((shop) => shop.slug === "coconut-shake-stand");
    expect(mala).toBeTruthy();
    expect(coconut).toBeTruthy();
    expect(haversineMeters(mala!, coconut!)).toBeLessThan(200);
  });

  it("rounds walking minutes up and never below 1", () => {
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(1)).toBe(1);
    expect(walkingMinutes(80)).toBe(1);
    expect(walkingMinutes(80.1)).toBe(2);
    expect(walkingMinutes(160)).toBe(2);
  });
});
