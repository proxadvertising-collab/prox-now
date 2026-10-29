import { callSpark, type SparkResult } from "../ai/meta";

export const COUPON_FALLBACK = "10% off your next visit";

export type MenuHint = {
  name: string;
  price?: string;
};

type SparkCall = (input: { prompt: string; imageDataUrl: string }) => Promise<SparkResult>;

export function couponDays(value: unknown): 1 | 7 | 30 {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (parsed === 1 || parsed === 7 || parsed === 30) return parsed;
  return 7;
}

export function trimOffer(value: unknown): string {
  if (typeof value !== "string") return COUPON_FALLBACK;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return COUPON_FALLBACK;
  return text.slice(0, 80);
}

export function parseOffer(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return COUPON_FALLBACK;
  return trimOffer((raw as { offer?: unknown }).offer);
}

export function couponPrompt(items: readonly MenuHint[]): string {
  const lines = items
    .slice(0, 10)
    .map((item) => {
      const name = item.name.trim();
      const price = item.price?.trim();
      if (!name) return "";
      return price ? name + " " + price : name;
    })
    .filter((line) => line.length > 0);
  const menu = lines.length > 0 ? lines.join("\n") : "(none listed)";
  return [
    "Look at this shop photo. Suggest one short coupon offer the customer can redeem.",
    "Use only what is visible in the photo or listed in these book items:",
    menu,
    'Return ONLY JSON {"offer":""}.',
    "The offer is one line, 80 characters or fewer. No other keys.",
  ].join("\n");
}

export async function suggestCouponOffer(input: {
  imageDataUrl: string;
  items?: readonly MenuHint[];
  call?: SparkCall;
}): Promise<string> {
  const call = input.call ?? callSpark;
  try {
    const spark = await call({
      prompt: couponPrompt(input.items ?? []),
      imageDataUrl: input.imageDataUrl,
    });
    return parseOffer(spark.raw);
  } catch {
    return COUPON_FALLBACK;
  }
}
