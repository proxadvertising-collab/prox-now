/** Muse Spark Open on Fireworks. Fail-open: a miss never drops a menu item. */

import { after } from "next/server";
import sharp from "sharp";

export const OPEN_CHECK_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
export const OPEN_CHECK_MODEL = "accounts/fireworks/models/muse-spark-open";
export const OPEN_CHECK_TIMEOUT_MS = 30_000;
export const OPEN_CHECK_MAX_TOKENS = 1500;
export const OPEN_CHECK_MAX_PHOTOS = 4;
export const OPEN_CHECK_MAX_EDGE = 1024;
export const OPEN_CHECK_MAX_PAGES = 4;

export type OpenVerdict = { confirmed: string[]; unconfirmed: string[] };

export type OpenCheckResult = { ran: false } | ({ ran: true } & OpenVerdict);

type CheckItem = { name: string; price?: string | null };

type CheckInput = {
  images: readonly { dataUrl: string }[];
  items: readonly CheckItem[];
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function warnSkip(reason: string) {
  console.warn("muse-spark-open check skipped: " + reason);
}

function keyOf(input: CheckInput): string | null {
  if (input.apiKey !== undefined) {
    const given = input.apiKey?.trim() ?? "";
    return given || null;
  }
  const fromEnv = process.env.FIREWORKS_API_KEY?.trim() ?? "";
  return fromEnv || null;
}

export function normItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s+—\s+.*$/, "");
}

export function applyMenuFlags<T extends { name: string }>(
  items: readonly T[],
  verdict: OpenVerdict,
): (T & { needsCheck?: boolean })[] {
  const unconfirmed = new Set(verdict.unconfirmed.map(normItemName).filter(Boolean));
  return items.map((item) => {
    const key = normItemName(item.name);
    if (key && unconfirmed.has(key)) return { ...item, needsCheck: true };
    return item;
  });
}

export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") parts.push(part);
    else if (part && typeof part === "object" && "text" in part && typeof part.text === "string") parts.push(part.text);
  }
  return parts.join("\n");
}

function namesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) names.push(item.trim());
    else if (item && typeof item === "object" && "name" in item && typeof item.name === "string" && item.name.trim()) {
      names.push(item.name.trim());
    }
  }
  return names;
}

function verdictOf(value: unknown): OpenVerdict | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if ("confirmed" in record || "unconfirmed" in record) {
    return { confirmed: namesOf(record.confirmed), unconfirmed: namesOf(record.unconfirmed) };
  }
  if (!Array.isArray(record.items)) return null;
  const confirmed: string[] = [];
  const unconfirmed: string[] = [];
  for (const item of record.items) {
    if (!item || typeof item !== "object" || !("name" in item) || typeof item.name !== "string" || !item.name.trim()) continue;
    const name = item.name.trim();
    const flag = "confirmed" in item ? item.confirmed : true;
    if (flag === false || flag === "false") unconfirmed.push(name);
    else confirmed.push(name);
  }
  if (confirmed.length === 0 && unconfirmed.length === 0) return null;
  return { confirmed, unconfirmed };
}

/** The model reasons first. The last JSON object in the text is the verdict. */
export function parseOpenVerdict(text: string): OpenVerdict | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  let found: OpenVerdict | null = null;
  for (let start = 0; start < cleaned.length; start += 1) {
    if (cleaned[start] !== "{") continue;
    const slice = objectAt(cleaned, start);
    if (!slice) continue;
    try {
      const verdict = verdictOf(JSON.parse(slice));
      if (verdict) found = verdict;
    } catch {
      // A later object may still be the verdict.
    }
  }
  return found;
}

function objectAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function openCheckItemText(items: readonly CheckItem[]): string {
  return items.map((item) => item.name).join("\n");
}

function promptFor(items: readonly CheckItem[]): string {
  return [
    "These photos are a shop menu. Another model extracted the items below.",
    "Reason from the photos, then end with one JSON object and nothing after it:",
    '{"confirmed":["exact name"],"unconfirmed":["exact name"]}',
    "confirmed: names you can see in the photos. unconfirmed: names you cannot confirm.",
    "Use the names exactly. Put each name in one list only.",
    "Items:",
    openCheckItemText(items),
  ].join("\n");
}

function photosFor(images: readonly { dataUrl: string }[]): { type: "image_url"; image_url: { url: string } }[] {
  return images
    .filter((image) => image.dataUrl.startsWith("data:"))
    .slice(0, OPEN_CHECK_MAX_PHOTOS)
    .map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }));
}

export async function checkMenuOpen(input: CheckInput): Promise<OpenCheckResult> {
  if (input.items.length === 0) return { ran: false };
  const apiKey = keyOf(input);
  if (!apiKey) {
    warnSkip("no key");
    return { ran: false };
  }
  const timeoutMs = input.timeoutMs ?? OPEN_CHECK_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    let response: Response;
    try {
      response = await fetchImpl(OPEN_CHECK_URL, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPEN_CHECK_MODEL,
          max_tokens: OPEN_CHECK_MAX_TOKENS,
          reasoning_effort: "low",
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptFor(input.items) },
                ...photosFor(input.images),
              ],
            },
          ],
        }),
      });
    } catch {
      warnSkip(controller.signal.aborted ? "timeout" : "network");
      return { ran: false };
    }
    if (!response.ok) {
      warnSkip("http " + response.status);
      return { ran: false };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      warnSkip("bad json");
      return { ran: false };
    }
    const choice = body && typeof body === "object" && "choices" in body && Array.isArray(body.choices) ? body.choices[0] : null;
    const message = choice && typeof choice === "object" && "message" in choice ? choice.message : null;
    const content = message && typeof message === "object" && "content" in message ? message.content : null;
    const verdict = parseOpenVerdict(messageText(content));
    if (!verdict) {
      warnSkip("bad json");
      return { ran: false };
    }
    return { ran: true, confirmed: verdict.confirmed, unconfirmed: verdict.unconfirmed };
  } catch {
    warnSkip("error");
    return { ran: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function downscaleOpenJpeg(bytes: Buffer, maxEdge = OPEN_CHECK_MAX_EDGE): Promise<string> {
  const out = await sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return "data:image/jpeg;base64," + out.toString("base64");
}

export type SavedOpenPage = {
  id: string;
  extracted: unknown;
  aiMeta: Record<string, unknown>;
  /** One photo, when the read only had that page. */
  jpeg?: Buffer;
  /** Every photo from the book read that produced this page's items. */
  jpegs?: readonly Buffer[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function storedItems(extracted: unknown): { name: string; price?: string | null }[] {
  const record = asRecord(extracted);
  if (!record || !Array.isArray(record.items)) return [];
  const items: { name: string; price?: string | null }[] = [];
  for (const item of record.items) {
    const row = asRecord(item);
    if (!row || typeof row.name !== "string" || !row.name.trim()) continue;
    items.push({ name: row.name, price: typeof row.price === "string" ? row.price : null });
  }
  return items;
}

type OpenSave = (row: { id: string; extracted: unknown; aiMeta: Record<string, unknown> }) => Promise<void>;

function readJpegs(page: SavedOpenPage): readonly Buffer[] {
  const many = page.jpegs?.filter((jpeg) => jpeg.length > 0) ?? [];
  const buffers = many.length > 0 ? many : page.jpeg ? [page.jpeg] : [];
  return buffers.slice(0, OPEN_CHECK_MAX_PHOTOS);
}

/** One page's items, against every photo from that read. A miss leaves that page alone. */
async function checkSavedPage(
  page: SavedOpenPage,
  check: typeof checkMenuOpen,
  downscale: (jpeg: Buffer) => Promise<string>,
  save: OpenSave,
): Promise<void> {
  const items = storedItems(page.extracted);
  if (items.length === 0) return;
  const images: { dataUrl: string }[] = [];
  for (const jpeg of readJpegs(page)) {
    try {
      images.push({ dataUrl: await downscale(jpeg) });
    } catch {
      // A bad photo is skipped. The names are still checked.
    }
  }
  const result = await check({ images, items, timeoutMs: OPEN_CHECK_TIMEOUT_MS });
  if (!result.ran) return;
  const record = asRecord(page.extracted);
  if (!record || !Array.isArray(record.items)) return;
  const flagged = applyMenuFlags(
    record.items.filter((item): item is { name: string } => Boolean(asRecord(item) && typeof asRecord(item)?.name === "string")),
    result,
  );
  const byName = new Map(flagged.map((item) => [normItemName(item.name), item.needsCheck === true]));
  const itemsNext = record.items.map((item) => {
    const row = asRecord(item);
    if (!row || typeof row.name !== "string") return item;
    if (!byName.get(normItemName(row.name))) return item;
    return { ...row, needsCheck: true };
  });
  await save({
    id: page.id,
    extracted: { ...record, items: itemsNext },
    aiMeta: { ...page.aiMeta, open_check: true },
  });
}

/**
 * Writes the verdict into shop_book_pages.extracted (needsCheck on items)
 * and shop_book_pages.ai_meta (open_check). Both columns already exist.
 * Each page is checked against the photos from its book read. A miss leaves that page alone.
 */
export async function finishOpenCheck(input: {
  pages: readonly SavedOpenPage[];
  check?: typeof checkMenuOpen;
  downscale?: (jpeg: Buffer) => Promise<string>;
  save: OpenSave;
}): Promise<void> {
  const pages = input.pages
    .filter((page) => storedItems(page.extracted).length > 0)
    .slice(0, OPEN_CHECK_MAX_PAGES);
  if (pages.length === 0) return;
  const check = input.check ?? checkMenuOpen;
  const downscale = input.downscale ?? downscaleOpenJpeg;
  await Promise.all(
    pages.map(async (page) => {
      try {
        await checkSavedPage(page, check, downscale, input.save);
      } catch {
        warnSkip("error");
      }
    }),
  );
}

/** Runs after the response. Outside a request (tests) it does nothing and the saved book stands. */
export function scheduleOpenCheck(
  task: () => Promise<void>,
  afterImpl: (task: () => Promise<void>) => void = after,
): void {
  try {
    afterImpl(async () => {
      try {
        await task();
      } catch {
        warnSkip("error");
      }
    });
  } catch {
    // after() throws outside a request. The book is already saved.
  }
}
