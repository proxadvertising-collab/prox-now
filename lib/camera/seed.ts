export type CaptureFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
};

export type SeedSlot = "logo" | "menu" | "hours" | "extras";

export type SeedShot = {
  id: string;
  slot: SeedSlot;
  fix: CaptureFix;
};

export type SeedTray = {
  shots: SeedShot[];
  armed: SeedSlot | null;
  menuParked: boolean;
};

export const MENU_CAP = 7;

export function emptyTray(): SeedTray {
  return { shots: [], armed: null, menuParked: false };
}

/** Burned into the corner of a canvas frame. The file itself is the photo. */
export function stampLine(fix: CaptureFix): string {
  const acc = fix.accuracy == null ? "" : ` ±${Math.round(fix.accuracy)}m`;
  return `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}${acc} ${fix.at}`;
}

export function seedTitle(hasBook: boolean): "Seed business" | "Improve book" {
  return hasBook ? "Improve book" : "Seed business";
}

export function slotOpen(slot: SeedSlot, hasBook: boolean): boolean {
  if (slot === "extras") return hasBook;
  return true;
}

export function shotsFor(tray: SeedTray, slot: SeedSlot): SeedShot[] {
  return tray.shots.filter((shot) => shot.slot === slot);
}

export function addSeedShot(tray: SeedTray, shot: SeedShot, hasBook: boolean): SeedTray {
  if (!slotOpen(shot.slot, hasBook)) return tray;
  if (shot.slot === "logo" || shot.slot === "hours") {
    return {
      ...tray,
      armed: null,
      shots: [...tray.shots.filter((item) => item.slot !== shot.slot), shot],
    };
  }
  const count = shotsFor(tray, shot.slot).length;
  if (count >= MENU_CAP) return { ...tray, armed: null };
  return {
    ...tray,
    armed: count + 1 >= MENU_CAP ? null : shot.slot,
    menuParked: shot.slot === "menu" ? false : tray.menuParked,
    shots: [...tray.shots, shot],
  };
}

export function menuButton(tray: SeedTray): { label: "Menu/Product" | "Done"; count: number } {
  const count = shotsFor(tray, "menu").length;
  if (count > 0 && !tray.menuParked) return { label: "Done", count };
  return { label: "Menu/Product", count };
}

/** Menu Done sucks those frames back into the seed bubble. */
export function parkMenu(tray: SeedTray): SeedTray {
  if (shotsFor(tray, "menu").length === 0) return tray;
  return { ...tray, menuParked: true, armed: null };
}

/** Logo and hours fly in on capture. Menu counts after its Done. Extras fly in on capture. */
export function bubbleCount(tray: SeedTray): number {
  return tray.shots.filter((shot) => shot.slot !== "menu" || tray.menuParked).length;
}

export function showSeedDone(tray: SeedTray): boolean {
  return tray.shots.length > 0;
}

/** The pages API has logo, menu, and hours. Extras ride along as menu pages. */
export function bookKind(slot: SeedSlot): "logo" | "menu" | "hours" {
  if (slot === "extras") return "menu";
  return slot;
}

export async function captureFix(input: {
  now?: () => string;
  lookupDemo: () => Promise<{ lat: number; lng: number } | null>;
  locate: () => Promise<{ lat: number; lng: number; accuracy: number | null } | null>;
}): Promise<CaptureFix | null> {
  const at = (input.now ?? (() => new Date().toISOString()))();
  const demo = await input.lookupDemo();
  if (demo) return { lat: demo.lat, lng: demo.lng, accuracy: null, at };
  const here = await input.locate();
  if (!here) return null;
  return { lat: here.lat, lng: here.lng, accuracy: here.accuracy, at };
}
