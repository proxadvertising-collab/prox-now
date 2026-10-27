export class MetaKeyMissing extends Error {
  readonly code = "ai_not_configured";

  constructor() {
    super("META_API_KEY is not set");
    this.name = "MetaKeyMissing";
  }
}

export type MetaErrorCode = "auth" | "busy" | "upstream" | "timeout";

export class MetaCallError extends Error {
  readonly code: MetaErrorCode;

  constructor(code: MetaErrorCode) {
    super(code);
    this.name = "MetaCallError";
    this.code = code;
  }
}

export class MetaParseError extends Error {
  constructor() {
    super("parse");
    this.name = "MetaParseError";
  }
}

export type SparkResult = {
  raw: unknown;
  usage: unknown;
  ms: number;
};

const META_URL = "https://api.meta.ai/v1/responses";
const TIMEOUT_MS = 25_000;

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
      if (typed.type === "output_text" && typeof typed.text === "string") {
        chunks.push(typed.text);
      }
    }
  }
  return chunks.join("");
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function callSpark(input: {
  prompt: string;
  imageDataUrl: string;
}): Promise<SparkResult> {
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
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: input.prompt },
                { type: "input_image", image_url: input.imageDataUrl },
              ],
            },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new MetaCallError("timeout");
      }
      throw new MetaCallError("upstream");
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const code: MetaErrorCode =
        response.status === 401 || response.status === 403
          ? "auth"
          : response.status === 429
            ? "busy"
            : "upstream";
      throw new MetaCallError(code);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaParseError();
    }

    let raw: unknown;
    try {
      raw = JSON.parse(stripFences(collectOutputText(payload)));
    } catch {
      throw new MetaParseError();
    }

    const usage =
      payload && typeof payload === "object" && "usage" in payload
        ? (payload as { usage: unknown }).usage
        : null;

    return { raw, usage, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
