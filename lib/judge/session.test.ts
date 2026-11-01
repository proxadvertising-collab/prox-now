import { describe, expect, it } from "vitest";
import { clearJudgeCookies, hasJudgeCookie, judgeCookie, tourAllowed } from "./session";

describe("judge session", () => {
  it("allows a tour only when the cookie and the tour are both present", () => {
    const tour = { cafe: "a", role: "shopper", step: "seed" };
    expect(tourAllowed({ judgeCookie: false, tour })).toBe(false);
    expect(tourAllowed({ judgeCookie: true, tour: null })).toBe(false);
    expect(tourAllowed({ judgeCookie: false, tour: null })).toBe(false);
    expect(tourAllowed({ judgeCookie: true, tour: "" })).toBe(false);
    expect(tourAllowed({ judgeCookie: true, tour })).toBe(true);
  });

  it("writes the exact judge cookie and the exact clears", () => {
    expect(judgeCookie("explorer")).toBe("prox-judge=explorer; Path=/; SameSite=Lax");
    expect(judgeCookie("owner")).toBe("prox-judge=owner; Path=/; SameSite=Lax");
    expect(clearJudgeCookies()).toEqual([
      "prox-judge=; Path=/; Max-Age=0; SameSite=Lax",
      "prox-demo=; Path=/; Max-Age=0; SameSite=Lax",
    ]);
    expect(hasJudgeCookie("prox-judge=explorer")).toBe(true);
    expect(hasJudgeCookie("prox-judge=owner; Path=/")).toBe(true);
    expect(hasJudgeCookie("prox-demo=1")).toBe(false);
    expect(hasJudgeCookie("")).toBe(false);
  });
});
