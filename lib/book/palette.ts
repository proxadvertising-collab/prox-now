import sharp from "sharp";

/** Dark card colour from app/globals.css. Accent text must clear 4.5:1 against it. */
export const SURFACE = "#181513";

/** Prox accent from app/globals.css. Used when the photo has no strong colour. */
export const PROX_ACCENT = "#FF8A3D";

export const INK_LIGHT = "#F7F0E8";

export const INK_DARK = "#1C0E05";

export const MIN_CONTRAST = 4.5;

/** Below this, a swatch is too grey to brand the book, even if it is light enough to read. */
export const MIN_SATURATION = 0.15;

export type BookTheme = {
  swatches: [string, string, string, string, string];
  accent: string;
  ink: string;
};

type Rgb = [number, number, number];

export function parseHex(value: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase();
}

export function toHex(r: number, g: number, b: number): string {
  return "#" + hexByte(r) + hexByte(g) + hexByte(b);
}

function linear(channel: number): number {
  const srgb = channel / 255;
  if (srgb <= 0.03928) return srgb / 12.92;
  return ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

export function contrastRatio(a: string, b: string): number {
  const left = relativeLuminance(a);
  const right = relativeLuminance(b);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

export function saturation(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const max = Math.max(...rgb) / 255;
  const min = Math.min(...rgb) / 255;
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return 0;
  return light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
}

export function pickInk(accent: string): string {
  const light = contrastRatio(INK_LIGHT, accent);
  const dark = contrastRatio(INK_DARK, accent);
  const winner = light >= dark ? INK_LIGHT : INK_DARK;
  const winnerRatio = Math.max(light, dark);
  if (winnerRatio >= MIN_CONTRAST) return winner;
  return contrastRatio(INK_LIGHT, SURFACE) >= contrastRatio(INK_DARK, SURFACE) ? INK_LIGHT : INK_DARK;
}

type Swatch = { hex: string; count: number };

function quantize(data: Buffer, channels: number): Swatch[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const step = Math.max(3, channels);
  for (let index = 0; index + 2 < data.length; index += step) {
    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0]);
  const swatches: Swatch[] = ranked.slice(0, 5).map(([, bucket]) => ({
    hex: toHex(bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n),
    count: bucket.n,
  }));
  const pad = swatches[0]?.hex ?? SURFACE;
  while (swatches.length < 5) swatches.push({ hex: pad, count: 0 });
  return swatches;
}

export function themeFromSwatches(swatches: readonly Swatch[]): BookTheme {
  const colors = swatches.slice(0, 5).map((swatch) => swatch.hex);
  while (colors.length < 5) colors.push(SURFACE);
  const eligible = colors
    .map((hex) => ({ hex, saturation: saturation(hex), contrast: contrastRatio(hex, SURFACE) }))
    .filter((swatch) => swatch.contrast >= MIN_CONTRAST && swatch.saturation >= MIN_SATURATION)
    .sort((a, b) => b.saturation - a.saturation || b.contrast - a.contrast || (a.hex < b.hex ? -1 : 1));
  const accent = eligible[0]?.hex ?? PROX_ACCENT;
  return {
    swatches: [colors[0], colors[1], colors[2], colors[3], colors[4]],
    accent,
    ink: pickInk(accent),
  };
}

export function fallbackTheme(): BookTheme {
  return themeFromSwatches([
    { hex: PROX_ACCENT, count: 1 },
    { hex: SURFACE, count: 1 },
    { hex: INK_LIGHT, count: 1 },
    { hex: INK_DARK, count: 1 },
    { hex: SURFACE, count: 1 },
  ]);
}

/** Five swatches from a real photo. The accent is a photo colour, or the Prox accent when the photo is dull. */
export async function paletteFromImage(bytes: Buffer): Promise<BookTheme> {
  const { data, info } = await sharp(bytes, { failOn: "none" })
    .rotate()
    .resize(64, 64, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return themeFromSwatches(quantize(data, info.channels ?? 3));
}

/** Every book card sits on the same dark surface; the brand colour is only kept for text when it reads on it. */
export const BOOK_CARD_BG = "#1E1611";
export const BOOK_CARD_TEXT = "#FFF4E8";

export function bookCardColors(accent: string | null | undefined, ink?: string | null): { ink: string; accent: string } {
  const pick = [accent, ink].find((color) => color && parseHex(color) && contrastRatio(color, BOOK_CARD_BG) >= MIN_CONTRAST);
  return { ink: BOOK_CARD_BG, accent: pick ? "#" + pick.trim().slice(1).toUpperCase() : BOOK_CARD_TEXT };
}
