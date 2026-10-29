import { describe, expect, it } from "vitest";
import { DEMO_CENTER, FIXTURE_SHOPS } from "../fixtures/shops";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applySignMatch,
  buildMatcherPrompt,
  decide,
  emptyMatcherResult,
  parseMatcherResult,
  selectCandidates,
  SIGN_MATCH_CONFIDENCE,
} from "./matcher";
import { pickerCandidates } from "../snap/place";

const base = emptyMatcherResult();

describe("matcher", () => {
  it("fills the prompt with every candidate and leaves no placeholders", () => {
    const prompt = buildMatcherPrompt({
      areaLabel: "Soi 102, Hua Hin, Thailand",
      candidates: [
        {
          id: "mala-mafia",
          name: "Mala Mafia",
          nameLocal: "หม่าล่า",
          category: "food",
          distanceM: 12,
        },
        {
          id: "pak-kapi",
          name: "Pak Kapi",
          nameLocal: null,
          category: "food",
          distanceM: 40,
        },
      ],
    });

    expect(prompt).toContain("mala-mafia");
    expect(prompt).toContain("pak-kapi");
    expect(prompt).toContain("for a map app in Soi 102, Hua Hin, Thailand.");
    expect(prompt).toContain("- mala-mafia | หม่าล่า | Mala Mafia | food | ~12 m from the GPS fix");
    expect(prompt).toContain("- pak-kapi | Pak Kapi | Pak Kapi | food | ~40 m from the GPS fix");
    expect(prompt).toContain("แม่เย็น vs แม่ยิ้ม");
    expect(prompt).not.toContain("{AREA}");
    expect(prompt).not.toContain("{CL}");
    expect(/\{[A-Z]+\}/.test(prompt)).toBe(false);
  });

  it("normalises a matcher payload and rejects an unknown shop", () => {
    const parsed = parseMatcherResult(
      {
        shop_id: "mala-mafia",
        confidence: 0.91,
        sign_text: [
          { thai: "มาล่า", english: "mala" },
          { thai: " ", english: "skip" },
        ],
        quality_score: 12,
        quality_reason: "sharp",
        faces: [[-1, 0.2, 1.4, 0.5], [1, 2]],
        category: "food",
        safe_to_post: true,
        safe_reason: "no people",
      },
      ["mala-mafia"],
    );
    expect(parsed.shopId).toBe("mala-mafia");
    expect(parsed.confidence).toBe(0.91);
    expect(parsed.signText).toEqual([{ original: "มาล่า", translated: "mala" }]);
    expect(parsed.qualityScore).toBe(10);
    expect(parsed.faces).toEqual([[0, 0.2, 1, 0.5]]);
    expect(parsed.safeToPost).toBe(true);

    const outside = parseMatcherResult(
      { shop_id: "not-a-shop", confidence: 0.95 },
      ["mala-mafia"],
    );
    expect(outside.shopId).toBeNull();
    expect(outside.confidence).toBe(0);
    expect(parseMatcherResult("nope")).toEqual(emptyMatcherResult());
    expect(parseMatcherResult({ shop_id: "null", confidence: 0.4 }).confidence).toBe(0);
    expect(parseMatcherResult({ shop_id: null }).facts).toBeNull();
  });

  it("keeps valid place facts and drops partial, garbage, and oversized values", () => {
    const valid = parseMatcherResult({
      facts: {
        caption: "  Noodles on the stove  ",
        items: [
          { name: " Noodle ", price: 40, currency: "THB" },
          { name: "Tea", price: -1, currency: "usd" },
          { name: " ", price: 10, currency: "THB" },
        ],
        crowd: "busy",
        open_status: "open",
        signals: ["promo", "promo", "nope", "music"],
        sign_language: "th",
        captions: { en: "Noodles", th: "ก๋วยเตี๋ยว" },
      },
    });
    expect(valid.facts).toEqual({
      caption: "Noodles on the stove",
      items: [
        { name: "Noodle", price: 40, currency: "THB" },
        { name: "Tea", price: null, currency: null },
      ],
      crowd: "busy",
      openStatus: "open",
      signals: ["promo", "music"],
      signLanguage: "th",
      captions: { en: "Noodles", th: "ก๋วยเตี๋ยว" },
    });

    const partial = parseMatcherResult({ facts: { caption: "Soup" } });
    expect(partial.facts?.caption).toBe("Soup");
    expect(partial.facts?.items).toEqual([]);
    expect(partial.facts?.openStatus).toBe("unknown");
    expect(partial.facts?.crowd).toBeNull();

    expect(parseMatcherResult({ facts: "nope" }).facts).toBeNull();
    expect(parseMatcherResult({ facts: ["x"] }).facts).toBeNull();

    const long = "x".repeat(200);
    const oversized = parseMatcherResult({
      facts: {
        caption: long,
        items: Array.from({ length: 12 }, (_item, index) => ({ name: "Item " + index, price: 1_000_001, currency: "THB" })),
        signals: ["fresh_batch", "promo", "sold_out", "event", "music", "new_item", "promo"],
      },
    });
    expect(oversized.facts?.caption).toHaveLength(140);
    expect(oversized.facts?.items).toHaveLength(8);
    expect(oversized.facts?.items[0]?.price).toBeNull();
    expect(oversized.facts?.signals).toHaveLength(5);
  });

  it("decides confirm, pick, and pick-all at 0.8", () => {
    expect(decide({ ...base, shopId: "mala-mafia", confidence: 0.8 })).toBe("confirm");
    expect(decide({ ...base, shopId: "mala-mafia", confidence: 0.79 })).toBe("pick");
    expect(decide({ ...base, shopId: null, confidence: 0 })).toBe("pick-all");
  });

  it("keeps nearby shops and falls back to the demo centre", () => {
    const near = selectCandidates(
      { lat: 12.5685, lng: 99.9575 },
      FIXTURE_SHOPS,
      { radiusM: 500, max: 10 },
    );
    expect(near.demo).toBe(false);
    expect(near.candidates[0]?.id).toBe("mala-mafia");
    expect(near.candidates.every((shop) => shop.distanceM <= 500)).toBe(true);

    const far = selectCandidates(
      { lat: DEMO_CENTER.lat + 0.05, lng: DEMO_CENTER.lng },
      FIXTURE_SHOPS,
    );
    expect(far.demo).toBe(true);
    expect(far.candidates.length).toBe(FIXTURE_SHOPS.length);
    expect(far.candidates.every((shop) => shop.distanceM < 600)).toBe(true);

    const missing = selectCandidates(null, FIXTURE_SHOPS, { max: 3 });
    expect(missing.demo).toBe(true);
    expect(missing.candidates).toHaveLength(3);
  });

  it("matches PAK KAPI to Pak Kapi and pins that shop when it is outside the short list", () => {
    const shops = [
      { id: "near", name: "Mala Mafia", nameLocal: null, distanceM: 12 },
      { id: "next", name: "Coconut shake stand", nameLocal: null, distanceM: 20 },
      { id: "third", name: "Krua Mae Yen", nameLocal: null, distanceM: 30 },
      { id: "fourth", name: "Thuk Jai Chieo", nameLocal: null, distanceM: 40 },
      { id: "fifth", name: "Clean Together", nameLocal: null, distanceM: 50 },
      { id: "pak-kapi", name: "Pak Kapi", nameLocal: "ปากกะปิ", distanceM: 420 },
    ];
    const read = {
      ...base,
      placeName: "PAK KAPI",
      placeNameLocal: null,
      signText: [{ original: "PAK KAPI", translated: "PAK KAPI" }],
    };
    const named = applySignMatch(read, shops);
    expect(named.matched).toBe(true);
    expect(named.result.shopId).toBe("pak-kapi");
    expect(named.result.confidence).toBe(SIGN_MATCH_CONFIDENCE);
    expect(named.shops[0]?.id).toBe("pak-kapi");
    const picker = pickerCandidates(named.shops, { pinId: named.result.shopId });
    expect(picker[0]?.id).toBe("pak-kapi");
    expect(picker.some((shop) => shop.id === "near")).toBe(true);
  });
});

describe("add this shop", () => {
  it("shows Add this shop under the picker", () => {
    const screen = readFileSync(resolve(import.meta.dirname, "../../components/snap/SnapFlow.tsx"), "utf8");
    const pick = screen.slice(screen.indexOf('phase === "pick"'));
    expect(pick).toContain('t("en", "add.title")');
    expect(pick).not.toContain("SAME_PLACE_M");
  });
});
