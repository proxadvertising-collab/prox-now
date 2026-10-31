import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { advanceStep, BOOK_PROGRESS, DEMO_CAFES, EXPLAINERS, pathStep, rememberSeen, showExplainer, swapTour } from "./script";

describe("judge script", () => {
  it("has eight steps and a card for each named beat", () => {
    expect(EXPLAINERS).toHaveLength(8);
    expect(EXPLAINERS.map((step) => step.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(EXPLAINERS.map((step) => step.id)).toEqual(["seed", "book", "ask", "translate", "order", "post", "claim", "coupon"]);
    expect(BOOK_PROGRESS).toContain("about a minute");
    expect(DEMO_CAFES.a.slug).toBe("mala-mafia");
    expect(DEMO_CAFES.b.slug).toBe("coconut-shake-stand");
    expect(DEMO_CAFES.a.photos.every((photo) => photo.startsWith("/judge/cafe-a/"))).toBe(true);
    expect(DEMO_CAFES.b.photos.every((photo) => photo.startsWith("/judge/cafe-b/"))).toBe(true);
    expect(DEMO_CAFES.b.photos.some((photo) => photo.includes("mala-mafia"))).toBe(false);
    const root = resolve(import.meta.dirname, "../..");
    for (const photo of [...DEMO_CAFES.a.photos, ...DEMO_CAFES.b.photos]) {
      expect(photo).toMatch(/\.(jpg|png|webp)$/);
      expect(existsSync(resolve(root, "public", photo.slice(1)))).toBe(true);
    }
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
    expect(swapTour({ cafe: "b", role: "owner", step: "claim" })).toMatchObject({ cafe: "a", role: "shopper", enter: "explorer", step: "seed" });
    expect(swapTour({ cafe: "a", role: "owner", step: "claim" })).toMatchObject({ cafe: "b", role: "shopper", step: "seed" });
    expect(DEMO_CAFES[swapTour({ cafe: "a", role: "owner", step: "claim" }).cafe].photos.every((photo) => photo.startsWith("/judge/cafe-b/") && photo.endsWith(".jpg"))).toBe(true);
  });

  it("walks all eight steps forward and never goes back", () => {
    const pages = [
      "/snap",
      "/book/mala",
      "/map",
      "/book/mala/order",
      "/book/mala/order?staff=1",
      "/map?post=post-1",
      "/owner",
      "/wallet",
    ];
    let step: (typeof EXPLAINERS)[number]["id"] = "seed";
    const seen = pages.map((page) => {
      const next = pathStep(page);
      expect(next).not.toBeNull();
      step = advanceStep(step, next ?? step);
      return step;
    });
    expect(seen).toEqual(["seed", "book", "ask", "translate", "order", "post", "claim", "coupon"]);
    expect(advanceStep("post", "order")).toBe("post");
    expect(advanceStep("coupon", "seed")).toBe("coupon");
  });
});
