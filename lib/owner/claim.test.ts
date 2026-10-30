import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClaimShop } from "../../components/owner/ClaimShop";
import { claimButtonMode, claimMatch, claimNear, claimStatus, ownerToolsOpen } from "./claim";

const shop = { lat: 12.5685, lng: 99.9575 };

describe("claim at the shop", () => {
  it("verifies only when the device is within 150 m and the photo matches", () => {
    expect(claimNear({ lat: 12.5685, lng: 99.9575 }, shop)).toBe(true);
    expect(claimNear({ lat: 12.57, lng: 99.9575 }, shop)).toBe(false);
    expect(claimNear(null, shop)).toBe(false);
    expect(claimMatch('{"match":true}')).toBe(true);
    expect(claimMatch({ match: true })).toBe(true);
    expect(claimMatch('{"match":false}')).toBe(false);
    expect(claimMatch("not json")).toBe(false);
    expect(claimStatus(true, true)).toBe("verified");
    expect(claimStatus(false, true)).toBe("pending");
    expect(claimStatus(true, false)).toBe("pending");
  });

  it("hides the button when someone else owns the shop, and says so for the owner", () => {
    expect(claimButtonMode({ otherVerified: true, mine: "none" })).toBe("hidden");
    expect(claimButtonMode({ otherVerified: false, mine: "verified" })).toBe("own");
    expect(claimButtonMode({ otherVerified: false, mine: "pending" })).toBe("claim");
    const hidden = renderToStaticMarkup(createElement(ClaimShop, { shopId: "shop", mode: "hidden" }));
    expect(hidden).toBe("");
    const own = renderToStaticMarkup(createElement(ClaimShop, { shopId: "shop", mode: "own" }));
    expect(own).toContain("You own this shop");
    expect(own).not.toContain("Claim this shop");
    const open = renderToStaticMarkup(createElement(ClaimShop, { shopId: "shop", mode: "claim" }));
    expect(open).toContain("Claim this shop");
    expect(open).not.toContain("You own this shop");
    const source = readFileSync(new URL("../../components/owner/ClaimShop.tsx", import.meta.url), "utf8");
    expect(source).toContain("claim.confirm");
    expect(source).toContain("getUserMedia");
    expect(source).not.toContain('type="file"');
    expect(source).toContain("claim.fail");
  });

  it("unlocks owner tools only after a shop is verified", () => {
    expect(ownerToolsOpen([{ status: "pending" }])).toBe(false);
    expect(ownerToolsOpen([])).toBe(false);
    expect(ownerToolsOpen([{ status: "pending" }, { status: "verified" }])).toBe(true);
  });
});
