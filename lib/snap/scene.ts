import type { MatcherResult } from "../ai/matcher";

export type SceneStep = { step: string; ms: number };

export type SceneReport = {
  model: string | null;
  shopId: string | null;
  shopName: string | null;
  confidence: number;
  facesFound: number;
  facesBlurred: number | null;
  signs: { original: string; translated: string }[];
  languages: { source: string; target: string } | null;
  steps: SceneStep[];
};

function textKey(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return key;
  }
  return null;
}

export function signKeyPair(raw: unknown): { source: string; target: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { sign_text?: unknown; signText?: unknown };
  const list = record.sign_text ?? record.signText;
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const source = textKey(row, ["thai", "original"]);
    const target = textKey(row, ["english", "translated"]);
    if (source && target) return { source, target };
  }
  return null;
}

function cleanModel(model: string | null): string | null {
  if (typeof model !== "string") return null;
  const trimmed = model.trim();
  if (!trimmed || trimmed.length > 80) return null;
  return trimmed;
}

function finiteSteps(steps: readonly SceneStep[]): SceneStep[] {
  return steps.filter((step) => typeof step.step === "string" && step.step.length > 0 && Number.isFinite(step.ms) && step.ms >= 0);
}

export function buildScene(input: {
  model: string | null;
  result: MatcherResult;
  raw: unknown;
  shopName: string | null;
  steps: readonly SceneStep[];
  facesBlurred?: number | null;
}): SceneReport {
  const signLanguage = input.result.facts?.signLanguage ?? null;
  const pair = signKeyPair(input.raw);
  const captions = input.result.facts?.captions ?? null;
  let target = pair?.target ?? null;
  if (captions) {
    const written = (["en", "th"] as const).filter((tag) => captions[tag] && tag !== signLanguage);
    if (written.length === 1) target = written[0];
  }
  const source = signLanguage ?? pair?.source ?? null;
  const languages = source && target && source !== target ? { source, target } : null;
  const blurred = typeof input.facesBlurred === "number" && Number.isFinite(input.facesBlurred) ? input.facesBlurred : null;
  return {
    model: cleanModel(input.model),
    shopId: input.result.shopId,
    shopName: input.shopName,
    confidence: input.result.confidence,
    facesFound: input.result.faces.length,
    facesBlurred: blurred,
    signs: input.result.signText.map((line) => ({ original: line.original, translated: line.translated })),
    languages,
    steps: finiteSteps(input.steps),
  };
}

export function analyzeFailure(
  status: number,
  error: string | undefined,
): "offline" | "resting" | "rate" | "net" | null {
  if (status === 503 && error === "ai_not_configured") return "offline";
  if (error === "ai_resting" || error === "busy") return "resting";
  if (status === 429 || error === "rate_limited") return "rate";
  if (status >= 400) return "net";
  return null;
}

export function prependSteps(scene: SceneReport, steps: readonly SceneStep[]): SceneReport {
  return { ...scene, steps: [...finiteSteps(steps), ...scene.steps] };
}
