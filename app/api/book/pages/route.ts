import { MetaCallError, MetaKeyMissing, MetaParseError, MetaTruncated } from "../../../../lib/ai/meta";
import { uploadBlock, capStatus } from "../../../../lib/book/caps";
import { mergeHours, hoursFromOwner, type BookHours } from "../../../../lib/book/hours";
import { jpegDataUrl, metaJpeg, storedJpeg, StoredTooBig } from "../../../../lib/book/images";
import { isUploadKind, MAX_MENU_PAGES, MAX_UPLOAD_IMAGES, type UploadKind } from "../../../../lib/book/limits";
import { AI_RESTING_MESSAGE } from "../../../../lib/book/message";
import { bookMissing } from "../../../../lib/book/missing";
import { cropFraction, readLogoFix, straightenLogo, themeFromBrand, themeIfReadable, type BrandTheme } from "../../../../lib/book/brand";
import { batchDupes, dupePlan, photoHash } from "../../../../lib/book/dedupe";
import { improveSummary, pageFacts, readImprove, settleBatch, type ShotPlan } from "../../../../lib/book/improve";
import { fallbackTheme, paletteFromImage, type BookTheme } from "../../../../lib/book/palette";
import { detectFaces, readBook, readSeedBatch, type BookPass } from "../../../../lib/book/read";
import { applyCutouts } from "../../../../lib/book/cutouts";
import { categoryFromOther, extractedOf, type PageRead } from "../../../../lib/book/schema";
import { bookWriteAllowed } from "../../../../lib/book/writes";
import { isPlaceholderShopName, seedBrand, seedSlug } from "../../../../lib/book/seedName";
import { allowBook, clientIp } from "../../../../lib/rate/window";
import { createServiceClient } from "../../../../lib/supabase/admin";
import { createClient } from "../../../../lib/supabase/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cache Components requires the Node.js runtime and rejects the runtime segment config.
export const maxDuration = 300;

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
  slug: string | null;
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
  photoHash: string;
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
    slug: typeof row.slug === "string" ? row.slug : null,
  };
}

function fileKind(kind: string | null): UploadKind {
  if (kind === "logo" || kind === "menu" || kind === "hours" || kind === "storefront") return kind;
  if (kind === "product") return "menu";
  return "extra";
}

function finalPageKind(group: Ingested, index: number): string {
  if (!group.read?.read.rich) return group.kind;
  const guess = group.pageByIndex.get(index)?.kindGuess ?? null;
  if (guess === "qr") return "qr";
  return fileKind(guess);
}

function heroPathOf(groups: readonly Ingested[], hero: number | null): string | null {
  for (const group of groups) {
    const cutout = group.read?.read.heroCutout;
    if (cutout) return cutout;
  }
  if (hero == null) return null;
  for (const group of groups) {
    if (group.kind === "menu" || group.kind === "extra" || group.kind === "hours") continue;
    const found = group.stored.find((page) => page.index === hero);
    if (found) return found.path;
  }
  return null;
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

type LivePage = { id: string; kind: string; status: string; extracted: unknown; hash: string | null };

function photoHashOf(meta: unknown): string | null {
  const row = asRecord(meta);
  const hash = row?.photo_hash;
  return typeof hash === "string" && hash.length > 0 ? hash : null;
}

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
      hash: photoHashOf(row.ai_meta),
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
  const auto = namedFiles(form, "auto");
  if (auto.length > MAX_UPLOAD_IMAGES) return "page_limit";
  if (auto.length > 0) return [{ kind: "extra", files: auto }];
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

function emptyBookPass(): BookPass {
  return {
    read: { pages: [], shopLanguage: null, tagline: null, shopName: null, colors: [] },
    model: null,
    latencyMs: 0,
    calls: 0,
    chunks: [],
    perPage: new Map(),
  };
}

/** Later copies of one photo, and copies already in the live book, are skips. */
function shotDupes(
  images: readonly { index: number; original: Buffer }[],
  liveHashes: readonly { id: string; hash: string | null }[],
): Map<number, { action: "skip"; pageId: string | null }> {
  const hashes = images.map((image) => photoHash(image.original));
  const repeated = batchDupes(hashes);
  const dupeByIndex = new Map<number, { action: "skip"; pageId: string | null }>();
  images.forEach((image, position) => {
    if (repeated.has(position)) {
      dupeByIndex.set(image.index, { action: "skip", pageId: null });
      return;
    }
    const dupe = dupePlan(hashes[position] ?? "", liveHashes);
    if (dupe) dupeByIndex.set(image.index, dupe);
  });
  return dupeByIndex;
}

async function runPrepared(
  service: SupabaseClient,
  shop: ShopRow,
  kind: UploadKind,
  prepared: readonly PreparedImage[],
  improve: { existing: readonly { id: string; extracted: unknown }[] } | null = null,
  menuSession = false,
  liveHashes: readonly { id: string; hash: string | null }[] = [],
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
        photoHash: photoHash(image.original),
      });
    }
  } catch (error) {
    await removePaths(service, uploaded);
    if (error instanceof StoredTooBig) return { ok: false, response: json({ error: "too_big" }, 413) };
    return { ok: false, response: json({ error: "upload_failed" }, 502) };
  }

  const dupeByIndex = shotDupes(prepared, liveHashes);
  const forModel = prepared.filter((image) => !dupeByIndex.has(image.index));

  let read: BookPass | null = null;
  let resting = false;
  let upstream = false;
  if (forModel.length === 0 && dupeByIndex.size > 0) {
    read = emptyBookPass();
  } else {
    try {
      read = await readBook(forModel);
    } catch (error) {
      if (error instanceof MetaCallError) resting = true;
      else upstream = true;
    }
  }

  if (read && kind === "menu" && !menuSession) {
    const notMenu = forModel.some((image) => {
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
  for (const page of stored) {
    const dupe = dupeByIndex.get(page.index);
    if (dupe) {
      plans.push({ index: page.index, ...dupe });
      continue;
    }
    if (!improve) continue;
    const facts = pageFacts(pageByIndex.get(page.index) ?? null);
    const image = prepared.find((item) => item.index === page.index);
    const decision = image
      ? await readImprove({ kind, facts, existing: improve.existing, image })
      : { action: "add" as const, pageId: null };
    plans.push({ index: page.index, ...decision });
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
  improve?: boolean;
  fresh?: boolean;
}): Promise<NextResponse> {
  const { service, shop, userId, livePages, groups, uploaded } = input;
  const ownerResult = await service.from("shop_owners").select("user_id").eq("shop_id", shop.id).eq("status", "verified");
  const owners = Array.isArray(ownerResult.data) ? ownerResult.data : [];
  const claimed = owners.length > 0;
  const verifiedOwner = owners.some((row) => {
    const id = row && typeof row === "object" ? (row as { user_id?: unknown }).user_id : null;
    return id === userId;
  });
  const shopDemoResult = await service.from("shops").select("is_demo").eq("id", shop.id).maybeSingle();
  const demoShop = (shopDemoResult.data as { is_demo?: boolean } | null)?.is_demo === true;
  const demoResult = await service.from("demo_accounts").select("role").eq("user_id", userId);
  const demoAccount = Array.isArray(demoResult.data) && demoResult.data.length > 0;
  const gate = { claimed, verifiedOwner, serverReset: false, demoShop, demoAccount };
  const canReplace = bookWriteAllowed({ ...gate, action: "replace" });
  const batch = groups.flatMap((group) =>
    group.stored.map((page) => ({
      group,
      index: page.index,
      kind: finalPageKind(group, page.index),
      plan: group.plans.find((item) => item.index === page.index) ?? { action: "add" as const, pageId: null },
    })),
  );
  const settled = settleBatch({
    shots: batch.map((shot) => ({ index: shot.index, kind: shot.kind, plan: shot.plan })),
    live: livePages.filter((page) => page.status === "live").map((page) => ({ id: page.id, kind: page.kind })),
    canReplace,
  });
  const settledActions: Array<"skip" | "replace" | "add"> = [];
  for (let i = 0; i < batch.length; i += 1) {
    const shot = batch[i];
    const next = settled[i];
    if (!shot || !next) continue;
    settledActions[i] = next.action;
    const plan = shot.group.plans.find((item) => item.index === shot.index);
    if (plan) {
      plan.action = next.action;
      plan.pageId = next.pageId;
    } else if (next.action !== "add") {
      shot.group.plans.push({ index: shot.index, action: next.action, pageId: next.pageId });
    }
  }
  const summary = input.improve
    ? improveSummary(batch.map((shot, index) => ({ kind: shot.kind, action: settledActions[index] ?? shot.plan.action })))
    : null;
  const replacing = groups.some((group) => group.plans.some((plan) => plan.action === "replace"));
  const adding = groups.some((group) =>
    group.stored.some((page) => !group.plans.some((plan) => plan.index === page.index && plan.action === "skip")),
  );
  if (
    (replacing && !bookWriteAllowed({ ...gate, action: "replace" })) ||
    (adding && !bookWriteAllowed({ ...gate, action: "add" }))
  ) {
    await removePaths(service, uploaded);
    return json({ error: "not_owner" }, 403);
  }
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
  const richRead = groups.find((group) => group.read?.read.rich)?.read?.read ?? null;
  const readable = richRead ? themeIfReadable(richRead.style?.primary ?? null, richRead.style?.secondary ?? null) : null;
  const branded = groups.find((group) => group.brand);
  const cover = groups.find((group) => (group.kind === "storefront" || group.kind === "logo") && group.stored[0]);
  if (readable && richRead) {
    const base = themeFromBrand(null);
    theme = {
      ...base,
      accent: readable.accent,
      ink: readable.ink,
      swatches: [readable.accent, readable.ink, base.swatches[2], base.swatches[3], base.swatches[4]],
      colors: [readable.accent, readable.ink],
      font: richRead.style?.font ?? null,
      vibe: richRead.style?.vibe ?? null,
      deals: richRead.deals ?? [],
      maps: richRead.maps ?? null,
      nameEn: richRead.nameEn ?? null,
      heroPath: heroPathOf(groups, richRead.hero ?? null),
    };
  } else if (branded?.brand) {
    theme = branded.brand;
  } else if (cover?.stored[0]) {
    try {
      theme = await paletteFromImage(cover.stored[0].bytes);
    } catch {
      theme = fallbackTheme();
    }
  }

  let publishedSlug = shop.slug;
  if (isPlaceholderShopName(shop.name)) {
    const found = groups.map((group) => group.read?.read).find((read) => read && (read.shopName || read.nameEn));
    const brand = seedBrand(found?.shopName, found?.nameEn ?? null);
    if (brand) {
      const slug = seedSlug(brand.nameEn, brand.name, shop.id);
      const renamed = await service
        .from("shops")
        .update({ name: brand.name, name_local: brand.nameLocal, slug })
        .eq("id", shop.id);
      if (renamed.error) {
        await service.from("shops").update({ name: brand.name, name_local: brand.nameLocal }).eq("id", shop.id);
      } else {
        publishedSlug = slug;
      }
      if (brand.nameEn && theme && typeof theme === "object" && !Array.isArray(theme)) {
        theme = { ...(theme as Record<string, unknown>), nameEn: brand.nameEn };
      }
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
  const nextCategory = categoryFromOther(
    shop.category,
    groups.find((group) => group.read?.read.category)?.read?.read.category ?? null,
  );
  if (nextCategory) await service.from("shops").update({ category: nextCategory }).eq("id", shop.id);

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
    return kept.map((page) => {
      const meta = group.read?.perPage.get(page.index);
      const extracted =
        group.resting || group.upstream || !group.read ? {} : extractedOf(group.pageByIndex.get(page.index) ?? null);
      const kind = finalPageKind(group, page.index);
      let position = 0;
      if (kind === "menu") {
        position = menuCursor;
        menuCursor += 1;
      } else if (kind === "extra") {
        position = extraCursor;
        extraCursor += 1;
      }
      return {
        id: page.id,
        shop_id: shop.id,
        kind,
        position,
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
          photo_hash: page.photoHash,
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

  const logs = [
    ...groups.flatMap((group) =>
      group.plans
        .filter((plan) => plan.action === "replace" && plan.pageId)
        .map((plan) => ({ shop_id: shop.id, page_id: plan.pageId, user_id: userId, action: "replace" })),
    ),
    ...rows.map((row) => ({ shop_id: shop.id, page_id: row.id, user_id: userId, action: "add" })),
  ];
  if (logs.length > 0) {
    const logged = await service.from("shop_book_writes").insert(logs);
    if (logged.error) {
      // Migration 0020 adds the log. The page rows are already stored.
    }
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
  const bodyOf = (extra: Record<string, unknown>) =>
    summary ? { ...extra, summary, slug: publishedSlug } : { ...extra, slug: publishedSlug };
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
  const upstream = groups.some((group) => {
    if (group.upstream) return true;
    if (group.read) return false;
    return group.stored.some((page) => !group.plans.some((plan) => plan.index === page.index && plan.action === "skip"));
  });
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

  const dupeByIndex = shotDupes(
    flat.map((item) => item.image),
    livePages.map((page) => ({ id: page.id, hash: page.hash })),
  );
  const forModel = flat.filter((item) => !dupeByIndex.has(item.image.index));

  let read: BookPass | null = null;
  let aiError: string | null = null;
  try {
    if (forModel.length > 0) read = await readSeedBatch(forModel.map((item) => item.image));
    else if (dupeByIndex.size > 0) read = emptyBookPass();
  } catch (error) {
    if (error instanceof MetaCallError && (error.code === "timeout" || error.code === "upstream")) {
      const status = error.code === "timeout" ? 504 : 502;
      return json({ error: error.code === "timeout" ? "timeout" : "upstream" }, status);
    }
    aiError = readFailure(error);
    read = null;
  }

  const cutSources = flat.map((item) => ({ index: item.image.index, bytes: item.image.original }));
  const originalHashes = new Map(flat.map((item) => [item.image.index, photoHash(item.image.original)]));
  const logo = read?.read.logo;
  if (read?.read.rich && logo?.box && logo.index !== read.read.hero) {
    const target = flat.find((item) => item.image.index === logo.index);
    if (target) {
      try {
        const cropped = await cropFraction(target.image.original, logo.box);
        target.image = { ...target.image, original: cropped };
      } catch {
        logo.box = null;
      }
    }
  }

  let faceBoxes = new Map<number, number[][]>();
  if (flat.length > 0) {
    try {
      const faces = await detectFaces(flat.map((item) => item.image));
      faceBoxes = faces.faces;
    } catch (error) {
      if (error instanceof MetaKeyMissing) return json({ error: "ai_not_configured" }, 503);
      return json({ error: "blur_failed" }, 422);
    }
  }

  const storedByKind = new Map<UploadKind, StoredPage[]>();
  const uploaded: string[] = [];
  try {
    for (const item of flat) {
      const boxes = faceBoxes.get(item.image.index) ?? [];
      const jpeg = await storedJpeg(item.image.original, boxes);
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
        facesBlurred: (faceBoxes.get(item.image.index) ?? []).length,
        bytes: jpeg.bytes,
        photoHash: originalHashes.get(item.image.index) ?? photoHash(item.image.original),
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
  if (read && !aiError) {
    try {
      const logoBox = read.read.logo?.box;
      const cut = await applyCutouts({
        shopId: shop.id,
        pages: read.read.pages,
        sources: cutSources,
        logo: read.read.logo?.index != null && logoBox ? { index: read.read.logo.index, box: logoBox } : null,
        heroBox: read.read.heroBox ?? null,
        heroIndex: read.read.hero ?? null,
        upload: async (path, bytes) => {
          const uploadedFile = await service.storage.from("shop-book").upload(path, bytes, {
            contentType: "image/webp",
            upsert: false,
          });
          if (uploadedFile.error) return null;
          uploaded.push(path);
          return path;
        },
      });
      if (cut.heroCutout) read.read.heroCutout = cut.heroCutout;
    } catch {
      // The book still saves. Missing cutouts render as text rows.
    }
  }
  const hasLogo = flat.some((item) => item.kind === "logo");
  const colors = read?.read.colors ?? [];
  const rich = Boolean(read?.read.rich);
  const brand = rich
    ? null
    : colors.length >= 2
      ? themeFromBrand({ box: [0.1, 0.1, 0.9, 0.9], rotation: 0, colors: colors.slice(0, 3), mood: "bold" })
      : hasLogo
        ? themeFromBrand(null)
        : null;

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
      plans: (storedByKind.get(group.kind) ?? []).flatMap((page) => {
        const dupe = dupeByIndex.get(page.index);
        return dupe ? [{ index: page.index, ...dupe }] : [];
      }),
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
  return commitBook({ service, shop, userId, livePages, groups: parts, uploaded, fresh });
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
  const targets: { id: string; index: number; photoHash: string }[] = [];
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
      targets.push({ id, index, photoHash: photoHash(bytes) });
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
          photo_hash: target.photoHash,
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
    const ranked = livePages.filter((page) => page.status === "live" && page.id);
    const existing = improve
      ? [...ranked.filter((page) => page.kind === group.kind), ...ranked.filter((page) => page.kind !== group.kind)].map(
          (page) => ({ id: page.id, extracted: page.extracted }),
        )
      : [];
    const result = await runPrepared(
      service,
      shop,
      group.kind,
      group.prepared,
      improve ? { existing } : null,
      menuSession,
      ranked.map((page) => ({ id: page.id, hash: page.hash })),
    );
    if (!result.ok) {
      await removePaths(service, kept);
      return result.response;
    }
    ingested.push(...sessionMenuParts(result.ingested, menuSession));
    kept.push(...result.ingested.stored.map((page) => page.path));
  }
  return commitBook({ service, shop, userId, livePages, groups: ingested, uploaded: kept, improve, fresh });
}

async function openShop(
  service: SupabaseClient,
  shopKey: string,
): Promise<{ ok: true; shop: ShopRow; livePages: LivePage[] } | { ok: false; response: NextResponse }> {
  const shopResult = await service
    .from("shops")
    .select("id, category, name, slug")
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
    .select("id, kind, status, extracted, ai_meta")
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
