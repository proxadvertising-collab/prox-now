import { describe, expect, it } from "vitest";
import { hasDemoSessionCookie, nearestDemoShop, showExploreChip } from "./zone";

const viewer = { lat: 12.5684, lng: 99.9577 };

describe("demo session cookie", () => {
  it("reads only the map toggle cookie", () => {
    expect(hasDemoSessionCookie("")).toBe(false);
    expect(hasDemoSessionCookie("prox-demo=1")).toBe(true);
    expect(hasDemoSessionCookie("other=1; prox-demo=1")).toBe(true);
    expect(hasDemoSessionCookie("prox-demo=0")).toBe(false);
  });
});

describe("explore chip", () => {
  it("hides for a demo session and shows when nothing live is within 25 km", () => {
    const near = { lat: 12.57, lng: 99.96 };
    const far = { lat: 12.9, lng: 99.9577 };
    expect(showExploreChip({ demoSession: true, viewer, posts: [] })).toBe(false);
    expect(showExploreChip({ demoSession: false, viewer: null, posts: [] })).toBe(true);
    expect(showExploreChip({ demoSession: false, viewer: null, posts: [far] })).toBe(false);
    expect(showExploreChip({ demoSession: false, viewer, posts: [near] })).toBe(false);
    expect(showExploreChip({ demoSession: false, viewer, posts: [far] })).toBe(true);
  });
});

describe("nearest demo shop", () => {
  it("uses the nearest demo shop and skips a closer real shop", () => {
    const from = { lat: 0, lng: 0 };
    const picked = nearestDemoShop(
      [
        { id: "far", name: "Far", lat: 1, lng: 1, isDemo: true },
        { id: "near", name: "Near", lat: 0.1, lng: 0.1, isDemo: true },
        { id: "real", name: "Real", lat: 0, lng: 0, isDemo: false },
      ],
      from,
    );
    expect(picked?.id).toBe("near");
    expect(
      nearestDemoShop([{ id: "real", name: "Real", lat: 0, lng: 0, isDemo: false }], from),
    ).toBeNull();
  });
});
