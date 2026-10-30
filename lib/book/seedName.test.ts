import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPlaceholderShopName, seedBookPath, seedBrand, seedSlug } from "./seedName";

const SHOP = "11111111-1111-4111-8111-111111111111";

describe("seed names", () => {
  it("takes the native name and the English line from the reader", () => {
    expect(seedBrand("ฮาร์ดร็อค", "Hard Rock Hua Hin")).toEqual({
      name: "ฮาร์ดร็อค",
      nameLocal: "ฮาร์ดร็อค",
      nameEn: "Hard Rock Hua Hin",
    });
    expect(seedSlug("Hard Rock Hua Hin", "ฮาร์ดร็อค", SHOP)).toBe("hard-rock-hua-hin-111111");
    expect(seedBrand("Mala Mafia", null)).toEqual({ name: "Mala Mafia", nameLocal: null, nameEn: null });
    expect(seedBrand(null, null)).toBeNull();
    expect(isPlaceholderShopName("New shop")).toBe(true);
    expect(isPlaceholderShopName("Hard Rock")).toBe(false);
  });

  it("lands on the book slug and never the shop id", () => {
    expect(seedBookPath(SHOP, "new-shop-abc", "hard-rock-hua-hin-111111")).toBe("/book/hard-rock-hua-hin-111111");
    expect(seedBookPath(SHOP, "new-shop-abc", null)).toBe("/book/new-shop-abc");
    expect(seedBookPath(SHOP, SHOP, null)).toBeNull();
    expect(seedBookPath(SHOP, SHOP, SHOP)).toBeNull();
  });

  it("does not ask for a shop name and the book page uses that slug", () => {
    const camera = readFileSync(resolve(process.cwd(), "components/camera/LiveCamera.tsx"), "utf8");
    expect(camera).not.toContain('phase === "name"');
    expect(camera).not.toContain("Name the shop");
    expect(camera).toContain("PLACEHOLDER_SHOP_NAME");
    expect(camera).toContain("seedBookPath");
    const page = readFileSync(resolve(process.cwd(), "app/(app)/book/[slug]/page.tsx"), "utf8");
    expect(page).toContain("redirect(");
    expect(page).toContain("slug={view.slug}");
    expect(page).toContain("items={card.items}");
    expect(page).not.toContain("if (card.index > 0) return null");
  });
});
