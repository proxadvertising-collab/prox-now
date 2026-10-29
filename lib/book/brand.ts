import sharp from "sharp";
import { callSparkImages } from "../ai/meta";
import { fallbackTheme, themeFromSwatches, type BookTheme } from "./palette";
import { logoFixPrompt } from "./prompt";

export const FONT_MOODS = ["bold", "elegant", "playful", "street"] as const;

export type FontMood = (typeof FONT_MOODS)[number];

export type LogoFix = {
  box: [number, number, number, number];
  rotation: number;
  colors: string[];
  mood: FontMood;
};

export type BrandTheme = BookTheme & { mood: FontMood; colors: string[] };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  return "#" + match[1].toUpperCase();
}

function unit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

export function parseLogoFix(value: unknown): LogoFix | null {
  const root = asRecord(value);
  if (!root || !Array.isArray(root.box) || root.box.length !== 4) return null;
  const box = root.box.map(unit);
  if (box.some((item) => item == null)) return null;
  const [x1, y1, x2, y2] = box as [number, number, number, number];
  if (x2 - x1 < 0.05 || y2 - y1 < 0.05) return null;
  if (typeof root.rotation !== "number" || !Number.isFinite(root.rotation)) return null;
  if (root.rotation < -180 || root.rotation > 180) return null;
  if (!Array.isArray(root.colors)) return null;
  const colors = root.colors.map(hexColor).filter((color): color is string => Boolean(color)).slice(0, 3);
  if (colors.length < 2) return null;
  if (typeof root.mood !== "string" || !FONT_MOODS.includes(root.mood as FontMood)) return null;
  return { box: [x1, y1, x2, y2], rotation: root.rotation, colors, mood: root.mood as FontMood };
}

export function themeFromBrand(fix: LogoFix | null): BrandTheme {
  if (!fix) {
    const theme = fallbackTheme();
    return { ...theme, mood: "bold", colors: [theme.accent, theme.swatches[1], theme.swatches[2]] };
  }
  const padded = [...fix.colors];
  while (padded.length < 5) padded.push(padded[padded.length - 1] ?? "#181513");
  const theme = themeFromSwatches(padded.slice(0, 5).map((hex) => ({ hex, count: 1 })));
  return { ...theme, mood: fix.mood, colors: fix.colors.slice(0, 3) };
}

export async function straightenLogo(bytes: Buffer, fix: LogoFix): Promise<Buffer> {
  const rotated = sharp(bytes, { failOn: "none" }).rotate(fix.rotation, { background: "#ffffff" });
  const { data, info } = await rotated.toBuffer({ resolveWithObject: true });
  const width = info.width ?? 0;
  const height = info.height ?? 0;
  if (width < 2 || height < 2) return bytes;
  const left = Math.min(width - 1, Math.max(0, Math.round(fix.box[0] * width)));
  const top = Math.min(height - 1, Math.max(0, Math.round(fix.box[1] * height)));
  const right = Math.min(width, Math.max(left + 1, Math.round(fix.box[2] * width)));
  const bottom = Math.min(height, Math.max(top + 1, Math.round(fix.box[3] * height)));
  return sharp(data).extract({ left, top, width: right - left, height: bottom - top }).jpeg({ quality: 85 }).toBuffer();
}

export async function readLogoFix(
  image: { dataUrl: string },
  call: typeof callSparkImages = callSparkImages,
): Promise<LogoFix | null> {
  try {
    const result = await call({
      prompt: logoFixPrompt(),
      images: [{ label: "Image 1:", imageDataUrl: image.dataUrl }],
      maxOutputTokens: 400,
    });
    const raw = typeof result.raw === "string" ? result.raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "") : result.raw;
    return parseLogoFix(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}
