import { describe, expect, it } from "vitest";
import { DEMO_CENTER, FIXTURE_SHOPS } from "./fixtures/shops";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { haversineMeters, walkingDirectionsUrl, walkingMinutes } from "./geo";

describe("geo", () => {
  it("measures a short north step and zero for the same point", () => {
    expect(haversineMeters(DEMO_CENTER, DEMO_CENTER)).toBe(0);
    const north = { lat: DEMO_CENTER.lat + 0.001, lng: DEMO_CENTER.lng };
    const distance = haversineMeters(DEMO_CENTER, north);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThan(120);
  });

  it("keeps neighbouring demo shops from sharing one pin", () => {
    const mala = FIXTURE_SHOPS.find((shop) => shop.slug === "mala-mafia");
    const coconut = FIXTURE_SHOPS.find((shop) => shop.slug === "coconut-shake-stand");
    expect(mala).toBeTruthy();
    expect(coconut).toBeTruthy();
    expect(haversineMeters(mala!, coconut!)).toBeGreaterThanOrEqual(100);
  });

  it("adds a demo origin to walking directions and leaves a real visit unchanged", () => {
    const point = { lat: 12.57, lng: 99.96 };
    const plain = walkingDirectionsUrl(point);
    expect(plain).toBe("https://www.google.com/maps/dir/?api=1&destination=12.57,99.96&travelmode=walking");
    expect(plain.includes("origin=")).toBe(false);
    const routed = walkingDirectionsUrl(point, DEMO_CENTER);
    expect(routed).toBe(plain + "&origin=" + DEMO_CENTER.lat + "," + DEMO_CENTER.lng);
    expect(walkingDirectionsUrl(point, null)).toBe(plain);
    const named = walkingDirectionsUrl({ ...point, name: "Dawn Cafe" }, DEMO_CENTER);
    expect(new URL(named).searchParams.get("destination")).toBe("12.57,99.96");
    expect(named).toContain("travelmode=walking");
    expect(named).toContain("&origin=" + DEMO_CENTER.lat + "," + DEMO_CENTER.lng);
    expect(named.includes("@")).toBe(false);
    expect(named.includes("Dawn")).toBe(false);
    const list = readFileSync(resolve(process.cwd(), "components/map/ShopList.tsx"), "utf8");
    expect(list).toContain("walkingDirectionsUrl(shop, fixtures || demoSession ? DEMO_CENTER : null)");
    const sheet = readFileSync(resolve(process.cwd(), "lib/map/pin-sheet.ts"), "utf8");
    expect(sheet).toContain("walkingDirectionsUrl(input.shop, input.routeOrigin)");
    const map = readFileSync(resolve(process.cwd(), "components/map/ProxMap.tsx"), "utf8");
    expect(map).toContain("routeOrigin: fixtures || demoSession ? DEMO_CENTER : null");
  });

  it("keeps a named shop on walking directions when there is no origin", () => {
    const url = walkingDirectionsUrl({ lat: 12.57, lng: 99.96, name: "Pak Kapi" });
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=12.57,99.96&travelmode=walking");
    expect(new URL(url).searchParams.get("destination")).toBe("12.57,99.96");
    expect(url.includes("@")).toBe(false);
    expect(url.includes("Pak")).toBe(false);
    expect(url.includes("origin=")).toBe(false);
  });

  it("rounds walking minutes up and never below 1", () => {
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(1)).toBe(1);
    expect(walkingMinutes(80)).toBe(1);
    expect(walkingMinutes(80.1)).toBe(2);
    expect(walkingMinutes(160)).toBe(2);
  });
});
