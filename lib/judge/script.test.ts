import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { seedBookPath } from "../book/seedName";
import { advanceStep, BOOK_PROGRESS, clearJudgeTour, DEMO_CAFES, demoShopTarget, EXPLAINERS, judgeSampleSave, noteBookThanks, pathStep, rememberSeen, sampleBookHeld, SEEN_KEY, showExplainer, startJudgeTour, swapShopperHref, swapTour, tourHref, TOUR_KEY, writeSeen } from "./script";

describe("judge script", () => {
  it("has a step for each named beat, including a book thanks", () => {
    expect(EXPLAINERS).toHaveLength(9);
    expect(EXPLAINERS.map((step) => step.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(EXPLAINERS.map((step) => step.id)).toEqual(["seed", "book", "ask", "translate", "order", "post", "claim", "thanks", "coupon"]);
    expect(EXPLAINERS.find((step) => step.id === "thanks")?.body).toBe(
      "Judge 1 built your book, so you can thank them with a coupon.",
    );
    expect(EXPLAINERS.find((step) => step.id === "claim")?.body).toBe(
      "A real shop claims with a code photo checked by Meta AI. The demo skips it.",
    );
    expect(EXPLAINERS.find((step) => step.id === "ask")?.body).toContain("Closed now");
    expect(EXPLAINERS.find((step) => step.id === "ask")?.body).toContain("Hours not listed");
    expect(EXPLAINERS.find((step) => step.id === "post")?.body).toContain("Give coupon");
    expect(EXPLAINERS.find((step) => step.id === "post")?.body).toContain("Keep is for snap posts");
    expect(EXPLAINERS.find((step) => step.id === "coupon")?.body).toContain("Give coupon");
    expect(EXPLAINERS.find((step) => step.id === "coupon")?.body).not.toContain("Keep sends");
    expect(BOOK_PROGRESS).toContain("about 30 seconds");
    expect(DEMO_CAFES.a.slug).toBe("mala-mafia");
    expect(DEMO_CAFES.a.name).toBe("Farm to Go (demo)");
    expect(DEMO_CAFES.a.photos).toEqual([
      "/judge/cafe-a/1-storefront.jpg",
      "/judge/cafe-a/2-drinks.jpg",
      "/judge/cafe-a/3-brunch.jpg",
    ]);
    expect(DEMO_CAFES.b.name).toBe("Coconut shake stand");
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

  it("saves a judge sample into the demo café on the first try", () => {
    expect(judgeSampleSave(null)).toBeNull();
    expect(judgeSampleSave({ cafe: "a", role: "shopper", step: "seed" })).toEqual({
      shop: "mala-mafia",
      mode: "improve",
    });
    expect(judgeSampleSave({ cafe: "b", role: "owner", step: "claim" })?.shop).toBe("coconut-shake-stand");
    const camera = readFileSync(resolve(import.meta.dirname, "../../components/camera/LiveCamera.tsx"), "utf8");
    const save = camera.slice(camera.indexOf("async function save"), camera.indexOf("async function flip"));
    expect(save.indexOf("judgeSampleSave")).toBeGreaterThan(-1);
    expect(save.indexOf("judgeSampleSave")).toBeLessThan(save.indexOf('fetch("/api/shops"'));
    expect(save).toContain('createdHere ? undefined : "improve"');
    expect(save).toContain("The owner manages this shop's book.");
    expect(save).toContain("contributed_by");
    expect(save).toContain('gte("created_at", startedAt)');
    expect(save).toContain("demoShopTarget");
    expect(save).toContain('.eq("is_demo", true)');
    expect(save).not.toContain("id: judged.shop");
    const shopId = "11111111-1111-4111-8111-111111111101";
    const target = demoShopTarget("mala-mafia", { id: shopId, slug: "mala-mafia", name: "Farm to Go (demo)" });
    expect(target?.id).toBe(shopId);
    expect(seedBookPath(target?.id ?? "", target?.slug, "mala-mafia")).toBe("/book/mala-mafia");
    expect(seedBookPath("mala-mafia", "mala-mafia", "mala-mafia")).toBeNull();
    expect(demoShopTarget("coconut-shake-stand", { id: shopId, slug: "coconut-shake-stand", name: "Coconut shake stand" })?.id).toBe(shopId);
    expect(demoShopTarget("mala-mafia", { id: "mala-mafia", slug: "mala-mafia" })).toBeNull();
    expect(tourHref("shopper")).toBe("/snap?tour=1&samples=1");
    expect(sampleBookHeld({ isDemo: true, slug: "krua-mae-yen" })).toBe(true);
    expect(sampleBookHeld({ isDemo: true, slug: "coconut-shake-stand" })).toBe(true);
    expect(sampleBookHeld({ isDemo: true, slug: DEMO_CAFES.a.slug })).toBe(false);
    expect(sampleBookHeld({ isDemo: false, slug: "krua-mae-yen" })).toBe(false);
    const bookPage = readFileSync(resolve(process.cwd(), "app/(app)/book/[slug]/page.tsx"), "utf8");
    const builder = readFileSync(resolve(process.cwd(), "components/book/BookBuilder.tsx"), "utf8");
    expect(bookPage).toContain("sampleBookHeld");
    expect(bookPage).toContain('t("en", "book.demoFarm")');
    expect(bookPage).toContain('tourHref("shopper")');
    expect(bookPage).toContain("BookAddPhotos");
    expect(builder).toContain("sampleBookHeld({ isDemo, slug })");
    expect(builder).toContain('t("en", "book.demoFarm")');
    expect(tourHref("owner")).toBe("/owner?tour=1");
    expect(camera).not.toContain('explainer("seed").body');
    expect(camera).not.toContain("truncate whitespace-nowrap");
    expect(camera).toContain("Use pre-seeded photos");
    expect(camera).toContain("Turn on location to use sample photos");
    expect(camera).toContain("top-[7.5rem] inset-x-0 z-20 mx-auto");
  });

  it("shows a card only in judge mode and clears both stored keys", () => {
    expect(showExplainer({ judge: true, step: "seed", seen: ["seed"] })).toBe(true);
    expect(showExplainer({ judge: false, step: "seed", seen: [] })).toBe(false);
    expect(showExplainer({ judge: false, step: "seed", seen: ["seed"] })).toBe(false);
    expect(rememberSeen(["book"], "seed")).toEqual(["book", "seed"]);
    expect(rememberSeen(["seed"], "seed")).toEqual(["seed"]);
    const store = new Map<string, string>();
    const session = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => void session.set(key, value),
        removeItem: (key: string) => void session.delete(key),
      },
    });
    startJudgeTour({ cafe: "a", role: "shopper", step: "seed" });
    writeSeen(["seed"]);
    session.set(TOUR_KEY, "{\"cafe\":\"a\"}");
    session.set(SEEN_KEY, "[\"seed\"]");
    clearJudgeTour();
    expect(store.has(TOUR_KEY)).toBe(false);
    expect(store.has(SEEN_KEY)).toBe(false);
    expect(session.has(TOUR_KEY)).toBe(false);
    expect(session.has(SEEN_KEY)).toBe(false);
    vi.unstubAllGlobals();
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

  it("reseeds a shopper swap until thanks, then opens the wallet", () => {
    for (const step of ["seed", "book", "ask", "translate", "order", "post", "claim"] as const) {
      expect(swapShopperHref(step)).toBe("/snap?tour=1&samples=1");
    }
    expect(swapShopperHref("thanks")).toBe("/wallet");
    expect(swapShopperHref("coupon")).toBe("/wallet");
    expect(pathStep(swapShopperHref("thanks"))).toBe("coupon");
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
    expect(pathStep("/owner?thanks=1")).toBe("thanks");
    expect(advanceStep("claim", "thanks")).toBe("thanks");
    expect(advanceStep("post", "order")).toBe("post");
    expect(advanceStep("coupon", "seed")).toBe("coupon");
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
      dispatchEvent: () => true,
    });
    startJudgeTour({ cafe: "a", role: "owner", step: "claim" });
    noteBookThanks();
    expect(JSON.parse(store.get(TOUR_KEY) ?? "{}").step).toBe("thanks");
    vi.unstubAllGlobals();
  });
});
