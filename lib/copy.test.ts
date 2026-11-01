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

  it("names the reveal, the missed reset, and the empty judge desk", () => {
    expect(t("en", "loop.reveal")).toBe("Reveal code");
    expect(t("th", "loop.reveal")).toBe("เปิดรหัส");
    expect(t("en", "judge.notReset")).toBe("The demo was not reset. Tap Start fresh demo.");
    expect(t("th", "judge.notReset")).toBe("เดโมยังไม่ถูกรีเซ็ต แตะเริ่มเดโมใหม่");
    expect(t("en", "loop.nothingJudge")).toBe(
      "Nothing yet. Judge 1 builds the book first: tap Swap roles, or Start fresh demo on /judge.",
    );
    expect(t("th", "loop.nothingJudge")).toBe(
      "ยังไม่มีอะไร กรรมการ 1 ทำหนังสือก่อน: แตะสลับบทบาท หรือเริ่มเดโมใหม่ที่ /judge",
    );
  });

  it("replaces {t} and {name} placeholders", () => {
    expect(t("en", "timer.left", { t: "12m" })).toBe("12m left");
    expect(t("th", "timer.left", { t: "12m" })).toBe("เหลือ 12m");
    expect(t("en", "timer.left", { name: "Mai" })).toBe("{t} left");
    expect(t("fr", "nav.wallet")).toBe(t("en", "nav.wallet"));
    expect(t("vi", "lang.label")).toBe("Language");
  });
});
