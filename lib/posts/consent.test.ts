import { describe, expect, it } from "vitest";
import { factsWithConsent } from "./consent";

describe("factsWithConsent", () => {
  it("stores only the count and never face geometry", () => {
    const saved = factsWithConsent(
      {
        caption: "noodles",
        faces: [[0.1, 0.2, 0.3, 0.4]],
        boxes: [[0.5, 0.5, 0.6, 0.7]],
        items: [{ name: "Tea", price: 40, currency: "THB" }],
      },
      5,
    );
    expect(saved.consent_shown).toBe(2);
    expect(saved.caption).toBe("noodles");
    expect(saved.items).toEqual([{ name: "Tea", price: 40, currency: "THB" }]);
    expect(saved.faces).toBeUndefined();
    expect(saved.boxes).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain("0.1");
    expect(factsWithConsent(null, Number.NaN).consent_shown).toBe(0);
  });
});
