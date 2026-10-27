import { describe, expect, it } from "vitest";
import { chooseCaption, formatItemPrice, languageName, pickLanguage } from "./viewer";

describe("viewer language", () => {
  it("picks the best supported language and defaults to English", () => {
    expect(pickLanguage("th-TH,th;q=0.9,en;q=0.8")).toBe("th");
    expect(pickLanguage(["fr-FR", "th"])).toBe("th");
    expect(pickLanguage("fr,de;q=0.8")).toBe("en");
    expect(pickLanguage(null)).toBe("en");
    expect(pickLanguage("en;q=0.1, th;q=0.9")).toBe("th");
  });

  it("formats a price in the item currency and skips a missing price", () => {
    const priced = formatItemPrice("Noodle", 40, "THB", "en");
    expect(priced.startsWith("Noodle  ")).toBe(true);
    expect(priced).toContain("40");
    expect(formatItemPrice("Tea", null, "THB", "en")).toBe("Tea");
    expect(formatItemPrice("Tea", 10, null, "th-TH")).toBe("Tea");
  });

  it("chooses the viewer caption, then English, then the sign", () => {
    const captions = { en: "Noodles", th: "ก๋วยเตี๋ยว" };
    expect(chooseCaption(captions, "th", "ร้าน")).toBe("ก๋วยเตี๋ยว");
    expect(chooseCaption({ en: "Noodles", th: null }, "th", "ร้าน")).toBe("Noodles");
    expect(chooseCaption(null, "en", "ร้าน")).toBe("ร้าน");
    expect(chooseCaption(null, "en", "  ")).toBeNull();
    expect(languageName("th", "en")).toBe("Thai");
    expect(languageName("en", "en")).toBeNull();
    expect(languageName(null, "th")).toBeNull();
  });
});
