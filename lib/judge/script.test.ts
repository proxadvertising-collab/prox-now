import { describe, expect, it } from "vitest";
import { BOOK_PROGRESS, DEMO_CAFES, EXPLAINERS, rememberSeen, showExplainer, swapTour } from "./script";

describe("judge script", () => {
  it("has eight steps and a card for each named beat", () => {
    expect(EXPLAINERS).toHaveLength(8);
    expect(EXPLAINERS.map((step) => step.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(EXPLAINERS.map((step) => step.id)).toEqual(["seed", "book", "ask", "translate", "order", "post", "claim", "coupon"]);
    expect(BOOK_PROGRESS).toContain("about a minute");
    expect(DEMO_CAFES.a.slug).toBe("mala-mafia");
    expect(DEMO_CAFES.b.slug).toBe("coconut-shake-stand");
    expect(DEMO_CAFES.b.photos.every((photo) => photo.startsWith("/judge/cafe-b/"))).toBe(true);
    expect(DEMO_CAFES.b.photos.some((photo) => photo.includes("mala-mafia"))).toBe(false);
    expect(DEMO_CAFES.a.photos.length).toBeGreaterThan(0);
  });

  it("shows every card to a judge and once to everyone else", () => {
    expect(showExplainer({ judge: true, step: "seed", seen: ["seed"] })).toBe(true);
    expect(showExplainer({ judge: false, step: "seed", seen: [] })).toBe(true);
    expect(showExplainer({ judge: false, step: "seed", seen: ["seed"] })).toBe(false);
    expect(rememberSeen(["book"], "seed")).toEqual(["book", "seed"]);
    expect(rememberSeen(["seed"], "seed")).toEqual(["seed"]);
  });

  it("swaps onto café B with the roles reversed", () => {
    expect(swapTour({ cafe: "a", role: "shopper", step: "seed" })).toEqual({
      cafe: "b",
      role: "owner",
      enter: "owner",
      step: "claim",
    });
    expect(swapTour({ cafe: "b", role: "owner", step: "claim" })).toMatchObject({ cafe: "a", role: "shopper", enter: "explorer" });
  });
});
