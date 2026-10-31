import { describe, expect, it, vi } from "vitest";
import { MetaTruncated } from "../ai/meta";
import { themeIfReadable } from "./brand";
import { readSeedBatch } from "./read";
import { pagesByCategory } from "./categories";
import { categoryFromOther, cleanNameEn, logoOrHero, parseBookRead } from "./schema";

describe("rich book read", () => {
  it("accepts deals, style, and a logo box, and still parses the old pages shape", () => {
    const parsed = parseBookRead({
      brand: { name: "Cafe Amazon", name_en: "Cafe Amazon", tagline: "Coffee", logo: { index: 1, box: [0.1, 0.2, 0.3, 0.4] } },
      style: { primary: "#112233", secondary: "#ABCDEF", font: "rounded sans", vibe: "warm green cafe" },
      menu: [{ category: "Coffee", items: [{ name: "ลาเต้", name_en: "Latte", price: "50", currency: "THB", photo: 2 }] }],
      deals: [{ title: "SCB 10%", provider: "SCB", discount: "10%", conditions: "weekdays" }],
      photos: [
        { index: 1, kind: "logo" },
        { index: 2, kind: "menu" },
      ],
      hero: 2,
      category: "drinks",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.rich).toBe(true);
    expect(parsed.read.deals?.[0]).toMatchObject({ title: "SCB 10%", provider: "SCB" });
    expect(parsed.read.style).toMatchObject({ font: "rounded sans", primary: "#112233" });
    expect(parsed.read.logo).toEqual({ index: 1, box: [0.1, 0.2, 0.3, 0.4] });
    expect(parsed.read.pages.find((page) => page.index === 2)?.items[0]?.nameEn).toBe("Latte");

    const old = parseBookRead({
      pages: [
        {
          index: 1,
          kind_guess: "menu",
          is_menu: true,
          language: "th",
          section: null,
          items: [{ name: "Pad Thai", price: null, currency: null, note: null }],
        },
      ],
      shop_language: "th",
      tagline_facts: ["Pad Thai"],
      shop_name: null,
      colors: [],
    });
    expect(old.ok).toBe(true);
    if (!old.ok) return;
    expect(old.read.rich).toBeUndefined();
    expect(old.read.pages[0]?.items[0]?.name).toBe("Pad Thai");
  });

  it("falls back to the hero when the logo box is outside the photo", () => {
    expect(logoOrHero(1, [0.2, 0.2, 0.9, 0.9], 4)).toEqual({ index: 4, box: null });
    expect(logoOrHero(1, [0.1, 0.1, 0.2, 0.2], 4)).toEqual({ index: 1, box: [0.1, 0.1, 0.2, 0.2] });
  });

  it("keeps a readable pair and drops a pair that fails contrast", () => {
    expect(themeIfReadable("#FF8A3D", "#1C0E05")).toEqual({ accent: "#FF8A3D", ink: "#1C0E05" });
    expect(themeIfReadable("#FFFFFF", "#FFFFFF")).toBeNull();
    expect(themeIfReadable(null, "#000000")).toBeNull();
  });

  it("keeps one page per category across photos, and names an overflow (2)", () => {
    const coffee = (name: string, photo?: number) => ({
      name,
      price: "40",
      currency: "THB",
      note: null,
      ...(photo ? { photo } : {}),
    });
    const parsed = parseBookRead({
      menu: [
        { category: " Coffee ", items: [coffee("A"), coffee("B"), coffee("C", 2)] },
        { category: "TEA", items: [coffee("Green", 3)] },
        { category: "coffee", items: [coffee("D"), coffee("E"), coffee("F")] },
        { category: "  ", items: [coffee("Extra")] },
      ],
      photos: [
        { index: 1, kind: "storefront" },
        { index: 2, kind: "menu" },
        { index: 3, kind: "menu" },
      ],
      hero: 1,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.read.pages.find((page) => page.index === 1)?.items).toEqual([]);
    const menu = parsed.read.pages.filter((page) => page.kindGuess === "menu").flatMap((page) => page.items);
    expect(menu.map((item) => item.category ?? null)).toEqual([
      "Coffee",
      "Coffee",
      "Coffee",
      "TEA",
      "coffee",
      "coffee",
      "coffee",
      null,
    ]);
    const pages = pagesByCategory(menu);
    expect(pages.map((page) => page.title)).toEqual(["Coffee", "Coffee (2)", "TEA", "More"]);
    expect(new Set(pages.map((page) => page.title)).size).toBe(pages.length);
    expect(pages[0]?.items).toHaveLength(5);
    expect(pages[1]?.items.map((item) => item.name)).toEqual(["F"]);
    expect(pages[3]?.items.map((item) => item.name)).toEqual(["Extra"]);
  });

  it("sets a category only from other and never uses a category label as nameEn", () => {
    expect(categoryFromOther("other", "drinks")).toBe("drinks");
    expect(categoryFromOther("restaurant", "drinks")).toBeNull();
    expect(categoryFromOther("other", "not_a_shop")).toBeNull();
    expect(categoryFromOther("other", "other")).toBeNull();
    expect(cleanNameEn("drinks")).toBeNull();
    expect(cleanNameEn("street food")).toBeNull();
    expect(cleanNameEn("Latte")).toBe("Latte");
    expect(cleanNameEn("Coffee", "Coffee")).toBeNull();
  });

  it("uses one Muse call per seed batch and one shorter retry", async () => {
    const images = [1, 2, 3].map((index) => ({ index, dataUrl: "data:image/jpeg;base64,QQ" }));
    const call = vi.fn(async () => ({
      raw: {
        pages: images.map((image) => ({
          index: image.index,
          kind_guess: "menu",
          is_menu: true,
          items: [{ name: "Tea", price: "40", currency: "THB", note: null }],
        })),
        shop_language: "th",
        tagline_facts: [],
        shop_name: null,
        colors: [],
      },
      model: "muse-spark-1.3",
      ms: 4,
      callId: "call_seed",
    }));
    const pass = await readSeedBatch(images, call as never);
    expect(call).toHaveBeenCalledTimes(1);
    expect(pass.calls).toBe(1);
    expect(pass.read.pages).toHaveLength(3);

    let tries = 0;
    const truncated = vi.fn(async () => {
      tries += 1;
      const error = new Error("max_output_tokens");
      Object.setPrototypeOf(error, MetaTruncated.prototype);
      throw error;
    });
    await expect(readSeedBatch(images, truncated as never)).rejects.toThrow("max_output_tokens");
    expect(tries).toBe(2);
    expect(truncated).toHaveBeenCalledTimes(2);
  });
});
