/** Muse Spark Open on Fireworks. Fail-open: a miss never drops a menu item. */

export const OPEN_CHECK_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
export const OPEN_CHECK_MODEL = "accounts/fireworks/models/muse-spark-open";
export const OPEN_CHECK_TIMEOUT_MS = 20_000;
export const OPEN_CHECK_MAX_TOKENS = 4000;

export type OpenVerdict = { confirmed: string[]; unconfirmed: string[] };

export type OpenCheckResult = { ran: false } | ({ ran: true } & OpenVerdict);

type CheckInput = {
  images: readonly { dataUrl: string }[];
  items: readonly { name: string }[];
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
  return name.trim().toLowerCase().replace(/\s+/g, " ");
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

function promptFor(items: readonly { name: string }[]): string {
  return [
    "These photos are a shop menu. Another model extracted the item names below.",
    "Reason from the photos, then end with one JSON object and nothing after it:",
    '{"confirmed":["exact name"],"unconfirmed":["exact name"]}',
    "confirmed: names you can see in the photos. unconfirmed: names you cannot confirm.",
    "Use the names exactly. Put each name in one list only.",
    "Items:",
    JSON.stringify(items.map((item) => item.name)),
  ].join("\n");
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
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: promptFor(input.items) },
                ...input.images
                  .filter((image) => image.dataUrl.startsWith("data:"))
                  .map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } })),
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
