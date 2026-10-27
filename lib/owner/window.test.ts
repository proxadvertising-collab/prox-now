import { describe, expect, it } from "vitest";
import { daysLeft, expiredUndecided, inDecisionWindow } from "./window";

const hour = 60 * 60 * 1000;

describe("decision window", () => {
  it("keeps an undecided moment for 7 days and then lists it as expired", () => {
    const expiresAt = "2026-10-20T00:00:00.000Z";
    const expires = Date.parse(expiresAt);
    expect(inDecisionWindow(expiresAt, expires + hour)).toBe(true);
    expect(daysLeft(expiresAt, expires + hour)).toBe(7);
    expect(inDecisionWindow(expiresAt, expires + 8 * 24 * hour)).toBe(false);
    const rows = [
      { id: "late", status: "live", expiresAt },
      { id: "kept", status: "kept", expiresAt },
      { id: "fresh", status: "live", expiresAt: "2026-10-27T00:00:00.000Z" },
    ];
    expect(expiredUndecided(rows, expires + 8 * 24 * hour).map((row) => row.id)).toEqual(["late"]);
  });
});
