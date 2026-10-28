import { MetaCallError, MetaKeyMissing, MetaParseError } from "../../../../lib/ai/meta";
import { uploadBlock, capStatus } from "../../../../lib/book/caps";
import { mergeHours, hoursFromOwner, type BookHours } from "../../../../lib/book/hours";
import { jpegDataUrl, metaJpeg, storedJpeg, StoredTooBig } from "../../../../lib/book/images";
import { isUploadKind, type UploadKind } from "../../../../lib/book/limits";
import { AI_RESTING_MESSAGE } from "../../../../lib/book/message";
import { bookMissing } from "../../../../lib/book/missing";
import { fallbackTheme, paletteFromImage, type BookTheme } from "../../../../lib/book/palette";
import { detectFaces, FaceCheckFailed, readBook, type BookPass } from "../../../../lib/book/read";
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

type ShopRow = {
  id: string;
  category: string;
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
  };
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

function livePagesOf(data: unknown): { kind: string; status: string }[] {
  if (!Array.isArray(data)) return [];
  const pages: { kind: string; status: string }[] = [];
  for (const item of data) {
    const row = asRecord(item);
    if (!row || typeof row.kind !== "string") continue;
    pages.push({ kind: row.kind, status: typeof row.status === "string" ? row.status : "live" });
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

  const shopSlug = textField(form.get("shop"));
  const kindText = textField(form.get("kind"));
  const files = collectFiles(form);
  if (!shopSlug || shopSlug.length > 80) return json({ error: "not_found" }, 404);
  if (!isUploadKind(kindText)) return json({ error: "bad_kind" }, 400);
  const kind: UploadKind = kindText;

  for (const file of files) {
    if (!TYPES.has(file.type.toLowerCase())) return json({ error: "bad_image" }, 400);
    if (file.size > MAX_BYTES) return json({ error: "too_big" }, 413);
  }

  let service: SupabaseClient;
  try {
    service = createServiceClient();
  } catch {
    return json({ error: "upload_failed" }, 502);
  }

  const shopResult = await service
    .from("shops")
    .select("id, category")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (shopResult.error) return json({ error: "upload_failed" }, 502);
  const shop = shopOf(shopResult.data);
  if (!shop) return json({ error: "not_found" }, 404);

  const hiddenCheck = await service.from("shop_books").select("status").eq("shop_id", shop.id).maybeSingle();
  const hiddenRow = asRecord(hiddenCheck.data);
  if (hiddenRow?.status === "hidden") return json({ error: "book_hidden" }, 409);

  const pageResult = await service
    .from("shop_book_pages")
    .select("kind, status")
    .eq("shop_id", shop.id)
    .eq("status", "live");
  if (pageResult.error) return json({ error: "upload_failed" }, 502);
  const livePages = livePagesOf(pageResult.data);
  const block = uploadBlock({ kind, fileCount: files.length, livePages });
  if (block) return json({ error: block }, capStatus(block));

  let prepared: { index: number; original: Buffer; dataUrl: string }[];
  try {
    prepared = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) return json({ error: "bad_image" }, 400);
      const original = Buffer.from(await file.arrayBuffer());
      const meta = await metaJpeg(original);
      prepared.push({ index: index + 1, original, dataUrl: jpegDataUrl(meta) });
    }
  } catch {
    return json({ error: "bad_image" }, 400);
  }

  if (!(await allowBook(clientIp(request), userId))) {
    return json({ error: "rate_limited" }, 429);
  }

  let faceCalls = 0;
  let faceBoxes: Map<number, number[][]>;
  try {
    const faces = await detectFaces(prepared);
    faceBoxes = faces.faces;
    faceCalls = faces.calls;
  } catch (error) {
    if (error instanceof MetaKeyMissing) return json({ error: "ai_not_configured" }, 503);
    if (error instanceof FaceCheckFailed || error instanceof MetaCallError || error instanceof MetaParseError) {
      return json({ error: "blur_failed" }, 422);
    }
    return json({ error: "blur_failed" }, 422);
  }

  const stored: StoredPage[] = [];
  const uploaded: string[] = [];
  const batchId = crypto.randomUUID();
  try {
    for (const image of prepared) {
      const boxes = faceBoxes.get(image.index) ?? [];
      const jpeg = await storedJpeg(image.original, boxes);
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
    if (error instanceof StoredTooBig) return json({ error: "too_big" }, 413);
    return json({ error: "upload_failed" }, 502);
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

  if (read && kind === "menu") {
    const notMenu = prepared.some((image) => {
      const page = read?.read.pages.find((item) => item.index === image.index);
      return !page || !page.isMenu;
    });
    if (notMenu) {
      await removePaths(service, uploaded);
      return json({ error: "not_a_menu" }, 409);
    }
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
  const pageByIndex = new Map<number, PageRead>();
  for (const page of read?.read.pages ?? []) pageByIndex.set(page.index, page);

  const hours = hoursFromOwner(existing?.hours) ? null : mergeHours([...pageByIndex.values()].map((page) => page.hours));
  const savedHours: BookHours | Record<string, never> | unknown = hours ?? existing?.hours ?? {};
  let theme: BookTheme | unknown = existing?.theme ?? {};
  if ((kind === "storefront" || kind === "logo") && stored[0]) {
    try {
      theme = await paletteFromImage(stored[0].bytes);
    } catch {
      theme = fallbackTheme();
    }
  }

  const now = new Date().toISOString();
  const bookPatch = {
    tagline: read?.read.tagline ?? existing?.tagline ?? null,
    theme,
    hours: savedHours,
    source_language: read?.read.shopLanguage ?? existing?.sourceLanguage ?? null,
    built_by_model: read?.model ?? existing?.builtByModel ?? null,
    updated_at: now,
  };
  const bookWrite = existing
    ? await service.from("shop_books").update(bookPatch).eq("shop_id", shop.id)
    : await service.from("shop_books").insert({ shop_id: shop.id, status: "live", ...bookPatch });
  if (bookWrite.error) {
    await removePaths(service, uploaded);
    return json({ error: "upload_failed" }, 502);
  }

  const menuStart = livePages.filter((page) => page.kind === "menu").length;
  const rows = stored.map((page, offset) => {
    const meta = read?.perPage.get(page.index);
    const extracted = resting || upstream || !read ? {} : extractedOf(pageByIndex.get(page.index) ?? null);
    return {
      id: page.id,
      shop_id: shop.id,
      kind,
      position: kind === "menu" ? menuStart + offset : 0,
      image_path: page.path,
      width: page.width,
      height: page.height,
      status: "live",
      contributed_by: userId,
      batch_id: batchId,
      language: pageByIndex.get(page.index)?.language ?? null,
      extracted,
      ai_meta: {
        model: meta?.model ?? null,
        latency_ms: meta?.latencyMs ?? 0,
        images_in_call: meta?.imagesInCall ?? 0,
        call_id: meta?.callId ?? null,
        faces_blurred: page.facesBlurred,
      },
    };
  });

  const inserted = await service
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
  if (resting) {
    return json(
      { error: "ai_resting", message: AI_RESTING_MESSAGE, pages, missing, ai: aiPayload(null, faceCalls) },
      503,
    );
  }
  if (upstream || !read) {
    return json({ error: "upstream", pages, missing, ai: aiPayload(null, faceCalls) }, 502);
  }
  return json({ pages, missing, hours: savedHours, theme, ai: aiPayload(read, faceCalls) });
}
