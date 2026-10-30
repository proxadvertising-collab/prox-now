import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { afterPin, chooseShotPlace, frameSaveKey, postedSource } from "./where";

describe("desktop snap", () => {
  it("uses GPS, then a pin or the shop, and the demo street for a demo account", () => {
    const at = "2026-10-30T00:00:00.000Z";
    expect(
      chooseShotPlace({
        at,
        gps: { lat: 1, lng: 2, accuracy: 5 },
        demo: null,
        pin: { lat: 9, lng: 9 },
        shop: null,
      })?.source,
    ).toBe("gps");
    expect(
      chooseShotPlace({
        at,
        gps: null,
        demo: { lat: 12.5, lng: 99.9 },
        pin: null,
        shop: { lat: 3, lng: 4 },
      }),
    ).toMatchObject({ lat: 12.5, lng: 99.9, source: "demo" });
    expect(
      chooseShotPlace({ at, gps: null, demo: null, pin: { lat: 3, lng: 4 }, shop: { lat: 8, lng: 8 } }),
    ).toMatchObject({ lat: 3, lng: 4, source: "pin" });
    expect(
      chooseShotPlace({ at, gps: null, demo: null, pin: null, shop: { lat: 8, lng: 8 } }),
    ).toMatchObject({ source: "pin" });
    expect(chooseShotPlace({ at, gps: null, demo: null, pin: null, shop: null })).toBeNull();
    expect(postedSource("demo", true)).toBe("demo");
    expect(postedSource("demo", false)).toBe("gps");
    expect(postedSource("pin", false)).toBe("pin");
  });

  it("says why a frame failed and lets the camera retry", () => {
    expect(frameSaveKey(new Error("frame"))).toBe("snap.frameEmpty");
    expect(frameSaveKey(new Error("jpeg"))).toBe("snap.frameEncode");
    expect(frameSaveKey(new Error("nope"))).toBe("snap.frameFail");
    const camera = readFileSync(resolve(process.cwd(), "components/camera/LiveCamera.tsx"), "utf8");
    expect(camera).toContain('accept="image/*"');
    expect(camera).toContain("multiple");
    expect(camera.match(/snap\.upload/g)).toHaveLength(1);
    expect(camera).toContain("pendingUploads");
    expect(camera).toContain("takePin");
    expect(camera).toContain("snap.retry");
    expect(camera).toContain("snap.where");
    expect(camera).not.toContain("Location is required for a shot.");
    expect(camera).toContain("confirm.named");
    expect(camera).toContain("confirm.different");
    expect(camera).toContain("force");
    const book = readFileSync(resolve(process.cwd(), "components/book/BookBuilder.tsx"), "utf8");
    expect(book).toContain('accept="image/*"');
    expect(book).toContain("snap.where");
    expect(book).toContain("bg-surface-2");
    expect(book).toContain("className={quiet}");
    expect(book).toContain("className={upload}");
    const desk = readFileSync(resolve(process.cwd(), "components/owner/OwnerDesk.tsx"), "utf8");
    expect(desk).toContain("claim.cancel");
    expect(desk).toContain("/api/owner/claim/cancel");
  });
});

describe("afterPin", () => {
  it("reopens the shop picker when seed mode was waiting for a place", () => {
    expect(afterPin({ pickerWaiting: true, uploadsWaiting: 0 })).toBe("picker");
    expect(afterPin({ pickerWaiting: true, uploadsWaiting: 2 })).toBe("picker");
  });

  it("resumes plain uploads only when no picker is waiting", () => {
    expect(afterPin({ pickerWaiting: false, uploadsWaiting: 1 })).toBe("uploads");
    expect(afterPin({ pickerWaiting: false, uploadsWaiting: 0 })).toBe("none");
  });
});
