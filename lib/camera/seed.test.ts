import { describe, expect, it } from "vitest";
import {
  addSeedShot,
  bookKind,
  bubbleCount,
  captureFix,
  emptyTray,
  menuButton,
  parkMenu,
  seedTitle,
  showSeedDone,
  slotOpen,
  stampLine,
  type CaptureFix,
  type SeedShot,
} from "./seed";

const fix: CaptureFix = { lat: 12.57123, lng: 99.95987, accuracy: 8.4, at: "2026-10-29T02:00:00.000Z" };

function shot(slot: SeedShot["slot"], id: string): SeedShot {
  return { id, slot, fix };
}

describe("camera seed", () => {
  it("stamps the capture fix onto one line", () => {
    expect(stampLine(fix)).toBe("12.57123, 99.95987 ±8m 2026-10-29T02:00:00.000Z");
    expect(stampLine({ ...fix, accuracy: null })).not.toContain("±");
  });

  it("names the bubble and keeps extras shut until a book exists", () => {
    expect(seedTitle(false)).toBe("Seed business");
    expect(seedTitle(true)).toBe("Improve book");
    expect(slotOpen("extras", false)).toBe(false);
    expect(slotOpen("extras", true)).toBe(true);
    expect(slotOpen("logo", false)).toBe(true);
  });

  it("flies logo and hours in, and turns menu into Done until it is parked", () => {
    let tray = emptyTray();
    tray = addSeedShot(tray, shot("logo", "l"), false);
    tray = addSeedShot(tray, shot("hours", "h"), false);
    tray = addSeedShot(tray, shot("menu", "m1"), false);
    tray = addSeedShot(tray, shot("menu", "m2"), false);
    tray = addSeedShot(tray, shot("extras", "x"), false);
    expect(tray.shots.map((item) => item.slot)).toEqual(["logo", "hours", "menu", "menu"]);
    expect(bubbleCount(tray)).toBe(2);
    expect(menuButton(tray)).toEqual({ label: "Done", count: 2 });
    expect(showSeedDone(tray)).toBe(true);
    tray = parkMenu(tray);
    expect(menuButton(tray).label).toBe("Menu/Product");
    expect(bubbleCount(tray)).toBe(4);
    expect(bookKind("extras")).toBe("menu");
    expect(bookKind("logo")).toBe("logo");
  });

  it("keeps menu armed across shots until the cap, and a logo shot disarms", () => {
    let tray = emptyTray();
    tray = { ...tray, armed: "menu" };
    tray = addSeedShot(tray, shot("menu", "m1"), false);
    tray = addSeedShot(tray, shot("menu", "m2"), false);
    tray = addSeedShot(tray, shot("menu", "m3"), false);
    expect(tray.armed).toBe("menu");
    expect(tray.shots).toHaveLength(3);
    for (let n = 4; n <= 7; n += 1) tray = addSeedShot(tray, shot("menu", "m" + n), false);
    expect(tray.shots.filter((item) => item.slot === "menu")).toHaveLength(7);
    expect(tray.armed).toBeNull();
    const eighth = addSeedShot(tray, shot("menu", "m8"), false);
    expect(eighth.shots).toHaveLength(7);
    expect(eighth.armed).toBeNull();

    let logo = emptyTray();
    logo = { ...logo, armed: "logo" };
    logo = addSeedShot(logo, shot("logo", "l"), false);
    expect(logo.armed).toBeNull();
    expect(logo.shots.map((item) => item.id)).toEqual(["l"]);

    let hours = emptyTray();
    hours = { ...hours, armed: "hours" };
    hours = addSeedShot(hours, shot("hours", "h"), false);
    expect(hours.armed).toBeNull();

    let extras = emptyTray();
    extras = { ...extras, armed: "extras" };
    extras = addSeedShot(extras, shot("extras", "e1"), true);
    extras = addSeedShot(extras, shot("extras", "e2"), true);
    expect(extras.armed).toBe("extras");
    extras = parkMenu({ ...extras, shots: [...extras.shots, shot("menu", "pm")] });
    expect(extras.menuParked).toBe(true);
    expect(extras.armed).toBeNull();
  });

  it("uses the demo point and otherwise the real GPS fix", async () => {
    const demo = await captureFix({
      now: () => fix.at,
      lookupDemo: async () => ({ lat: 1, lng: 2 }),
      locate: async () => ({ lat: 9, lng: 9, accuracy: 3 }),
    });
    expect(demo).toEqual({ lat: 1, lng: 2, accuracy: null, at: fix.at });
    const real = await captureFix({
      now: () => fix.at,
      lookupDemo: async () => null,
      locate: async () => ({ lat: 9, lng: 8, accuracy: 4 }),
    });
    expect(real?.lat).toBe(9);
    expect(real?.accuracy).toBe(4);
    const none = await captureFix({
      lookupDemo: async () => null,
      locate: async () => null,
    });
    expect(none).toBeNull();
  });
});
