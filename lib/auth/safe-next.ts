/** Allow only same-origin paths. Anything else is an open redirect. */
export function safeNext(value: string | null | undefined, fallback = "/map"): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("\\") || value.includes("://")) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return fallback;
  return value;
}
