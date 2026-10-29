import { describe, expect, it } from "vitest";
import {
  MATCH_RADIUS_M,
  PICKER_CAP,
  POST_RADIUS_M,
  SAME_PLACE_M,
  blockingShops,
  classifySnap,
  editedNameAllowed,
  foldName,
  isUnreadablePhoto,
  namesCollide,
  nearbyCandidates,
  allowPostDistance,
  pickerCandidates,
  postStandIn,
  readBusiness,
  sanitizeShopName,
} from "./place";

const basePlace = {
  placeName: null,
  placeNameLocal: null,
  placeKind: null,
  placeConfidence: 0,
  qualityScore: 8,
  category: "food",
  signText: [] as { original: string; translated: string }[],
};

describe("classifySnap", () => {
  it("keeps a confident match on the happy path", () => {
    expect(
      classifySnap({
        confident: true,
        pickerCount: 2,
        unreadable: true,
        business: true,
        publicPlace: false,
        hasFix: true,
      }),
    ).toBeNull();
  });

  it("asks which shop when known shops are close but the match is not confident", () => {
    expect(
      classifySnap({
        confident: false,
        pickerCount: 3,
        unreadable: false,
        business: true,
        publicPlace: false,
        hasFix: true,
      }),
    ).toBe("which_shop");
  });

  it("adds a new shop when a sign is readable and nothing is close", () => {
    expect(
      classifySnap({
        confident: false,
        pickerCount: 0,
        unreadable: false,
        business: true,
        publicPlace: false,
        hasFix: true,
      }),
    ).toBe("add_shop");
    expect(
      classifySnap({
        confident: false,
        pickerCount: 0,
        unreadable: false,
        business: true,
        publicPlace: false,
        hasFix: false,
      }),
    ).toBe("not_a_place");
  });

  it("turns away a desk, a bird, or a sunset without blaming the photo", () => {
    expect(
      classifySnap({
        confident: false,
        pickerCount: 0,
        unreadable: false,
        business: false,
        publicPlace: false,
        hasFix: true,
      }),
    ).toBe("not_a_place");
  });

  it("says public places are not ready when the photo is a park or beach", () => {
    expect(
      classifySnap({
        confident: false,
        pickerCount: 1,
        unreadable: false,
        business: false,
        publicPlace: true,
        hasFix: true,
      }),
    ).toBe("public_place");
  });

  it("asks for a retake only when the photo itself is unreadable", () => {
    expect(
      classifySnap({
        confident: false,
        pickerCount: 0,
        unreadable: true,
        business: false,
        publicPlace: false,
        hasFix: true,
      }),
    ).toBe("retake");
    expect(isUnreadablePhoto(1, "out of focus, cannot see the sign")).toBe(true);
    expect(isUnreadablePhoto(1, "blueberry stall, no name")).toBe(false);
    expect(isUnreadablePhoto(8, "too blurry")).toBe(false);
  });
});

describe("business name", () => {
  it("reads a confident place name and falls back to sign text", () => {
    expect(
      readBusiness({
        ...basePlace,
        placeName: " Dawn Cafe ",
        placeKind: "business",
        placeConfidence: 0.82,
        category: "drinks",
      }),
    ).toEqual({ name: "Dawn Cafe", nameLocal: null, category: "drinks", confidence: 0.82 });

    expect(
      readBusiness({
        ...basePlace,
        signText: [{ original: "ร้านใหม่", translated: "New Shop" }],
      })?.name,
    ).toBe("New Shop");

    expect(
      readBusiness({
        ...basePlace,
        placeName: "Maybe",
        placeKind: "business",
        placeConfidence: 0.4,
        qualityScore: 9,
        signText: [{ original: "Other", translated: "Other" }],
      }),
    ).toBeNull();
  });

  it("does not treat a public place or an explicit none as a business", () => {
    expect(readBusiness({ ...basePlace, placeKind: "public", placeName: "Beach", placeConfidence: 0.9 })).toBeNull();
    expect(
      readBusiness({
        ...basePlace,
        placeKind: "none",
        signText: [{ original: "Desk", translated: "Desk" }],
      }),
    ).toBeNull();
  });

  it("folds accents and case, and only accepts an edit of the model name", () => {
    expect(namesCollide("Café Dawn", "cafe dawn")).toBe(true);
    expect(foldName("Café Dawn")).toBe("cafe dawn");
    expect(namesCollide("Dawn Cafe", "Dusk Cafe")).toBe(false);
    expect(editedNameAllowed("Cafe Dawn", "Café Dawn")).toBe(true);
    expect(editedNameAllowed("Totally Different", "Café Dawn")).toBe(false);
    expect(sanitizeShopName("  Dawn\nCafe  ")).toBe("Dawn Cafe");
    expect(sanitizeShopName("!!!")).toBeNull();
  });
});

describe("new shop gates", () => {
  const shops = [
    { id: "feet", name: "Noodle", nameLocal: null, distanceM: 10 },
    { id: "same", name: "Café Dawn", nameLocal: "คาเฟ่", distanceM: 80 },
    { id: "other", name: "Laundry", nameLocal: null, distanceM: 120 },
    { id: "far", name: "Café Dawn", nameLocal: null, distanceM: POST_RADIUS_M + 20 },
  ];

  it("blocks any shop within 25 m and a similar name inside the publish radius", () => {
    expect(blockingShops(shops, "Brand New").map((shop) => shop.id)).toEqual(["feet"]);
    expect(SAME_PLACE_M).toBe(25);
    const apart = shops.filter((shop) => shop.id !== "feet");
    expect(blockingShops(apart, "cafe dawn").map((shop) => shop.id)).toEqual(["same"]);
    expect(blockingShops(apart, "Laundry").map((shop) => shop.id)).toEqual(["other"]);
    expect(blockingShops(apart, "Brand New")).toEqual([]);
    expect(blockingShops([{ id: "far", name: "Café Dawn", distanceM: POST_RADIUS_M + 20 }], "cafe dawn")).toEqual([]);
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

  it("lets a demo stand-in post and still blocks a real user who is far", () => {
    expect(allowPostDistance(POST_RADIUS_M + 500, true)).toBe(true);
    expect(allowPostDistance(POST_RADIUS_M + 500, false)).toBe(false);
    expect(allowPostDistance(12, false)).toBe(true);
    const zone = { lat: 12.5684, lng: 99.9577 };
    expect(postStandIn(null, true, zone)).toEqual(zone);
    expect(postStandIn(null, false, zone)).toBeNull();
    expect(postStandIn({ lat: 1, lng: 2 }, false, zone)).toEqual({ lat: 1, lng: 2 });
  });

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
