import { describe, expect, it } from "vitest";
import { applyDarkOverrides, DARK_OVERRIDES, MAP_BRIGHTNESS, MAP_DEFAULTS, STYLE_URL } from "./style";

describe("map style", () => {
  it("uses the OpenFreeMap dark style and the demo camera", () => {
    expect(STYLE_URL).toBe("https://tiles.openfreemap.org/styles/dark");
    expect(MAP_DEFAULTS.center).toEqual([99.9577, 12.5684]);
    expect(MAP_DEFAULTS.zoom).toBe(16.5);
    expect(MAP_DEFAULTS.minZoom).toBe(13);
    expect(MAP_DEFAULTS.maxZoom).toBe(19);
    expect(MAP_DEFAULTS.pitch).toBe(0);
    expect(MAP_BRIGHTNESS).toBe(1.15);
  });

  it("paints only layers the style actually has", () => {
    const present = new Set(["background", "water", "building"]);
    const calls: string[] = [];
    const map = {
      getLayer(id: string) {
        return present.has(id) ? { id } : undefined;
      },
      setPaintProperty(id: string, property: string, value: string) {
        calls.push(id + ":" + property + ":" + value);
      },
    };

    expect(() => applyDarkOverrides(map)).not.toThrow();

    const expected = DARK_OVERRIDES.filter((row) => present.has(row.id)).map(
      (row) => row.id + ":" + row.property + ":" + row.value,
    );
    expect(calls).toEqual(expected);
    expect(calls).toContain("background:background-color:#0B0B12");
    expect(calls.some((call) => call.startsWith("waterway:"))).toBe(false);
    expect(calls.some((call) => call.startsWith("place_city:"))).toBe(false);
  });
});
