import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICE_LANGS, deviceLang, menuCacheKey, titledItem } from "./device";

describe("device language", () => {
  it("keeps a saved choice and otherwise follows the phone", () => {
    expect(deviceLang("vi", "en-US")).toBe("vi");
    expect(deviceLang(null, "ja-JP")).toBe("ja");
    expect(deviceLang(null, "th-TH")).toBe("th");
    expect(deviceLang(null, "pt-BR")).toBe("en");
    expect(DEVICE_LANGS.map((item) => item.id)).toEqual(["en", "th", "vi", "zh", "ja", "ko", "ru", "de", "fr"]);
  });

  it("caches a menu title per item and language and keeps the original as the subtitle", () => {
    expect(menuCacheKey("ชาเย็น", "vi")).toBe("prox-menu:vi:ชาเย็น");
    expect(menuCacheKey("ชาเย็น", "vi-VN")).toBe(menuCacheKey("ชาเย็น", "vi"));
    expect(titledItem("ชาเย็น", "Trà lạnh")).toEqual({ title: "Trà lạnh", subtitle: "ชาเย็น" });
    expect(titledItem("ชาเย็น", "ชาเย็น")).toEqual({ title: "ชาเย็น", subtitle: null });
    const tile = readFileSync(resolve(import.meta.dirname, "../../components/menu/ItemTile.tsx"), "utf8");
    expect(tile).toContain("/api/order/translate");
    expect(tile).toContain("menuCacheKey");
    expect(tile).toContain("prox-lang");
    const profile = readFileSync(resolve(import.meta.dirname, "../../app/(app)/me/page.tsx"), "utf8");
    expect(profile).toContain("LanguageSwitch");
    const staff = readFileSync(resolve(import.meta.dirname, "../../components/order/OrderUi.tsx"), "utf8");
    expect(staff).toContain("shopStaffLanguage");
    expect(staff).toContain("onPointerDown");
    expect(staff).toContain("border-accent bg-transparent");
  });

  it("shows light skeletons instead of a heading-only wallet or a black snap screen", () => {
    const root = resolve(import.meta.dirname, "../..");
    const wallet = readFileSync(resolve(root, "components/wallet/WalletList.tsx"), "utf8");
    const camera = readFileSync(resolve(root, "components/camera/LiveCamera.tsx"), "utf8");
    const owner = readFileSync(resolve(root, "app/(app)/owner/loading.tsx"), "utf8");
    expect(wallet).toContain("SkeletonCards");
    expect(owner).toContain("SkeletonCards");
    expect(camera).toContain("SkeletonCards");
    expect(camera).toContain("bg-[#FFF8F1]");
    expect(camera).toContain("bottom-[calc(5.5rem+env(safe-area-inset-bottom))]");
    expect(camera).not.toContain("fixed inset-0 z-40 bg-black");
    expect(camera).toContain("border-accent bg-transparent");
  });
});
