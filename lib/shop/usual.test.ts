import { describe, expect, it } from "vitest";
import { usualItems } from "./usual";

describe("usual items", () => {
  it("needs three facts and reports the typical price", () => {
    const noodle = (price: number) => ({ items: [{ name: "Noodle", price, currency: "THB" }] });
    expect(usualItems([noodle(40), noodle(50)])).toBeNull();
    expect(usualItems([noodle(40), noodle(50), noodle(60)])).toBe("Noodle 50 THB");
  });
});
