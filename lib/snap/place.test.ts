import { describe, expect, it } from "vitest";
import {
  MATCH_RADIUS_M,
  PICKER_CAP,
  POST_RADIUS_M,
  classifyNoMatch,
  isUnreadablePhoto,
  nearbyCandidates,
  pickerCandidates,
} from "./place";

const blurry = { qualityScore: 1, qualityReason: "too blurry and dark to read" };
const food = { qualityScore: 1, qualityReason: "a plate of food, no shop name" };

describe("classifyNoMatch", () => {
  it("says nothing is near when GPS has no shop, even if the photo looks hard to read", () => {
    expect(
      classifyNoMatch({ nearbyCount: 0, confident: false, ...blurry }),
    ).toBe("none_near");
    expect(
      classifyNoMatch({ nearbyCount: 0, confident: false, ...food }),
    ).toBe("none_near");
  });

  it("asks which shop when shops are close and the photo is a menu or food shot", () => {
    expect(
      classifyNoMatch({ nearbyCount: 3, confident: false, ...food }),
    ).toBe("which_shop");
    expect(
      classifyNoMatch({
        nearbyCount: 2,
        confident: false,
        qualityScore: 0,
        qualityReason: "",
      }),
    ).toBe("which_shop");
  });

  it("asks for a retake only when a nearby photo is actually unreadable", () => {
    expect(
      classifyNoMatch({ nearbyCount: 2, confident: false, ...blurry }),
    ).toBe("retake");
    expect(isUnreadablePhoto(1, "out of focus, cannot see the sign")).toBe(true);
    expect(isUnreadablePhoto(1, "blueberry stall, no name")).toBe(false);
    expect(isUnreadablePhoto(8, "too blurry")).toBe(false);
    expect(isUnreadablePhoto(Number.NaN, "too blurry")).toBe(false);
  });

  it("leaves a confident match on the happy path", () => {
    expect(
      classifyNoMatch({ nearbyCount: 4, confident: true, ...blurry }),
    ).toBeNull();
    expect(
      classifyNoMatch({ nearbyCount: 0, confident: true, ...food }),
    ).toBeNull();
  });
});

describe("pickerCandidates", () => {
  const shops = [
    { id: "far", name: "Far", distanceM: POST_RADIUS_M + 1 },
    { id: "b", name: "B", distanceM: 40 },
    { id: "a", name: "A", distanceM: 40 },
    { id: "edge", name: "Edge", distanceM: POST_RADIUS_M },
    { id: "mid", name: "Mid", distanceM: 120 },
    { id: "near", name: "Near", distanceM: 12 },
    { id: "wide", name: "Wide", distanceM: MATCH_RADIUS_M },
    { id: "beyond", name: "Beyond", distanceM: MATCH_RADIUS_M + 50 },
    { id: "bad", name: "Bad", distanceM: Number.NaN },
    { id: "neg", name: "Neg", distanceM: -1 },
  ];

  it("orders the nearest shops inside the publish radius and caps the list", () => {
    const picked = pickerCandidates(shops);
    expect(picked.map((shop) => shop.id)).toEqual(["near", "a", "b", "mid", "edge"]);
    expect(picked).toHaveLength(PICKER_CAP);
    expect(picked.every((shop) => shop.distanceM <= POST_RADIUS_M)).toBe(true);
    expect(picked.some((shop) => shop.id === "far" || shop.id === "wide" || shop.id === "beyond")).toBe(false);
  });

  it("does not mutate the matcher list", () => {
    const input = [
      { id: "b", distanceM: 10 },
      { id: "a", distanceM: 10 },
    ];
    const before = input.map((shop) => ({ ...shop }));
    expect(pickerCandidates(input).map((shop) => shop.id)).toEqual(["a", "b"]);
    expect(input).toEqual(before);
  });

  it("can use the wider matcher radius without offering a shop past it", () => {
    const picked = pickerCandidates(shops, { radiusM: MATCH_RADIUS_M, cap: 10 });
    expect(picked.map((shop) => shop.id)).toEqual(["near", "a", "b", "mid", "edge", "far", "wide"]);
    expect(picked.some((shop) => shop.id === "beyond")).toBe(false);
  });
});

describe("nearbyCandidates", () => {
  const demoShops = [{ id: "hua-hin" }];

  it("drops demo-centre shops when the person has a real GPS fix", () => {
    expect(nearbyCandidates({ candidates: demoShops, demo: true, hasFix: true })).toEqual([]);
  });

  it("keeps demo shops when there is no fix, and keeps a real nearby list", () => {
    expect(nearbyCandidates({ candidates: demoShops, demo: true, hasFix: false })).toEqual(demoShops);
    expect(nearbyCandidates({ candidates: demoShops, demo: false, hasFix: true })).toEqual(demoShops);
  });
});
