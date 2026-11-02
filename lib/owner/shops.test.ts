import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { t } from "../copy";
import { redeemFailureKey } from "./redeem";
import { readOwnerShops } from "./shops";

const root = resolve(import.meta.dirname, "../..");

describe("owner shops", () => {
  it("reads Mala Mafia for the demo owner and ignores a bad row", () => {
    expect(
      readOwnerShops([
        { shopId: "shop-1", name: "Mala Mafia", status: "verified", slug: "mala-mafia" },
        { shopId: "", name: "Nope", status: "pending" },
      ]),
    ).toEqual([{ shopId: "shop-1", name: "Mala Mafia", status: "verified", slug: "mala-mafia" }]);
    expect(readOwnerShops({ shops: [{ shop_id: "shop-2", name: "Pak Kapi", status: "pending" }] })).toEqual([
      { shopId: "shop-2", name: "Pak Kapi", status: "pending" },
    ]);
    expect(readOwnerShops("nope")).toEqual([]);
  });

  it("gives wallet, inbox, and owner Keep/Pass one line and one button", () => {
    const wallet = readFileSync(resolve(root, "components/wallet/WalletList.tsx"), "utf8");
    const inbox = readFileSync(resolve(root, "app/(app)/inbox/page.tsx"), "utf8");
    const desk = readFileSync(resolve(root, "components/owner/OwnerDesk.tsx"), "utf8");
    expect(wallet).toContain('t("en", "empty.wallet")');
    expect(wallet).toContain('action={{ href: "/snap", label: t("en", "snap.cta") }}');
    expect(inbox).toContain('t("en", "empty.inbox")');
    expect(inbox).toContain('href: "/map"');
    expect(desk).toContain('t("en", "empty.owner")');
    expect(desk).toContain('t("en", "loop.nothing")');
    expect(desk).toContain('t("en", "loop.shoppers")');
    expect(desk).toContain('href: "/map"');
    expect(desk).toContain("shop.name");
  });

  it("maps redeem failures onto the three sentences", () => {
    expect(t("en", redeemFailureKey("not_found"))).toBe("That code isn't valid");
    expect(t("en", redeemFailureKey("expired"))).toBe("That coupon has expired");
    expect(t("en", redeemFailureKey("already_used"))).toBe("That coupon was already used");
    expect(redeemFailureKey("not_owner")).toBe("loop.fail");
    expect(redeemFailureKey(null)).toBe("loop.fail");
    expect(t("th", "loop.codeInvalid")).toBe("รหัสนี้ใช้ไม่ได้");
    const form = readFileSync(resolve(root, "components/owner/RedeemForm.tsx"), "utf8");
    expect(form).toContain("redeemFailureKey(body?.error)");
  });
});
