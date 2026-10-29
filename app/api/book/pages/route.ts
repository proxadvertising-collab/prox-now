import { MetaCallError, MetaKeyMissing, MetaParseError, MetaTruncated } from "../../../../lib/ai/meta";
import { uploadBlock, capStatus } from "../../../../lib/book/caps";
import { mergeHours, hoursFromOwner, type BookHours } from "../../../../lib/book/hours";
import { jpegDataUrl, metaJpeg, storedJpeg, StoredTooBig } from "../../../../lib/book/images";
import { isUploadKind, MAX_MENU_PAGES, MAX_UPLOAD_IMAGES, type UploadKind } from "../../../../lib/book/limits";
import { AI_RESTING_MESSAGE } from "../../../../lib/book/message";
import { bookMissing } from "../../../../lib/book/missing";
import { readLogoFix, straightenLogo, themeFromBrand, type BrandTheme } from "../../../../lib/book/brand";
import { improveSummary, pageFacts, readImprove, type ShotPlan } from "../../../../lib/book/improve";
import { fallbackTheme, paletteFromImage, type BookTheme } from "../../../../lib/book/palette";
import { detectFaces, readBook, type BookPass } from "../../../../lib/book/read";
import { extractedOf, type PageRead } from "../../../../lib/book/schema";
import { allowBook, clientIp } from "../../../../lib/rate/window";
import { createServiceClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cache Components requires the Node.js runtime and rejects the runtime segment config.
export const maxDuration = 60;

const MAX_BYTES = 1_048_576;
const TYPES = new Set(["image/jpeg", "image/jpg", "image/webp"]);
const SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PreparedImage = { index: number; original: Buffer; dataUrl: string };

type Ingested = {
  kind: UploadKind;
  stored: StoredPage[];
  read: BookPass | null;
  resting: boolean;
  upstream: boolean;
  pageByIndex: Map<number, PageRead>;
  faceCalls: number;
  brand: BrandTheme | null;
  plans: ShotPlan[];
  aiError: string | null;
};

type ShopRow = {
  id: string;
  category: string;
  name: string | null;
};

type ExistingBook = {
  hours: unknown;
  theme: unknown;
  tagline: string | null;
  sourceLanguage: string | null;
  builtByModel: string | null;
};

type StoredPage = {
  id: string;
  index: number;
  path: string;
  width: number | null;
  height: number | null;
  facesBlurred: number;
  bytes: Buffer;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function textField(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function collectFiles(form: FormData): File[] {
  const files: File[] = [];
  for (const key of ["files", "files[]", "file"]) {
    for (const value of form.getAll(key)) {
      if (value instanceof File && (value.size > 0 || value.name)) files.push(value);
    }
  }
  return files;
}

function dimension(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > 4000) return null;
  return value;
}

async function removePaths(service: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return;
  try {
    await service.storage.from("shop-book").remove(paths);
  } catch {
    // The row was not kept. A later remove can drop an orphaned object.
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function shopOf(data: unknown): ShopRow | null {
  const row = asRecord(data);
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    category: typeof row.category === "string" ? row.category : "other",
    name: typeof row.name === "string" ? row.name : null,
  };
}

function describesMenu(name: string): boolean {
  return /\bmenu\b/i.test(name);
}

function readFailure(error: unknown): string {
  if (error instanceof MetaTruncated) return error.message;
  if (error instanceof MetaParseError) return error.message;
  if (error instanceof MetaCallError) return error.code;
  if (error instanceof MetaKeyMissing) return error.code;
  if (error instanceof Error && error.message === "max_output_tokens") return "max_output_tokens";
  return "upstream";
}

function existingOf(data: unknown): ExistingBook | null {
  const row = asRecord(data);
  if (!row) return null;
  return {
    hours: row.hours,
    theme: row.theme,
    tagline: typeof row.tagline === "string" ? row.tagline : null,
    sourceLanguage: typeof row.source_language === "string" ? row.source_language : null,
    builtByModel: typeof row.built_by_model === "string" ? row.built_by_model : null,
  };
}

type LivePage = { id: string; kind: string; status: string; extracted: unknown };

function livePagesOf(data: unknown): LivePage[] {
  if (!Array.isArray(data)) return [];
  const pages: LivePage[] = [];
  for (const item of data) {
    const row = asRecord(item);
    if (!row || typeof row.kind !== "string") continue;
    pages.push({
      id: typeof row.id === "string" ? row.id : "",
      kind: row.kind,
      status: typeof row.status === "string" ? row.status : "live",
      extracted: row.extracted ?? {},
    });
  }
  return pages;
}

function duplicatePage(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = String(error.message ?? "");
  return message.includes("shop_book_pages_one_live_single_idx") || message.includes("duplicate key");
}

function aiPayload(read: BookPass | null, faceCalls: number) {
  const chunks = read?.chunks ?? [];
  return {
    model: read?.model ?? null,
    latency_ms: read?.latencyMs ?? 0,
    images_in_call: chunks.length > 0 ? Math.max(...chunks.map((chunk) => chunk.images)) : 0,
    calls: read?.calls ?? 0,
    face_calls: faceCalls,
    chunks: chunks.map((chunk) => ({ images: chunk.images, latency_ms: chunk.latencyMs })),
  };
}

function namedFiles(form: FormData, key: string): File[] {
  const files: File[] = [];
  for (const value of form.getAll(key)) {
    if (value instanceof File && (value.size > 0 || value.name)) files.push(value);
  }
  return files;
}

function fileProblem(file: File): "bad_image" | "too_big" | null {
  if (!TYPES.has(file.type.toLowerCase())) return "bad_image";
  if (file.size > MAX_BYTES) return "too_big";
  return null;
}

function shopLookupColumn(key: string): "id" | "slug" {
  return SHOP_ID.test(key) ? "id" : "slug";
}

function sessionGroups(form: FormData): { kind: UploadKind; files: File[] }[] | "empty" | "bad_image" | "page_limit" {
  const storefront = namedFiles(form, "storefront");
  const logo = namedFiles(form, "logo");
  const hours = namedFiles(form, "hours");
  const menu = namedFiles(form, "menu");
  const extra = namedFiles(form, "extra");
  if (storefront.length > 1 || logo.length > 1 || hours.length > 1) return "bad_image";
  if (menu.length > MAX_MENU_PAGES || extra.length > MAX_MENU_PAGES) return "page_limit";
  const groups: { kind: UploadKind; files: File[] }[] = [];
  if (storefront.length === 1) groups.push({ kind: "storefront", files: storefront });
  if (logo.length === 1) groups.push({ kind: "logo", files: logo });
  if (menu.length > 0) groups.push({ kind: "menu", files: menu });
  if (extra.length > 0) groups.push({ kind: "extra", files: extra });
  if (hours.length === 1) groups.push({ kind: "hours", files: hours });
  if (groups.length === 0) return "empty";
  return groups;
}

function sessionBlock(
  groups: readonly { kind: UploadKind; files: File[] }[],
  livePages: readonly LivePage[],
  improve = false,
): ReturnType<typeof uploadBlock> {
  for (const group of groups) {
    if ((group.kind === "menu" || group.kind === "extra") && group.files.length > MAX_UPLOAD_IMAGES) {
      const pages = livePages.filter((page) => page.status === "live" && page.kind === group.kind).length;
      if (pages + group.files.length > MAX_MENU_PAGES) return "page_limit";
      continue;
    }
    const block = uploadBlock({ kind: group.kind, fileCount: group.files.length, livePages });
    if (improve && block === "already_there") continue;
    if (block) return block;
  }
  return null;
}

async function prepareFiles(files: readonly File[]): Promise<PreparedImage[] | null> {
  try {
    const prepared: PreparedImage[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) return null;
      const original = Buffer.from(await file.arrayBuffer());
      const meta = await metaJpeg(original);
      prepared.push({ index: index + 1, original, dataUrl: jpegDataUrl(meta) });
    }
    return prepared;
  } catch {
    return null;
  }
}

function pageMap(source: Map<number, PageRead>, indexes: ReadonlySet<number>): Map<number, PageRead> {
  const map = new Map<number, PageRead>();
  for (const [index, page] of source) {
    if (indexes.has(index)) map.set(index, page);
  }
  return map;
}

/** A menu session keeps every frame. Photos the reader does not call a menu stay as extras. */
function sessionMenuParts(ingested: Ingested, menuSession: boolean): Ingested[] {
  if (!menuSession || ingested.kind !== "menu" || !ingested.read) return [ingested];
  const extraIndexes = new Set(
    ingested.stored
      .filter((page) => {
        const item = ingested.pageByIndex.get(page.index);
        return !item || !item.isMenu;
      })
      .map((page) => page.index),
  );
  if (extraIndexes.size === 0) return [ingested];
  const menuStored = ingested.stored.filter((page) => !extraIndexes.has(page.index));
  const extraStored = ingested.stored.filter((page) => extraIndexes.has(page.index));
  const extra: Ingested = {
    ...ingested,
    kind: "extra",
    stored: extraStored,
    pageByIndex: pageMap(ingested.pageByIndex, extraIndexes),
    plans: ingested.plans.filter((plan) => extraIndexes.has(plan.index)),
    read: menuStored.length === 0 ? ingested.read : null,
    faceCalls: menuStored.length === 0 ? ingested.faceCalls : 0,
  };
  if (menuStored.length === 0) return [extra];
  const menuIndexes = new Set(menuStored.map((page) => page.index));
  return [
    {
      ...ingested,
      stored: menuStored,
      pageByIndex: pageMap(ingested.pageByIndex, menuIndexes),
      plans: ingested.plans.filter((plan) => menuIndexes.has(plan.index)),
    },
    extra,
  ];
}

async function runPrepared(
  service: SupabaseClient,
  shop: ShopRow,
  kind: UploadKind,
  prepared: readonly PreparedImage[],
  improve: { existing: readonly { id: string; extracted: unknown }[] } | null = null,
  menuSession = false,
): Promise<{ ok: true; ingested: Ingested } | { ok: false; response: NextResponse }> {
  let faceCalls = 0;
  let faceBoxes: Map<number, number[][]>;
  try {
    const faces = await detectFaces(prepared);
    faceBoxes = faces.faces;
    faceCalls = faces.calls;
  } catch (error) {
    if (error instanceof MetaKeyMissing) return { ok: false, response: json({ error: "ai_not_configured" }, 503) };
    return { ok: false, response: json({ error: "blur_failed" }, 422) };
  }

  const stored: StoredPage[] = [];
  const uploaded: string[] = [];
  let brand: BrandTheme | null = null;
  try {
    for (const image of prepared) {
      const boxes = faceBoxes.get(image.index) ?? [];
      let source = image.original;
      if (kind === "logo") {
        const fix = await readLogoFix(image);
        brand = themeFromBrand(fix);
        if (fix) {
          try {
            source = await straightenLogo(image.original, fix);
          } catch {
            source = image.original;
          }
        }
      }
      const jpeg = await storedJpeg(source, boxes);
      const id = crypto.randomUUID();
      const path = shop.id + "/" + id + ".jpg";
      const uploadedFile = await service.storage.from("shop-book").upload(path, jpeg.bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (uploadedFile.error) throw new Error("upload");
      uploaded.push(path);
      stored.push({
        id,
        index: image.index,
        path,
        width: dimension(jpeg.width),
        height: dimension(jpeg.height),
        facesBlurred: boxes.length,
        bytes: jpeg.bytes,
      });
    }
  } catch (error) {
    await removePaths(service, uploaded);
    if (error instanceof StoredTooBig) return { ok: false, response: json({ error: "too_big" }, 413) };
    return { ok: false, response: json({ error: "upload_failed" }, 502) };
  }

  let read: BookPass | null = null;
  let resting = false;
  let upstream = false;
  try {
    read = await readBook(prepared);
  } catch (error) {
    if (error instanceof MetaCallError) resting = true;
    else upstream = true;
  }

  if (read && kind === "menu" && !menuSession) {
    const notMenu = prepared.some((image) => {
      const page = read?.read.pages.find((item) => item.index === image.index);
      return !page || !page.isMenu;
    });
    if (notMenu) {
      await removePaths(service, uploaded);
      return { ok: false, response: json({ error: "not_a_menu" }, 409) };
    }
  }

  const pageByIndex = new Map<number, PageRead>();
  for (const page of read?.read.pages ?? []) pageByIndex.set(page.index, page);
  const plans: ShotPlan[] = [];
  if (improve) {
    for (const page of stored) {
      const facts = pageFacts(pageByIndex.get(page.index) ?? null);
      const image = prepared.find((item) => item.index === page.index);
      const decision = image
        ? await readImprove({ kind, facts, existing: improve.existing, image })
        : { action: "add" as const, pageId: null };
      plans.push({ index: page.index, ...decision });
    }
  }
  return {
    ok: true,
    ingested: { kind, stored, read, resting, upstream, pageByIndex, faceCalls, brand, plans, aiError: null },
  };
}

async function commitBook(input: {
  service: SupabaseClient;
  shop: ShopRow;
  userId: string;
  livePages: readonly LivePage[];
  groups: readonly Ingested[];
  uploaded: string[];
  summary: string | null;
}): Promise<NextResponse> {
  const { service, shop, userId, livePages, groups, uploaded, summary } = input;
  const bookResult = await service
    .from("shop_books")
    .select("hours, theme, tagline, source_language, built_by_model, status")
    .eq("shop_id", shop.id)
    .maybeSingle();
  if (bookResult.error) {
    await removePaths(service, uploaded);
    return json({ error: "upload_failed" }, 502);
  }
  const existing = existingOf(bookResult.data);
  const pageReads: PageRead[] = [];
  for (const group of groups) {
    for (const page of group.pageByIndex.values()) pageReads.push(page);
  }
  const only = groups.length === 1 ? groups[0] : null;
  const onlyRead = only?.read ?? null;
  const hours = hoursFromOwner(existing?.hours) ? null : mergeHours(pageReads.map((page) => page.hours));
  const savedHours: BookHours | Record<string, never> | unknown = hours ?? existing?.hours ?? {};
  let theme: BookTheme | unknown = existing?.theme ?? {};
  const branded = groups.find((group) => group.brand);
  const cover = groups.find((group) => (group.kind === "storefront" || group.kind === "logo") && group.stored[0]);
  if (branded?.brand) {
    theme = branded.brand;
  } else if (cover?.stored[0]) {
    try {
      theme = await paletteFromImage(cover.stored[0].bytes);
    } catch {
      theme = fallbackTheme();
    }
  }

  let tagline = only ? (onlyRead?.read.tagline ?? existing?.tagline ?? null) : (existing?.tagline ?? null);
  let sourceLanguage = only
    ? (onlyRead?.read.shopLanguage ?? existing?.sourceLanguage ?? null)
    : (existing?.sourceLanguage ?? null);
  let builtByModel = only ? (onlyRead?.model ?? existing?.builtByModel ?? null) : (existing?.builtByModel ?? null);
  if (!only) {
    for (const group of groups) {
      const read = group.read;
      if (!read) continue;
      if (read.read.tagline) tagline = read.read.tagline;
      if (read.read.shopLanguage) sourceLanguage = read.read.shopLanguage;
      if (read.model) builtByModel = read.model;
    }
  }

  const now = new Date().toISOString();
  const bookPatch = {
    tagline,
    theme,
    hours: savedHours,
    source_language: sourceLanguage,
    built_by_model: builtByModel,
    updated_at: now,
  };
  const bookWrite = existing
    ? await service.from("shop_books").update(bookPatch).eq("shop_id", shop.id)
    : await service.from("shop_books").insert({ shop_id: shop.id, status: "live", ...bookPatch });
  if (bookWrite.error) {
    await removePaths(service, uploaded);
    return json({ error: "upload_failed" }, 502);
  }

  const batchId = crypto.randomUUID();
  const nowRemoved = new Date().toISOString();
  for (const group of groups) {
    for (const plan of group.plans) {
      if (plan.action !== "replace" || !plan.pageId) continue;
      await service
        .from("shop_book_pages")
        .update({ status: "removed", removed_at: nowRemoved })
        .eq("id", plan.pageId);
    }
  }
  const skipped = groups.flatMap((group) =>
    group.stored.filter((page) => group.plans.some((plan) => plan.index === page.index && plan.action === "skip")),
  );
  await removePaths(
    service,
    skipped.map((page) => page.path),
  );
  let menuCursor = livePages.filter((page) => page.kind === "menu" && page.status === "live").length;
  let extraCursor = livePages.filter((page) => page.kind === "extra" && page.status === "live").length;
  const rows = groups.flatMap((group) => {
    const kept = group.stored.filter((page) => !group.plans.some((plan) => plan.index === page.index && plan.action === "skip"));
    const start = group.kind === "extra" ? extraCursor : menuCursor;
    if (group.kind === "menu") menuCursor += kept.length;
    if (group.kind === "extra") extraCursor += kept.length;
    return kept.map((page, offset) => {
      const meta = group.read?.perPage.get(page.index);
      const extracted =
        group.resting || group.upstream || !group.read ? {} : extractedOf(group.pageByIndex.get(page.index) ?? null);
      return {
        id: page.id,
        shop_id: shop.id,
        kind: group.kind,
        position: group.kind === "menu" || group.kind === "extra" ? start + offset : 0,
        image_path: page.path,
        width: page.width,
        height: page.height,
        status: "live",
        contributed_by: userId,
        batch_id: batchId,
        language: group.pageByIndex.get(page.index)?.language ?? null,
        extracted,
        ai_meta: {
          model: meta?.model ?? null,
          latency_ms: meta?.latencyMs ?? 0,
          images_in_call: meta?.imagesInCall ?? 0,
          call_id: meta?.callId ?? null,
          faces_blurred: page.facesBlurred,
          ...(group.aiError ? { error: group.aiError } : {}),
        },
      };
    });
  });

  const inserted =
    rows.length === 0
      ? { data: [], error: null }
      : await service
          .from("shop_book_pages")
          .insert(rows)
          .select("id, kind, position, image_path, width, height, language, extracted, ai_meta");
  if (inserted.error) {
    await removePaths(service, uploaded);
    if (duplicatePage(inserted.error)) return json({ error: "already_there" }, 409);
    return json({ error: "upload_failed" }, 502);
  }

  const missingResult = await service.rpc("book_missing", { p_shop_id: shop.id });
  const missing = Array.isArray(missingResult.data)
    ? missingResult.data.filter((item): item is string => typeof item === "string")
    : bookMissing({
        category: shop.category,
        pages: [...livePages, ...rows.map((row) => ({ kind: row.kind, status: "live" }))],
        hours: savedHours,
      });

  const pages = Array.isArray(inserted.data) ? inserted.data : rows;
  const faceCalls = groups.reduce((sum, group) => sum + group.faceCalls, 0);
  const bodyOf = (extra: Record<string, unknown>) => (summary ? { ...extra, summary } : extra);
  const seedError = groups.find((group) => group.aiError)?.aiError ?? null;
  if (seedError) {
    return json(
      bodyOf({
        reading: true,
        pages,
        missing,
        hours: savedHours,
        theme,
        ai: { model: null, error: seedError, latency_ms: 0, images_in_call: 0, calls: 0, face_calls: faceCalls, chunks: [] },
      }),
    );
  }
  const resting = groups.some((group) => group.resting);
  const upstream = groups.some((group) => group.upstream || !group.read);
  const ai = aiPayload(null, faceCalls);
  if (resting) {
    return json(bodyOf({ error: "ai_resting", message: AI_RESTING_MESSAGE, pages, missing, ai }), 503);
  }
  if (upstream) {
    return json(bodyOf({ error: "upstream", pages, missing, ai }), 502);
  }
  const successAi =
    groups.length === 1
      ? aiPayload(groups[0]?.read ?? null, groups[0]?.faceCalls ?? 0)
      : {
          model: groups.find((group) => group.read?.model)?.read?.model ?? null,
          latency_ms: groups.reduce((sum, group) => sum + (group.read?.latencyMs ?? 0), 0),
          images_in_call: Math.max(
            0,
            ...groups.flatMap((group) => group.read?.chunks.map((chunk) => chunk.images) ?? []),
          ),
          calls: groups.reduce((sum, group) => sum + (group.read?.calls ?? 0), 0),
          face_calls: faceCalls,
          chunks: groups.flatMap((group) =>
            (group.read?.chunks ?? []).map((chunk) => ({ images: chunk.images, latency_ms: chunk.latencyMs })),
          ),
        };
  return json(bodyOf({ pages, missing, hours: savedHours, theme, ai: successAi }));
}

function carriedRead(read: BookPass, primary: boolean): BookPass {
  if (primary) return read;
  return { ...read, calls: 0, chunks: [], latencyMs: 0 };
}

/** One Muse read for the whole seed batch. Photos are kept even when that read throws. */
async function ingestSeed(
  service: SupabaseClient,
  shop: ShopRow,
  userId: string,
  livePages: readonly LivePage[],
  preparedGroups: readonly { kind: UploadKind; prepared: PreparedImage[] }[],
  fresh: boolean,
): Promise<NextResponse> {
  let nextIndex = 1;
  const flat: { kind: UploadKind; image: PreparedImage }[] = [];
  for (const group of preparedGroups) {
    for (const image of group.prepared) {
      flat.push({ kind: group.kind, image: { ...image, index: nextIndex } });
      nextIndex += 1;
    }
  }

  let read: BookPass | null = null;
  let aiError: string | null = null;
  try {
    if (flat.length > 0) read = await readBook(flat.map((item) => item.image));
  } catch (error) {
    aiError = readFailure(error);
    read = null;
  }

  const storedByKind = new Map<UploadKind, StoredPage[]>();
  const uploaded: string[] = [];
  try {
    for (const item of flat) {
      const jpeg = await storedJpeg(item.image.original, []);
      const id = crypto.randomUUID();
      const path = shop.id + "/" + id + ".jpg";
      const uploadedFile = await service.storage.from("shop-book").upload(path, jpeg.bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (uploadedFile.error) throw new Error("upload");
      uploaded.push(path);
      const list = storedByKind.get(item.kind) ?? [];
      list.push({
        id,
        index: item.image.index,
        path,
        width: dimension(jpeg.width),
        height: dimension(jpeg.height),
        facesBlurred: 0,
        bytes: jpeg.bytes,
      });
      storedByKind.set(item.kind, list);
    }
  } catch (error) {
    await removePaths(service, uploaded);
    if (error instanceof StoredTooBig) return json({ error: "too_big" }, 413);
    return json({ error: "upload_failed" }, 502);
  }

  const pageByIndex = new Map<number, PageRead>();
  for (const page of read?.read.pages ?? []) pageByIndex.set(page.index, page);
  const hasLogo = flat.some((item) => item.kind === "logo");
  const colors = read?.read.colors ?? [];
  const brand =
    colors.length >= 2
      ? themeFromBrand({ box: [0.1, 0.1, 0.9, 0.9], rotation: 0, colors: colors.slice(0, 3), mood: "bold" })
      : hasLogo
        ? themeFromBrand(null)
        : null;
  const shopName = read?.read.shopName ?? null;
  if (fresh && shop.name && describesMenu(shop.name) && shopName && !describesMenu(shopName)) {
    await service.from("shops").update({ name: shopName }).eq("id", shop.id);
  }

  const grouped: Ingested[] = [];
  let primary = true;
  for (const group of preparedGroups) {
    const useRead = read && !aiError ? carriedRead(read, primary) : null;
    if (useRead && primary) primary = false;
    grouped.push({
      kind: group.kind,
      stored: storedByKind.get(group.kind) ?? [],
      read: useRead,
      resting: false,
      upstream: false,
      pageByIndex,
      faceCalls: 0,
      brand: group.kind === "logo" ? brand : null,
      plans: [],
      aiError,
    });
  }
  let parts = grouped.flatMap((group) => sessionMenuParts(group, true));
  if (read && !aiError) {
    let seen = false;
    parts = parts.map((part) => {
      if (part.read && !seen) {
        seen = true;
        return part;
      }
      return { ...part, read: carriedRead(read, false), aiError };
    });
  }
  return commitBook({ service, shop, userId, livePages, groups: parts, uploaded, summary: null });
}

async function retrySeed(service: SupabaseClient, shop: ShopRow): Promise<NextResponse> {
  const listed = await service
    .from("shop_book_pages")
    .select("id, image_path, status")
    .eq("shop_id", shop.id)
    .eq("status", "live");
  if (listed.error) return json({ error: "upload_failed" }, 502);
  const rows = Array.isArray(listed.data) ? listed.data : [];
  const prepared: PreparedImage[] = [];
  const targets: { id: string; index: number }[] = [];
  let index = 1;
  for (const item of rows) {
    const row = asRecord(item);
    const id = typeof row?.id === "string" ? row.id : "";
    const path = typeof row?.image_path === "string" ? row.image_path : "";
    if (!id || !path) continue;
    const bucket = service.storage.from("shop-book") as {
      download: (path: string) => Promise<{ data: { arrayBuffer: () => Promise<ArrayBuffer> } | null; error: { message?: string } | null }>;
    };
    const downloaded = await bucket.download(path);
    if (downloaded.error || !downloaded.data) continue;
    try {
      const bytes = Buffer.from(await downloaded.data.arrayBuffer());
      const meta = await metaJpeg(bytes);
      prepared.push({ index, original: bytes, dataUrl: jpegDataUrl(meta) });
      targets.push({ id, index });
      index += 1;
    } catch {
      continue;
    }
  }
  if (prepared.length === 0) return json({ reading: true, pages: [] });
  let read: BookPass | null = null;
  let aiError: string | null = null;
  try {
    read = await readBook(prepared);
  } catch (error) {
    aiError = readFailure(error);
  }
  for (const target of targets) {
    const page = read?.read.pages.find((item) => item.index === target.index) ?? null;
    const meta = read?.perPage.get(target.index);
    await service
      .from("shop_book_pages")
      .update({
        extracted: aiError || !read ? {} : extractedOf(page),
        language: page?.language ?? null,
        ai_meta: {
          model: meta?.model ?? null,
          latency_ms: meta?.latencyMs ?? 0,
          images_in_call: meta?.imagesInCall ?? 0,
          call_id: meta?.callId ?? null,
          faces_blurred: 0,
          ...(aiError ? { error: aiError } : {}),
        },
      })
      .eq("id", target.id);
  }
  return json({ reading: Boolean(aiError), ai: { model: read?.model ?? null, error: aiError } });
}

async function handleGroups(
  request: Request,
  userId: string,
  service: SupabaseClient,
  shop: ShopRow,
  livePages: readonly LivePage[],
  groups: readonly { kind: UploadKind; files: File[] }[],
  improve = false,
  menuSession = false,
  fresh = false,
): Promise<NextResponse> {
  const preparedGroups: { kind: UploadKind; prepared: PreparedImage[] }[] = [];
  for (const group of groups) {
    const prepared = await prepareFiles(group.files);
    if (!prepared) return json({ error: "bad_image" }, 400);
    preparedGroups.push({ kind: group.kind, prepared });
  }
  if (!(await allowBook(clientIp(request), userId))) {
    return json({ error: "rate_limited" }, 429);
  }
  if (menuSession && !improve) {
    return ingestSeed(service, shop, userId, livePages, preparedGroups, fresh);
  }
  const ingested: Ingested[] = [];
  const kept: string[] = [];
  for (const group of preparedGroups) {
    const existing = improve
      ? livePages.filter((page) => page.kind === group.kind && page.id).map((page) => ({ id: page.id, extracted: page.extracted }))
      : [];
    const result = await runPrepared(
      service,
      shop,
      group.kind,
      group.prepared,
      improve ? { existing } : null,
      menuSession,
    );
    if (!result.ok) {
      await removePaths(service, kept);
      return result.response;
    }
    ingested.push(...sessionMenuParts(result.ingested, menuSession));
    kept.push(...result.ingested.stored.map((page) => page.path));
  }
  const summary = improve
    ? improveSummary(ingested.flatMap((group) => group.plans.map((plan) => ({ kind: group.kind, action: plan.action }))))
    : null;
  return commitBook({ service, shop, userId, livePages, groups: ingested, uploaded: kept, summary });
}

async function openShop(
  service: SupabaseClient,
  shopKey: string,
): Promise<{ ok: true; shop: ShopRow; livePages: LivePage[] } | { ok: false; response: NextResponse }> {
  const shopResult = await service
    .from("shops")
    .select("id, category, name")
    .eq(shopLookupColumn(shopKey), shopKey)
    .maybeSingle();
  if (shopResult.error) return { ok: false, response: json({ error: "upload_failed" }, 502) };
  const shop = shopOf(shopResult.data);
  if (!shop) return { ok: false, response: json({ error: "not_found" }, 404) };

  const hiddenCheck = await service.from("shop_books").select("status").eq("shop_id", shop.id).maybeSingle();
  const hiddenRow = asRecord(hiddenCheck.data);
  if (hiddenRow?.status === "hidden") return { ok: false, response: json({ error: "book_hidden" }, 409) };

  const pageResult = await service
    .from("shop_book_pages")
    .select("id, kind, status, extracted")
    .eq("shop_id", shop.id)
    .eq("status", "live");
  if (pageResult.error) return { ok: false, response: json({ error: "upload_failed" }, 502) };
  return { ok: true, shop, livePages: livePagesOf(pageResult.data) };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "bad_image" }, 400);
  }

  let userClient;
  try {
    userClient = await createClient();
  } catch {
    return json({ error: "not_signed_in" }, 401);
  }
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) return json({ error: "not_signed_in" }, 401);

  const shopKey = textField(form.get("shop"));
  if (!shopKey || shopKey.length > 80) return json({ error: "not_found" }, 404);
  const session = textField(form.get("session")) === "1";
  const improve = textField(form.get("mode")) === "improve";
  const fresh = textField(form.get("fresh")) === "1";
  const retrying = textField(form.get("retry")) === "1";

  if (retrying) {
    let retryService: SupabaseClient;
    try {
      retryService = createServiceClient();
    } catch {
      return json({ error: "upload_failed" }, 502);
    }
    const retryOpened = await openShop(retryService, shopKey);
    if (!retryOpened.ok) return retryOpened.response;
    if (!(await allowBook(clientIp(request), userId))) return json({ error: "rate_limited" }, 429);
    return retrySeed(retryService, retryOpened.shop);
  }

  let groups: { kind: UploadKind; files: File[] }[];
  if (session) {
    const planned = sessionGroups(form);
    if (planned === "empty" || planned === "bad_image") return json({ error: "bad_image" }, 400);
    if (planned === "page_limit") return json({ error: "page_limit" }, 409);
    groups = planned;
  } else {
    const kindText = textField(form.get("kind"));
    if (!isUploadKind(kindText)) return json({ error: "bad_kind" }, 400);
    groups = [{ kind: kindText, files: collectFiles(form) }];
  }

  for (const group of groups) {
    for (const file of group.files) {
      const problem = fileProblem(file);
      if (problem === "too_big") return json({ error: "too_big" }, 413);
      if (problem) return json({ error: "bad_image" }, 400);
    }
  }

  let service: SupabaseClient;
  try {
    service = createServiceClient();
  } catch {
    return json({ error: "upload_failed" }, 502);
  }

  const opened = await openShop(service, shopKey);
  if (!opened.ok) return opened.response;
  const block = session
    ? sessionBlock(groups, opened.livePages, improve)
    : uploadBlock({
        kind: groups[0]?.kind ?? "menu",
        fileCount: groups[0]?.files.length ?? 0,
        livePages: opened.livePages,
      });
  if (improve && block === "already_there") {
    return handleGroups(request, userId, service, opened.shop, opened.livePages, groups, true, session, fresh);
  }
  if (block) return json({ error: block }, capStatus(block));
  return handleGroups(request, userId, service, opened.shop, opened.livePages, groups, improve, session, fresh);
}
