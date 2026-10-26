import { describe, expect, it } from "vitest";
import { copy, t } from "./copy";

describe("copy", () => {
  it("gives English and Thai the same non-empty keys and never says Pok", () => {
    const enKeys = Object.keys(copy.en).sort();
    const thKeys = Object.keys(copy.th).sort();
    expect(thKeys).toEqual(enKeys);
    expect(enKeys.length).toBeGreaterThan(0);
    expect(JSON.stringify(copy).includes("Pok")).toBe(false);
    for (const key of enKeys) {
      const enValue = copy.en[key as keyof typeof copy.en];
      const thValue = copy.th[key as keyof typeof copy.th];
      expect(enValue.length).toBeGreaterThan(0);
      expect(thValue.length).toBeGreaterThan(0);
      expect(enValue.includes("Pok")).toBe(false);
      expect(thValue.includes("Pok")).toBe(false);
    }
  });

  it("replaces {t} and {name} placeholders", () => {
    expect(t("en", "timer.left", { t: "12m" })).toBe("12m left");
    expect(t("th", "timer.left", { t: "12m" })).toBe("เหลือ 12m");
    expect(t("en", "timer.left", { name: "Mai" })).toBe("{t} left");
  });
});
