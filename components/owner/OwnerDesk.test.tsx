import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { t } from "../../lib/copy";
import { OwnerDesk, ownerDeskOrder, ownerEmptyKey } from "./OwnerDesk";

describe("owner desk order", () => {
  it("shows coupons, then redeem, then the shop book when verified", () => {
    expect(ownerDeskOrder(true)).toEqual(["coupons", "redeem", "shops"]);
    const html = renderToStaticMarkup(
      createElement(OwnerDesk, {
        initialShops: [{ shopId: "shop-1", name: "Mala Mafia", status: "verified", slug: "mala-mafia" }],
      }),
    );
    const caught = html.indexOf(t("en", "loop.nothing"));
    const heading = html.indexOf(t("en", "loop.shoppers"));
    const redeem = html.indexOf('href="/owner/redeem"');
    const book = html.indexOf('href="/book/mala-mafia"');
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(html).toContain(t("en", "loop.shoppersNote"));
    expect(heading).toBeLessThan(caught);
    expect(caught).toBeGreaterThanOrEqual(0);
    expect(caught).toBeLessThan(redeem);
    expect(html).not.toContain(t("en", "loop.caught"));
    expect(redeem).toBeLessThan(book);
    expect(html).toContain("min-h-11");
    expect(html).toContain("active:bg-surface-2");
  });

  it("keeps shops first and leaves cancel outside the book link", () => {
    expect(ownerDeskOrder(false)).toEqual(["shops", "hint"]);
    const html = renderToStaticMarkup(
      createElement(OwnerDesk, {
        initialShops: [{ shopId: "shop-2", name: "Pak Kapi", status: "pending", slug: "pak-kapi" }],
      }),
    );
    const book = html.indexOf('href="/book/pak-kapi"');
    const hint = html.indexOf(t("en", "loop.waiting"));
    expect(book).toBeGreaterThanOrEqual(0);
    expect(book).toBeLessThan(hint);
    expect(html).not.toContain('href="/owner/redeem"');
    const link = html.slice(book, html.indexOf("</a>", book));
    expect(link).not.toContain(t("en", "claim.cancel"));
    expect(html).toContain(t("en", "claim.cancel"));
  });

  it("uses the judge empty line only while the judge cookie is set", () => {
    expect(ownerEmptyKey(false)).toBe("loop.nothing");
    expect(t("en", ownerEmptyKey(false))).toBe(t("en", "loop.nothing"));
    expect(ownerEmptyKey(true)).toBe("loop.nothingJudge");
    expect(t("en", ownerEmptyKey(true))).toBe(
      "Nothing yet. Judge 1 builds the book first: tap Swap roles, or Start fresh demo on /judge.",
    );
  });
});
