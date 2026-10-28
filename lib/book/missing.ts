import { FOOD_CATEGORIES } from "./limits";
import { hoursEmpty } from "./hours";

export type MissingPage = {
  kind: string;
  status: string;
};

const FOOD = new Set<string>(FOOD_CATEGORIES);

/**
 * Same order as book_missing: storefront, logo, hours, menu (food kinds), qr.
 * Hours is filled by a live hours page or by a non-empty shop_books.hours object.
 */
export function bookMissing(input: {
  category: string;
  pages: readonly MissingPage[];
  hours: unknown;
}): string[] {
  const live = input.pages.filter((page) => page.status === "live");
  const has = (kind: string) => live.some((page) => page.kind === kind);
  const missing: string[] = [];
  if (!has("storefront")) missing.push("storefront");
  if (!has("logo")) missing.push("logo");
  if (!has("hours") && hoursEmpty(input.hours)) missing.push("hours");
  if (FOOD.has(input.category) && !has("menu")) missing.push("menu");
  if (!has("qr")) missing.push("qr");
  return missing;
}
