import { describe, expect, it } from "vitest";
import { keptShareCaption } from "./caption";

describe("kept share caption", () => {
  it("credits the photographer and the place facts", () => {
    expect(
      keptShareCaption("en", "Mala", "Mai", {
        items: [{ name: "Noodle", price: 40, currency: "THB" }],
        crowd: "busy",
      }),
    ).toBe("Photo by Mai at Mala. Noodle 40 THB. Busy");
    expect(keptShareCaption("th", "มาล่า", "ใหม่", null)).toBe("รูปโดย ใหม่ ที่ มาล่า");
  });
});
