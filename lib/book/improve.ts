import { callSparkImages } from "../ai/meta";
import { MAX_MENU_PAGES } from "./limits";
import type { PageRead } from "./schema";
import { improvePrompt } from "./prompt";

export type ImproveAction = "skip" | "replace" | "add";

export type ImproveDecision = {
  action: ImproveAction;
  pageId: string | null;
};

export type ShotPlan = ImproveDecision & { index: number };

export type ExistingPage = { id: string; extracted: unknown };

const SINGLE = new Set(["storefront", "logo", "hours", "qr"]);

/** A replace the caller cannot make. One-of-a-kind pages stay. Menu pages are added until the book is full. */
export function blockedReplaceAction(kind: string, room: number): "add" | "skip" {
  if (SINGLE.has(kind) || room <= 0) return "skip";
  return "add";
}

/**
 * After the reader assigns kinds. A live storefront, logo, hours, or qr page is
 * replaced when the caller may replace it, and skipped otherwise. A second photo
 * of that same kind in this batch is skipped. A compare that already skipped stays
 * skipped. Menu and other pages are added until that kind is full.
 */
export function settleBatch(input: {
  shots: readonly { index: number; kind: string; plan: ImproveDecision }[];
  live: readonly { id: string; kind: string }[];
  canReplace: boolean;
}): ShotPlan[] {
  const liveSingle = new Map<string, string>();
  for (const page of input.live) {
    if (SINGLE.has(page.kind) && !liveSingle.has(page.kind)) liveSingle.set(page.kind, page.id);
  }
  const taken = new Set<string>();
  const added = new Map<string, number>();
  const liveOf = (kind: string) => input.live.filter((page) => page.kind === kind).length;
  return input.shots.map((shot) => {
    if (shot.plan.action === "skip") return { index: shot.index, action: "skip", pageId: shot.plan.pageId };
    if (SINGLE.has(shot.kind)) {
      if (taken.has(shot.kind)) return { index: shot.index, action: "skip", pageId: null };
      taken.add(shot.kind);
      const pageId = liveSingle.get(shot.kind) ?? null;
      if (pageId) {
        if (input.canReplace) return { index: shot.index, action: "replace", pageId };
        return { index: shot.index, action: "skip", pageId: null };
      }
      return { index: shot.index, action: "add", pageId: null };
    }
    if (shot.plan.action === "replace" && input.canReplace && shot.plan.pageId) {
      return { index: shot.index, action: "replace", pageId: shot.plan.pageId };
    }
    const bucket = shot.kind === "menu" ? "menu" : "extra";
    const used = liveOf(bucket) + (added.get(bucket) ?? 0);
    if (used >= MAX_MENU_PAGES) return { index: shot.index, action: "skip", pageId: null };
    added.set(bucket, (added.get(bucket) ?? 0) + 1);
    return { index: shot.index, action: "add", pageId: null };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function pageFacts(page: PageRead | null): unknown {
  if (!page) return { section: null, items: [], hours: null };
  return { section: page.section, items: page.items, hours: page.hours };
}

function sameInfo(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

export function parseImproveDecision(value: unknown, existingIds: readonly string[]): ImproveDecision | null {
  const root = asRecord(value);
  if (!root) return null;
  const action = root.action;
  if (action !== "skip" && action !== "replace" && action !== "add") return null;
  const pageId = typeof root.pageId === "string" && existingIds.includes(root.pageId) ? root.pageId : null;
  if (action === "replace") {
    if (!pageId) return null;
    return { action, pageId };
  }
  if (action === "skip") return { action, pageId };
  return { action: "add", pageId: null };
}

/** Same extracted info is a duplicate. A single page that changed is replaced. Anything else is added. */
export function fallbackDecision(kind: string, facts: unknown, existing: readonly ExistingPage[]): ImproveDecision {
  const match = existing.find((page) => sameInfo(page.extracted, facts));
  if (match) return { action: "skip", pageId: match.id };
  if (SINGLE.has(kind) && existing[0]) return { action: "replace", pageId: existing[0].id };
  return { action: "add", pageId: null };
}

function noun(kind: string, count: number): string {
  if (kind === "menu") return count === 1 ? "menu item" : "menu items";
  if (kind === "extra") return count === 1 ? "extra" : "extras";
  if (kind === "hours") return "hours";
  if (kind === "logo") return count === 1 ? "logo" : "logos";
  return count === 1 ? kind : kind + "s";
}

const KIND_ORDER = ["logo", "hours", "menu", "extra", "storefront"];

function kindRank(kind: string): number {
  const rank = KIND_ORDER.indexOf(kind);
  return rank === -1 ? KIND_ORDER.length : rank;
}

export function improveSummary(events: readonly { kind: string; action: ImproveAction }[]): string {
  const replaced = new Map<string, number>();
  const added = new Map<string, number>();
  let skipped = 0;
  for (const event of events) {
    if (event.action === "skip") skipped += 1;
    else if (event.action === "replace") replaced.set(event.kind, (replaced.get(event.kind) ?? 0) + 1);
    else added.set(event.kind, (added.get(event.kind) ?? 0) + 1);
  }
  const parts: string[] = [];
  const kinds = [...new Set([...replaced.keys(), ...added.keys()])].sort((a, b) => kindRank(a) - kindRank(b));
  for (const kind of kinds) {
    const updates = replaced.get(kind) ?? 0;
    if (updates === 1 && (kind === "hours" || kind === "logo")) parts.push("Updated " + kind);
    else if (updates > 0) parts.push("Updated " + updates + " " + noun(kind, updates));
  }
  for (const kind of kinds) {
    const count = added.get(kind) ?? 0;
    if (count > 0) parts.push("added " + count + " " + noun(kind, count));
  }
  if (skipped === 1) parts.push("1 skipped as duplicate");
  else if (skipped > 1) parts.push(skipped + " skipped as duplicate");
  if (parts.length === 0) return "Nothing new to save";
  const text = parts.join(", ");
  return text.startsWith("added") ? "Added" + text.slice("added".length) : text;
}

export async function readImprove(input: {
  kind: string;
  facts: unknown;
  existing: readonly ExistingPage[];
  image: { dataUrl: string };
  call?: typeof callSparkImages;
}): Promise<ImproveDecision> {
  const fallback = fallbackDecision(input.kind, input.facts, input.existing);
  try {
    const result = await (input.call ?? callSparkImages)({
      prompt: improvePrompt(input.kind, input.existing) + "\nNew page:\n" + JSON.stringify(input.facts ?? {}),
      images: [{ label: "Image 1:", imageDataUrl: input.image.dataUrl }],
      maxOutputTokens: 200,
    });
    const raw =
      typeof result.raw === "string" ? result.raw.trim().replace(/^```json\s*/i, "").replace(/```$/, "") : result.raw;
    const parsed = parseImproveDecision(typeof raw === "string" ? JSON.parse(raw) : raw, input.existing.map((page) => page.id));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
