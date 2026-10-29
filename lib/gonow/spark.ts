import {
  MetaCallError,
  MetaKeyMissing,
  MetaParseError,
  MetaTruncated,
  readModel,
} from "../ai/meta";

const META_URL = "https://api.meta.ai/v1/responses";
const TIMEOUT_MS = 25_000;

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced?.[1] ? fenced[1].trim() : trimmed;
}

function collectOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const typed = block as { type?: unknown; text?: unknown };
      if (typed.type === "output_text" && typeof typed.text === "string") chunks.push(typed.text);
    }
  }
  return chunks.join("");
}

function incompleteReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const details = (payload as { incomplete_details?: unknown }).incomplete_details;
  if (!details || typeof details !== "object") return null;
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

async function failureCode(response: Response): Promise<"auth" | "busy" | "upstream" | "timeout"> {
  if (response.status === 401 || response.status === 403) return "auth";
  if (response.status === 429 || response.status === 402) return "busy";
  const text = await response.text().catch(() => "");
  const lower = text.slice(0, 500).toLowerCase();
  if (lower.includes("credit") || lower.includes("quota") || lower.includes("rate limit") || lower.includes("rate_limit")) {
    return "busy";
  }
  return "upstream";
}

/** Text-only Muse Spark call. Same endpoint, model, and error classes as the analyze client. */
export async function callGoNowText(prompt: string): Promise<unknown> {
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) throw new MetaKeyMissing();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    let response: Response;
    try {
      response = await fetch(META_URL, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "muse-spark-1.3",
          reasoning: { effort: "minimal" },
          max_output_tokens: 2500,
          store: false,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new MetaCallError("timeout");
      throw new MetaCallError("upstream");
    }

    if (!response.ok) throw new MetaCallError(await failureCode(response));

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaParseError(null, Date.now() - started);
    }

    const model = readModel(payload);
    const ms = Date.now() - started;
    if (incompleteReason(payload) === "max_output_tokens") throw new MetaTruncated(model, ms);

    try {
      return JSON.parse(stripFences(collectOutputText(payload)));
    } catch {
      throw new MetaParseError(model, ms);
    }
  } finally {
    clearTimeout(timer);
  }
}
