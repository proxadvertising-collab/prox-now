import { MAX_UPLOAD_IMAGES, type UploadKind } from "./limits";

export const BOOK_PICK_CAP = MAX_UPLOAD_IMAGES;

export type BookTile = "menu" | "storefront" | "hours";

export function bookBuildHref(key: string): string {
  return "/book/" + encodeURIComponent(key) + "/build";
}

/** Unknown missing list still offers the builder. A complete book does not. */
export function bookNeedsBuild(missing: readonly string[] | null): boolean {
  if (!missing) return true;
  return missing.length > 0;
}

export function bookTileInput(): { type: "file"; accept: "image/*"; multiple: true; cap: number } {
  return { type: "file", accept: "image/*", multiple: true, cap: BOOK_PICK_CAP };
}

export function pickedBookFiles(list: ArrayLike<File> | null, cap = BOOK_PICK_CAP): File[] {
  if (!list || list.length === 0) return [];
  return Array.from(list).slice(0, cap);
}

export function prepareBookPick(
  kind: BookTile,
  count: number,
): { send: number; capped: boolean } | { error: "empty" | "one" } {
  if (count < 1) return { error: "empty" };
  if (kind !== "menu" && count > 1) return { error: "one" };
  if (count > BOOK_PICK_CAP) return { send: BOOK_PICK_CAP, capped: true };
  return { send: count, capped: false };
}

export type BookUploadState = "ok" | "signin" | "resting" | "saved" | "rejected";

export function bookUploadState(status: number, error: string | undefined): BookUploadState {
  if (status === 401 || error === "not_signed_in") return "signin";
  if (error === "ai_resting") return "resting";
  if (status >= 200 && status < 300 && !error) return "ok";
  if (error === "upstream" || status === 502) return "saved";
  return "rejected";
}

export function bookErrorKey(code: string | undefined): string {
  switch (code) {
    case "not_a_menu":
      return "book.notMenu";
    case "blur_failed":
      return "book.blur";
    case "too_big":
      return "book.tooBig";
    case "bad_image":
      return "book.badImage";
    case "already_there":
      return "book.already";
    case "page_limit":
      return "book.pageLimit";
    case "book_hidden":
      return "book.hidden";
    case "rate_limited":
      return "book.rate";
    case "ai_resting":
      return "book.resting";
    case "one":
      return "book.one";
    default:
      return "book.failed";
  }
}

export type ReadItem = { name: string; price: string | null };

export type UploadSummary = {
  items: ReadItem[];
  hours: string | null;
  swatches: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function summarizeBookUpload(body: unknown): UploadSummary {
  const root = asRecord(body);
  const items: ReadItem[] = [];
  if (Array.isArray(root?.pages)) {
    for (const page of root.pages) {
      const extracted = asRecord(asRecord(page)?.extracted);
      if (!Array.isArray(extracted?.items)) continue;
      for (const item of extracted.items) {
        const row = asRecord(item);
        const name = typeof row?.name === "string" ? row.name.trim() : "";
        if (!name) continue;
        const price = row?.price == null ? null : String(row.price);
        items.push({ name, price });
        if (items.length >= 12) break;
      }
    }
  }
  const hours = asRecord(root?.hours);
  const hoursLabel = typeof hours?.raw === "string" && hours.raw.trim() ? hours.raw.trim() : null;
  const theme = asRecord(root?.theme);
  const swatches = Array.isArray(theme?.swatches)
    ? theme.swatches.filter((color): color is string => typeof color === "string" && color.startsWith("#")).slice(0, 5)
    : [];
  return { items, hours: hoursLabel, swatches };
}
