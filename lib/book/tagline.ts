import { TAGLINE_MAX } from "./limits";

const CLAIM = /\b(best|finest|greatest|tastiest|number one|#1|world[- ]famous)\b/i;

/** Facts only. Drops praise such as "best" and stays within 80 characters. */
export function buildTagline(facts: unknown): string | null {
  if (!Array.isArray(facts)) return null;
  const parts: string[] = [];
  for (const fact of facts) {
    if (typeof fact !== "string") continue;
    const text = fact.trim().replace(/\s+/g, " ");
    if (!text || CLAIM.test(text)) continue;
    parts.push(text);
  }
  if (parts.length === 0) return null;
  let joined = parts.join(" · ");
  if (joined.length <= TAGLINE_MAX) return joined;
  joined = joined.slice(0, TAGLINE_MAX);
  const cut = joined.lastIndexOf(" ");
  if (cut >= 40) joined = joined.slice(0, cut);
  return joined.trim();
}
