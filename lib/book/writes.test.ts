import { describe, expect, it } from "vitest";
import { bookWriteAllowed } from "./writes";

describe("book writes", () => {
  it("lets anyone add to an unclaimed shop and blocks a non-owner replace", () => {
    expect(bookWriteAllowed({ claimed: false, verifiedOwner: false, serverReset: false, action: "add" })).toBe(true);
    expect(bookWriteAllowed({ claimed: true, verifiedOwner: false, serverReset: false, action: "add" })).toBe(false);
    expect(bookWriteAllowed({ claimed: true, verifiedOwner: false, serverReset: false, action: "replace" })).toBe(false);
    expect(bookWriteAllowed({ claimed: true, verifiedOwner: false, serverReset: false, action: "delete" })).toBe(false);
    expect(bookWriteAllowed({ claimed: true, verifiedOwner: true, serverReset: false, action: "replace" })).toBe(true);
    expect(bookWriteAllowed({ claimed: true, verifiedOwner: false, serverReset: true, action: "delete" })).toBe(true);
    expect(
      bookWriteAllowed({
        claimed: true,
        verifiedOwner: false,
        serverReset: false,
        demoShop: true,
        demoAccount: true,
        action: "add",
      }),
    ).toBe(true);
    expect(
      bookWriteAllowed({
        claimed: true,
        verifiedOwner: false,
        serverReset: false,
        demoShop: true,
        demoAccount: true,
        action: "replace",
      }),
    ).toBe(false);
  });
});
