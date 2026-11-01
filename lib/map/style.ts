export const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

/** Canvas brightness on the dark base style. */
export const MAP_BRIGHTNESS = 1.15;

export const MAP_DEFAULTS = {
  center: [99.9577, 12.5684] as [number, number],
  zoom: 16.5,
  minZoom: 13,
  maxZoom: 19,
  pitch: 0,
};

export type PaintOverride = {
  id: string;
  property: string;
  value: string;
};

const LABEL = { fill: "#B9B3C7", halo: "#0B0B12" };

function labelPaint(id: string): PaintOverride[] {
  return [
    { id, property: "text-color", value: LABEL.fill },
    { id, property: "text-halo-color", value: LABEL.halo },
  ];
}

/** Warm-up table from the design doc. Missing layer ids are skipped at runtime. */
export const DARK_OVERRIDES: PaintOverride[] = [
  { id: "background", property: "background-color", value: "#0B0B12" },
  { id: "water", property: "fill-color", value: "#12171B" },
  { id: "waterway", property: "line-color", value: "#12171B" },
  { id: "landuse_park", property: "fill-color", value: "#14170F" },
  { id: "landcover_wood", property: "fill-color", value: "#14170F" },
  { id: "landuse_residential", property: "fill-color", value: "#12121C" },
  { id: "building", property: "fill-color", value: "#181824" },
  { id: "building", property: "fill-outline-color", value: "#262636" },
  { id: "highway_path", property: "line-color", value: "#262636" },
  { id: "highway_minor", property: "line-color", value: "#262636" },
  { id: "highway_major_inner", property: "line-color", value: "#3A3A52" },
  { id: "highway_major_subtle", property: "line-color", value: "#3A3A52" },
  ...labelPaint("highway_name_other"),
  ...labelPaint("highway_name_motorway"),
  ...labelPaint("place_other"),
  ...labelPaint("place_suburb"),
  ...labelPaint("place_village"),
  ...labelPaint("place_hamlet"),
  ...labelPaint("place_town"),
  ...labelPaint("place_city"),
  ...labelPaint("place_state"),
  ...labelPaint("place_country"),
  ...labelPaint("place_continent"),
];

export type PaintMap = {
  getLayer: (id: string) => unknown;
  setPaintProperty: (layerId: string, property: string, value: string) => void;
};

export function applyDarkOverrides(map: PaintMap): void {
  for (const row of DARK_OVERRIDES) {
    if (!map.getLayer(row.id)) continue;
    try {
      map.setPaintProperty(row.id, row.property, row.value);
    } catch {
      // The layer exists but does not use this paint property.
    }
  }
}
