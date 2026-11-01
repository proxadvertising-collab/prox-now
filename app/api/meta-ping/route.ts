import { connection } from "next/server";
import { clientIp, take } from "../../../lib/rate/window";
import { createClient } from "../../../lib/supabase/server";

const PING_IP_LIMIT = 10;
const pingHits = new Map<string, { start: number; count: number }>();

export function resetMetaPingHits(): void {
  pingHits.clear();
}

const META_URL = "https://api.meta.ai/v1/responses";
const META_MODEL = "muse-spark-1.3";

type MetaContentBlock = { text?: unknown };
type MetaOutputItem = { content?: MetaContentBlock[] };
type MetaPayload = {
  model?: unknown;
  output_text?: unknown;
  text?: unknown;
  output?: MetaOutputItem[];
  error?: { message?: unknown };
};

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function extractText(payload: MetaPayload): string {
  const direct = asString(payload.output_text) ?? asString(payload.text);
  if (direct) return direct;

  if (!Array.isArray(payload.output)) {
    return asString(payload.error?.message) ?? "";
  }

  const chunks: string[] = [];
  for (const item of payload.output) {
    if (!item || !Array.isArray(item.content)) continue;
    for (const block of item.content) {
      const text = block ? asString(block.text) : null;
      if (text) chunks.push(text);
    }
  }

  if (chunks.length > 0) return chunks.join("");
  return asString(payload.error?.message) ?? "";
}

function withoutSecret(text: string, secret: string): string {
  return text.split(secret).join("");
}

async function demoOwnerSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return false;
    const account = await supabase.from("demo_accounts").select("role").limit(1);
    const row = Array.isArray(account.data) ? account.data[0] : null;
    return Boolean(row && typeof row === "object" && "role" in row && row.role === "owner");
  } catch {
    return false;
  }
}

export async function GET(request: Request = new Request("http://localhost/api/meta-ping")) {
  await connection();
  if (process.env.NODE_ENV !== "development" && !(await demoOwnerSession())) {
    return new Response(null, { status: 404 });
  }
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) {
    return Response.json(
      { ok: false, error: "META_API_KEY not set" },
      { status: 503 },
    );
  }
  if (!take(pingHits, [{ key: "ip:" + clientIp(request), limit: PING_IP_LIMIT }], Date.now())) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(META_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: META_MODEL,
        input: "Reply with the single word OK",
        reasoning: { effort: "low" },
        max_output_tokens: 200,
      }),
    });
  } catch {
    return Response.json(
      {
        ok: false,
        model: META_MODEL,
        text: "Meta API request failed",
        ms: Date.now() - started,
      },
      { status: 502 },
    );
  }

  const ms = Date.now() - started;
  let payload: MetaPayload = {};
  try {
    payload = (await response.json()) as MetaPayload;
  } catch {
    payload = {};
  }

  const model = withoutSecret(asString(payload.model) ?? META_MODEL, apiKey);
  const text = withoutSecret(extractText(payload), apiKey);

  if (!response.ok) {
    return Response.json(
      { ok: false, model, text: text || "Meta API request failed", ms },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, model, text, ms });
}
