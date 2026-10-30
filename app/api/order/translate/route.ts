import { NextResponse } from "next/server";
import { MetaCallError, MetaKeyMissing } from "../../../../lib/ai/meta";
import {
  allowOrderTranslate,
  EmptyTranslation,
  MAX_BATCH_ITEM_CHARS,
  MAX_BATCH_ITEMS,
  translateItems,
  translateNote,
} from "../../../../lib/order/translate";
import { clientIp } from "../../../../lib/rate/window";

export const maxDuration = 30;

function readTexts(value: unknown): string[] | "bad" | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH_ITEMS) return "bad";
  const texts: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return "bad";
    const text = item.trim();
    if (!text || text.length > MAX_BATCH_ITEM_CHARS) return "bad";
    texts.push(text);
  }
  return texts;
}

function failure(error: unknown) {
  if (error instanceof EmptyTranslation) return NextResponse.json({ error: "empty_translation" }, { status: 502 });
  if (error instanceof MetaKeyMissing) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
  const code = error instanceof MetaCallError ? error.code : "upstream";
  const status = code === "auth" ? 401 : code === "busy" ? 429 : 502;
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { text?: unknown; texts?: unknown; to?: unknown }) : {};
  const requested = typeof record.to === "string" ? record.to.trim() : "";
  const to = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/.test(requested) ? requested : "th";
  const texts = readTexts(record.texts);
  if (texts === "bad") return NextResponse.json({ error: "bad_texts" }, { status: 400 });
  if (texts) {
    if (!allowOrderTranslate(clientIp(request))) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    try {
      const translations = await translateItems(texts, to);
      return NextResponse.json({ translations });
    } catch (error) {
      return failure(error);
    }
  }
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "too_long" }, { status: 413 });
  if (!allowOrderTranslate(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    const translation = await translateNote(text, to);
    return NextResponse.json({ translation });
  } catch (error) {
    return failure(error);
  }
}
