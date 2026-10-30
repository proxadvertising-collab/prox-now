import { NextResponse } from "next/server";
import { MetaCallError, MetaKeyMissing } from "../../../../lib/ai/meta";
import { allowOrderTranslate, EmptyTranslation, translateNote } from "../../../../lib/order/translate";
import { clientIp } from "../../../../lib/rate/window";

export const maxDuration = 30;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { text?: unknown; to?: unknown }) : {};
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (text.length > 500) return NextResponse.json({ error: "too_long" }, { status: 413 });
  const requested = typeof record.to === "string" ? record.to.trim() : "";
  const to = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})?$/.test(requested) ? requested : "th";
  if (!allowOrderTranslate(clientIp(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    const translation = await translateNote(text, to);
    return NextResponse.json({ translation });
  } catch (error) {
    if (error instanceof EmptyTranslation) return NextResponse.json({ error: "empty_translation" }, { status: 502 });
    if (error instanceof MetaKeyMissing) return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
    const code = error instanceof MetaCallError ? error.code : "upstream";
    const status = code === "auth" ? 401 : code === "busy" ? 429 : 502;
    return NextResponse.json({ error: code }, { status });
  }
}
