import { MetaCallError, MetaKeyMissing, MetaTruncated, readModel } from "../ai/meta";
import { SNAP_IP_LIMIT, take } from "../rate/window";

const META_URL = "https://api.meta.ai/v1/responses";
const hits = new Map<string, { start: number; count: number }>();

export function resetOrderTranslate(): void {
  hits.clear();
}

export function allowOrderTranslate(ip: string, now = Date.now()): boolean {
  return take(hits, [{ key: "ip:" + ip, limit: SNAP_IP_LIMIT }], now);
}

const LANGUAGE_NAMES: Record<string, string> = {
  th: "Thai",
  en: "English",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  vi: "Vietnamese",
  lo: "Lao",
  km: "Khmer",
  my: "Burmese",
  ms: "Malay",
  id: "Indonesian",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  ru: "Russian",
  hi: "Hindi",
  ar: "Arabic",
};

export class EmptyTranslation extends Error {
  readonly code = "empty_translation";
  constructor() {
    super("empty_translation");
    this.name = "EmptyTranslation";
  }
}

export function languageName(code: string): string {
  const primary = code.trim().toLowerCase().split("-")[0] ?? "";
  return LANGUAGE_NAMES[primary] ?? (code.trim() || "Thai");
}

export function translateRequestBody(text: string, to: string) {
  const prompt =
    "Translate this restaurant order note into " +
    languageName(to) +
    ". Return only the translated text. Do not repeat the original, add a label, or explain.\n\n" +
    text;
  return {
    model: "muse-spark-1.3",
    reasoning: { effort: "low" as const },
    max_output_tokens: 1500,
    store: false,
    input: [{ role: "user" as const, content: [{ type: "input_text" as const, text: prompt }] }],
  };
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
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

function truncated(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const details = (payload as { incomplete_details?: { reason?: unknown } }).incomplete_details;
  return details?.reason === "max_output_tokens";
}

export async function translateNote(text: string, to: string): Promise<string> {
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) throw new MetaKeyMissing();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
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
        body: JSON.stringify(translateRequestBody(text, to)),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new MetaCallError("timeout");
      throw new MetaCallError("upstream");
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new MetaCallError("auth");
      if (response.status === 429 || response.status === 402) throw new MetaCallError("busy");
      throw new MetaCallError("upstream");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaCallError("upstream");
    }
    if (truncated(payload)) throw new MetaTruncated(readModel(payload), 0);
    const translation = stripFences(collectOutputText(payload));
    if (!translation) throw new EmptyTranslation();
    return translation;
  } finally {
    clearTimeout(timer);
  }
}
