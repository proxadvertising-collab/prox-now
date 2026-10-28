import { describe, expect, it } from "vitest";
import { openState, parseHours } from "./hours";

const BANGKOK = "Asia/Bangkok";
const NEW_YORK = "America/New_York";

function hours(days: { d: string; open: string; close: string }[]) {
  return parseHours({ days, raw: "on the board" });
}

describe("parseHours", () => {
  it("normalises day names and clocks", () => {
    const parsed = hours([{ d: "mon", open: "8:00", close: "5pm" }]);
    expect(parsed).toEqual({
      days: [{ d: 1, open: "08:00", close: "17:00" }],
      raw: "on the board",
      source: "photo",
    });
  });

  it("returns null when nothing can be read", () => {
    expect(parseHours(null)).toBeNull();
    expect(parseHours({ days: [{ d: "holiday", open: "later", close: "soon" }] })).toBeNull();
  });
});

describe("openState", () => {
  const weekday = hours([{ d: "mon", open: "08:00", close: "17:00" }]);

  it("is open during the shop's local hours", () => {
    const now = new Date("2026-10-26T03:00:00.000Z");
    expect(openState(weekday, BANGKOK, now)).toEqual({ state: "open", opensAt: null });
  });

  it("is closed and names the next opening", () => {
    const now = new Date("2026-10-26T11:00:00.000Z");
    expect(openState(weekday, BANGKOK, now)).toEqual({ state: "closed", opensAt: "08:00" });
  });

  it("uses the shop timezone", () => {
    const now = new Date("2026-10-26T14:00:00.000Z");
    expect(openState(weekday, NEW_YORK, now).state).toBe("open");
    expect(openState(weekday, BANGKOK, now).state).toBe("closed");
  });

  it("treats overnight hours as open after midnight", () => {
    const overnight = hours([{ d: "mon", open: "18:00", close: "02:00" }]);
    expect(openState(overnight, BANGKOK, new Date("2026-10-26T15:00:00.000Z"))).toEqual({
      state: "open",
      opensAt: null,
    });
    expect(openState(overnight, BANGKOK, new Date("2026-10-26T18:30:00.000Z"))).toEqual({
      state: "open",
      opensAt: null,
    });
    expect(openState(overnight, BANGKOK, new Date("2026-10-26T20:00:00.000Z"))).toEqual({
      state: "closed",
      opensAt: "18:00",
    });
  });

  it("says unknown when hours are missing", () => {
    expect(openState(null, BANGKOK, new Date("2026-10-26T03:00:00.000Z"))).toEqual({
      state: "unknown",
      opensAt: null,
    });
    expect(openState({ days: [], raw: null, source: "photo" }, BANGKOK, new Date())).toEqual({
      state: "unknown",
      opensAt: null,
    });
  });
});
