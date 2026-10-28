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
  readonly model: string | null;
  readonly ms: number;

  constructor(model: string | null, ms: number) {
    super("parse");
    this.name = "MetaParseError";
    this.model = model;
    this.ms = ms;
  }
}

export type SparkResult = {
  raw: unknown;
  usage: unknown;
  ms: number;
  model: string | null;
};

const META_URL = "https://api.meta.ai/v1/responses";
const TIMEOUT_MS = 25_000;

async function metaFailureCode(response: Response): Promise<MetaErrorCode> {
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel().catch(() => undefined);
    return "auth";
  }
  if (response.status === 429 || response.status === 402) {
    await response.body?.cancel().catch(() => undefined);
    return "busy";
  }
  const text = await response.text().catch(() => "");
  const lower = text.slice(0, 500).toLowerCase();
  if (
    lower.includes("credit") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit")
  ) {
    return "busy";
  }
  return "upstream";
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
      if (typed.type === "output_text" && typeof typed.text === "string") {
        chunks.push(typed.text);
      }
    }
  }
  return chunks.join("");
}

export function readModel(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const model = (payload as { model?: unknown }).model;
  if (typeof model !== "string") return null;
  const trimmed = model.trim();
  if (!trimmed || trimmed.length > 80) return null;
  return trimmed;
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
      throw new MetaCallError(await metaFailureCode(response));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaParseError(null, Date.now() - started);
    }

    const model = readModel(payload);
    let raw: unknown;
    try {
      raw = JSON.parse(stripFences(collectOutputText(payload)));
    } catch {
      throw new MetaParseError(model, Date.now() - started);
    }

    const usage =
      payload && typeof payload === "object" && "usage" in payload
        ? (payload as { usage: unknown }).usage
        : null;

    return { raw, usage, ms: Date.now() - started, model };
  } finally {
    clearTimeout(timer);
  }
}

export class MetaTruncated extends Error {
  readonly model: string | null;
  readonly ms: number;

  constructor(model: string | null, ms: number) {
    super("max_output_tokens");
    this.name = "MetaTruncated";
    this.model = model;
    this.ms = ms;
  }
}

export type SparkImagePart = {
  label: string;
  imageDataUrl: string;
};

export type SparkImagesResult = SparkResult & {
  callId: string | null;
};

const BOOK_TIMEOUT_MS = 45_000;

export function outputTokenBudget(imageCount: number): number {
  const count = Math.max(1, Math.floor(imageCount));
  return Math.min(4000, 200 * count + 300);
}

export function sparkImagesBody(input: {
  prompt: string;
  images: readonly SparkImagePart[];
  maxOutputTokens: number;
}): {
  model: string;
  reasoning: { effort: "low" };
  max_output_tokens: number;
  store: false;
  input: { role: "user"; content: { type: string; text?: string; image_url?: string }[] }[];
} {
  const content: { type: string; text?: string; image_url?: string }[] = [
    { type: "input_text", text: input.prompt },
  ];
  for (const image of input.images) {
    content.push({ type: "input_text", text: image.label });
    content.push({ type: "input_image", image_url: image.imageDataUrl });
  }
  return {
    model: "muse-spark-1.3",
    reasoning: { effort: "low" },
    max_output_tokens: input.maxOutputTokens,
    store: false,
    input: [{ role: "user", content }],
  };
}

function readCallId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const id = (payload as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 80) return null;
  return trimmed;
}

function incompleteReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const details = (payload as { incomplete_details?: unknown }).incomplete_details;
  if (!details || typeof details !== "object") return null;
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

/** Several JPEG pages in one Meta request. The caller decides the chunk size. */
export async function callSparkImages(input: {
  prompt: string;
  images: readonly SparkImagePart[];
  maxOutputTokens?: number;
}): Promise<SparkImagesResult> {
  const apiKey = process.env.META_API_KEY;
  if (!apiKey) throw new MetaKeyMissing();
  if (input.images.length < 1) throw new MetaCallError("upstream");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOOK_TIMEOUT_MS);
  const started = Date.now();
  const maxOutputTokens = input.maxOutputTokens ?? outputTokenBudget(input.images.length);

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
        body: JSON.stringify(
          sparkImagesBody({
            prompt: input.prompt,
            images: input.images,
            maxOutputTokens,
          }),
        ),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new MetaCallError("timeout");
      }
      throw new MetaCallError("upstream");
    }

    if (!response.ok) {
      throw new MetaCallError(await metaFailureCode(response));
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaParseError(null, Date.now() - started);
    }

    const model = readModel(payload);
    const ms = Date.now() - started;
    if (incompleteReason(payload) === "max_output_tokens") {
      throw new MetaTruncated(model, ms);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(stripFences(collectOutputText(payload)));
    } catch {
      throw new MetaParseError(model, ms);
    }

    const usage =
      payload && typeof payload === "object" && "usage" in payload
        ? (payload as { usage: unknown }).usage
        : null;

    return { raw, usage, ms, model, callId: readCallId(payload) };
  } finally {
    clearTimeout(timer);
  }
}
