import { haversineMeters, type LatLng } from "../geo";
import { resizeToJpeg } from "../image/resize";
import { POST_RADIUS_M } from "../snap/place";
import { savedMaybe } from "./waitBook";
import { MAX_IMAGES_PER_CALL, MAX_UPLOAD_IMAGES } from "./limits";

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
  if (error === "upstream") return "saved";
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

/** Storefront, then menu, then hours. The capture screen opens on the first step. */
export const BOOK_CAPTURE_STEPS = ["storefront", "menu", "hours"] as const;

export type BookShot = {
  id: string;
  kind: BookTile | "logo" | "extra" | "auto";
  file: File;
};

export const BOOK_UPLOAD_PATH = "/api/book/pages";

/**
 * Same gate as a live post: the person is at the shop when the rounded
 * distance is within POST_RADIUS_M. Checked once when the book flow opens.
 */
export function atThisShop(
  here: LatLng | null,
  shop: LatLng | null,
  demo = false,
): "ok" | "need_location" | "too_far" | "unknown_shop" {
  if (!shop || !Number.isFinite(shop.lat) || !Number.isFinite(shop.lng)) return "unknown_shop";
  if (demo) return "ok";
  if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lng)) return "need_location";
  const distanceM = Math.round(haversineMeters(here, shop));
  if (distanceM > POST_RADIUS_M) return "too_far";
  return "ok";
}

/**
 * Demo mode matches the map: no shop env, the prox-demo session cookie
 * (Explore the demo zone, or a fixture/demo session), or a demo_accounts row.
 * A real user with none of those stays on the GPS check.
 */
export async function viewerUsesDemoLocation(input: {
  hasEnv: boolean;
  demoCookie: boolean;
  lookup: () => Promise<{ error: unknown; count: number }>;
}): Promise<boolean> {
  if (!input.hasEnv || input.demoCookie) return true;
  try {
    const account = await input.lookup();
    if (account.error) return false;
    return account.count > 0;
  } catch {
    return false;
  }
}

export function addBookShots(
  current: readonly BookShot[],
  kind: BookTile,
  files: readonly File[],
  cap = BOOK_PICK_CAP,
): { shots: BookShot[]; capped: boolean } {
  const incoming = files.filter((file) => file instanceof File);
  if (kind === "menu") {
    const menus = current.filter((shot) => shot.kind === "menu").length;
    const room = Math.max(0, cap - menus);
    const take = incoming.slice(0, room);
    const added = take.map((file) => ({ id: crypto.randomUUID(), kind: "menu" as const, file }));
    return { shots: [...current, ...added], capped: incoming.length > room };
  }
  const primary = incoming[0];
  const without = current.filter((shot) => shot.kind !== kind);
  const withPrimary = primary
    ? [...without, { id: crypto.randomUUID(), kind, file: primary }]
    : without;
  const extras = incoming.slice(1);
  if (extras.length === 0) return { shots: withPrimary, capped: false };
  return addBookShots(withPrimary, "menu", extras, cap);
}

export function removeBookShot(shots: readonly BookShot[], id: string): BookShot[] {
  return shots.filter((shot) => shot.id !== id);
}

/** One request stays under this so a phone upload is not rejected as too large. */
export const BOOK_REQUEST_BYTES = 4 * 1024 * 1024;

const BOOK_JPEG_EDGE = 1600;
const BOOK_JPEG_QUALITY = 0.8;

function sessionForm(shopId: string, shots: readonly BookShot[], mode?: "improve", fresh = false): FormData {
  const form = new FormData();
  form.set("shop", shopId);
  form.set("session", "1");
  if (mode === "improve") form.set("mode", "improve");
  if (fresh) form.set("fresh", "1");
  for (const shot of shots) form.append(shot.kind, shot.file, shot.file.name || "page.jpg");
  return form;
}

async function shrinkBookShot(shot: BookShot): Promise<BookShot> {
  const blob = await resizeToJpeg(shot.file, BOOK_JPEG_EDGE, BOOK_JPEG_QUALITY);
  const named = shot.file.name && /\.jpe?g$/i.test(shot.file.name) ? shot.file.name : "page.jpg";
  const file = new File([blob], named, { type: "image/jpeg" });
  return { id: shot.id, kind: shot.kind, file };
}

/** Pack resized pages so each request stays within the byte cap. One file that is still over the cap goes alone. */
export function packBookShots(shots: readonly BookShot[], limit = BOOK_REQUEST_BYTES): BookShot[][] {
  const batches: BookShot[][] = [];
  let current: BookShot[] = [];
  let bytes = 0;
  for (const shot of shots) {
    const size = shot.file.size;
    if (current.length > 0 && bytes + size > limit) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(shot);
    bytes += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Resize every page, then one form. Uploads split that form when the bytes are still over the cap. */
export async function bookSessionForm(shopId: string, shots: readonly BookShot[]): Promise<FormData> {
  const resized: BookShot[] = [];
  for (const shot of shots) resized.push(await shrinkBookShot(shot));
  return sessionForm(shopId, resized);
}

export function museCallSizes(imageCount: number, limit = MAX_IMAGES_PER_CALL): number[] {
  if (imageCount <= 0) return [];
  const sizes: number[] = [];
  let left = imageCount;
  const cap = Math.max(1, limit);
  while (left > 0) {
    const size = Math.min(cap, left);
    sizes.push(size);
    left -= size;
  }
  return sizes;
}

type BookFetch = (url: string, init: { method: "POST"; body: FormData }) => Promise<Response>;

export type BookUploadResult = {
  url: string;
  status: number;
  error?: string;
  body: unknown;
  readFailed?: boolean;
};

/** Shown when a Meta read fails twice. The same photos stay on the build. */
export const BOOK_READ_MISS = "Couldn't read the photos. Try again";

const STORED_FAILURES = new Set([
  "upload_failed",
  "too_big",
  "bad_image",
  "rate_limited",
  "not_signed_in",
  "not_a_menu",
  "page_limit",
  "book_hidden",
  "already_there",
  "not_owner",
  "bad_kind",
  "not_found",
]);

/** One automatic retry for a Meta 5xx or a dropped request. Storage errors stay one try. */
export function retryBookRead(status: number, error: string | undefined): boolean {
  if (error && STORED_FAILURES.has(error)) return false;
  if (status === 0) return true;
  return status >= 500;
}

export function bookSavePlan(
  result: Pick<BookUploadResult, "status" | "readFailed"> | null,
): "again" | "probe" | "signin" | "fail" | "open" {
  if (result?.readFailed) return "again";
  if (!result || savedMaybe(result.status)) return "probe";
  if (result.status === 401) return "signin";
  if (result.status >= 400) return "fail";
  return "open";
}

async function postBookForm(fetchImpl: BookFetch, form: FormData): Promise<BookUploadResult> {
  try {
    const response = await fetchImpl(BOOK_UPLOAD_PATH, { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const error = typeof body?.error === "string" ? body.error : undefined;
    return { url: BOOK_UPLOAD_PATH, status: response.status, error, body };
  } catch {
    return { url: BOOK_UPLOAD_PATH, status: 0, error: "timeout", body: null };
  }
}

export async function uploadBookSession(
  shopId: string,
  shots: readonly BookShot[],
  fetchImpl: BookFetch = fetch,
  mode?: "improve",
  fresh = false,
): Promise<BookUploadResult> {
  const resized: BookShot[] = [];
  for (const shot of shots) resized.push(await shrinkBookShot(shot));
  const batches = packBookShots(resized);
  const forms =
    batches.length > 0
      ? batches.map((batch) => sessionForm(shopId, batch, mode, fresh))
      : [sessionForm(shopId, [], mode, fresh)];
  let lastOk: BookUploadResult | null = null;
  for (const form of forms) {
    let result = await postBookForm(fetchImpl, form);
    if (retryBookRead(result.status, result.error)) result = await postBookForm(fetchImpl, form);
    if (retryBookRead(result.status, result.error)) return { ...result, readFailed: true };
    if (result.status >= 400) return result;
    lastOk = result;
  }
  return lastOk ?? { url: BOOK_UPLOAD_PATH, status: 204, body: null };
}

export function nextShopNearby<T extends { id: string; slug?: string }>(
  shops: readonly T[],
  current: { id?: string | null; slug?: string | null },
): T | null {
  return (
    shops.find((shop) => {
      if (current.id && shop.id === current.id) return false;
      if (current.slug && shop.slug === current.slug) return false;
      return true;
    }) ?? null
  );
}
