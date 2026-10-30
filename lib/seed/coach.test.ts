import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  COACH_EDGE,
  canAddShot,
  coachPrompt,
  coachToast,
  doneEnabled,
  nearbyShops,
  parseCoach,
  readCoach,
  seedKinds,
  seenChips,
  type CoachRead,
} from "./coach";
import { coachJpeg } from "./jpeg";

const clean: CoachRead = {
  sharp: true,
  duplicate_of: null,
  contains: ["logo"],
  name_guess: "Cafe",
  next_tip_en: "Shoot the main menu board with prices.",
  next_tip_th: "ถ่ายเมนูหลักที่มีราคา",
};

describe("seed coach", () => {
  it("lists shops within 60 m sorted by distance", () => {
    const shops = nearbyShops([
      { id: "far", name: "Far", distanceM: 61 },
      { id: "b", name: "Bee", distanceM: 40 },
      { id: "a", name: "Aye", distanceM: 12 },
      { id: "tie", name: "Zen", distanceM: 40 },
      { id: "edge", name: "Edge", distanceM: 60 },
      { id: "neg", name: "Neg", distanceM: -1 },
    ]);
    expect(shops.map((shop) => shop.id)).toEqual(["a", "b", "tie", "edge"]);
  });

  it("keeps Done disabled under 3 shots and stops at 8", () => {
    expect(doneEnabled(0)).toBe(false);
    expect(doneEnabled(2)).toBe(false);
    expect(doneEnabled(3)).toBe(true);
    expect(doneEnabled(8)).toBe(true);
    expect(doneEnabled(9)).toBe(false);
    expect(canAddShot(7)).toBe(true);
    expect(canAddShot(8)).toBe(false);
  });

  it("parses the coach schema and falls back when the call throws", async () => {
    expect(parseCoach(clean)).toEqual(clean);
    expect(parseCoach({ ...clean, surprise: true })).toBeNull();
    expect(parseCoach({ ...clean, contains: ["logo", "nope", "logo", "menu_board"] })?.contains).toEqual([
      "logo",
      "menu_board",
    ]);
    expect(parseCoach({ ...clean, duplicate_of: 2 }, 3)?.duplicate_of).toBe(2);
    expect(parseCoach({ ...clean, duplicate_of: 3 }, 3)?.duplicate_of).toBeNull();
    expect(await readCoach(async () => clean)).toEqual(clean);
    expect(await readCoach(async () => { throw new Error("meta"); })).toBeNull();
  });

  it("ticks chips from contains and ignores product and qr", () => {
    expect(
      seenChips([
        { contains: ["storefront", "product"] },
        { contains: ["price_tag", "qr"] },
        { contains: ["deal_card"] },
        { contains: ["hours_sign"] },
      ]),
    ).toEqual({ sign: true, menu: true, deals: true, hours: true });
    expect(seenChips([{ contains: ["product", "qr"] }])).toEqual({
      sign: false,
      menu: false,
      deals: false,
      hours: false,
    });
    expect(seenChips([{ contains: ["logo"] }, { contains: ["promo"] }])).toEqual({
      sign: true,
      menu: false,
      deals: true,
      hours: false,
    });
  });

  it("shows a delete prompt when the shot duplicates an earlier photo", () => {
    expect(coachToast({ ...clean, duplicate_of: 2 }, "en")).toEqual({
      text: "Same as photo 2",
      duplicateOf: 2,
    });
    expect(coachToast({ ...clean, sharp: false }, "en")?.text).toBe("Too blurry, retake?");
    expect(coachToast({ ...clean, sharp: false }, "th")?.text).toBe("เบลอไป ถ่ายใหม่ไหม");
    expect(coachToast({ ...clean, next_tip_en: "Shoot an extra angle" }, "en")).toBeNull();
  });

  it("sends every seed upload as kind auto", () => {
    expect(seedKinds(4)).toEqual(["auto", "auto", "auto", "auto"]);
    const prompt = coachPrompt(2, [{ index: 1, contains: ["logo"] }]);
    expect(prompt).toContain("Photo 1: logo");
    expect(prompt).toContain("Never say the word extra.");
    expect(prompt).toContain("MAIN menu board");
  });

  it("shrinks the coach copy to 512 px", async () => {
    const raw = Buffer.alloc(900 * 400 * 3, 40);
    const jpeg = await sharp(raw, { raw: { width: 900, height: 400, channels: 3 } }).jpeg().toBuffer();
    const out = await coachJpeg(jpeg);
    const info = await sharp(out).metadata();
    expect(Math.max(info.width ?? 0, info.height ?? 0)).toBeLessThanOrEqual(COACH_EDGE);
    expect(info.format).toBe("jpeg");
  });
});
