function isFaceGeometry(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (item) => Array.isArray(item) && item.length === 4 && item.every((part) => typeof part === "number"),
  );
}

export function factsWithConsent(facts: unknown, shown: number): Record<string, unknown> {
  const count = Math.max(0, Math.min(2, Math.trunc(Number(shown)) || 0));
  const source =
    facts && typeof facts === "object" && !Array.isArray(facts) ? (facts as Record<string, unknown>) : {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "faces" || key === "boxes" || key === "showFaces" || key === "show_faces") continue;
    if (isFaceGeometry(value)) continue;
    clean[key] = value;
  }
  clean.consent_shown = count;
  return clean;
}
