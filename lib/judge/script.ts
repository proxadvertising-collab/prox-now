export const TOUR_KEY = "prox-judge-tour";
export const SEEN_KEY = "prox-explain-seen";
export const BOOK_PROGRESS = "Building your book, about a minute";

export type CafeId = "a" | "b";
export type TourRole = "shopper" | "owner";
export type StepId = "seed" | "book" | "ask" | "translate" | "order" | "post" | "claim" | "coupon";

export type Tour = { cafe: CafeId; role: TourRole; step: StepId };

export const DEMO_CAFES: Record<CafeId, { slug: string; name: string; photos: readonly string[] }> = {
  a: {
    slug: "mala-mafia",
    name: "Mala Mafia",
    photos: ["/demo/mala-mafia-menu-1.svg", "/demo/mala-mafia-menu-2.svg", "/demo/mala-mafia-menu-3.svg"],
  },
  b: {
    slug: "coconut-shake-stand",
    name: "Coconut shake stand",
    photos: ["/judge/cafe-b/menu-1.svg", "/judge/cafe-b/menu-2.svg", "/judge/cafe-b/menu-3.svg"],
  },
};

export type Explainer = { id: StepId; n: number; title: string; body: string };

/** Edit these sentences. Judges see one card on every step. */
export const EXPLAINERS: readonly Explainer[] = [
  { id: "seed", n: 1, title: "Seed", body: "These photos become the shop's menu. A judge can use the sample set, so the demo does not need a camera." },
  { id: "book", n: 2, title: "Book", body: "Prox Now is reading the photos into a book the shopper can swipe. That book is what the rest of the visit uses." },
  { id: "ask", n: 3, title: "Ask", body: "The shopper asks what is good right now. The map answers from shops that are open, instead of a static list." },
  { id: "translate", n: 4, title: "Translate", body: "The order is translated for the counter. Staff see the note in the shop's language, not the shopper's." },
  { id: "order", n: 5, title: "Order", body: "Items are on one order. Show to staff is the screen the counter reads, with quantities and the translated note." },
  { id: "post", n: 6, title: "Post", body: "A snap puts the shop on the live map. On a demo shop the owner can Keep it now, without waiting out the two-hour life." },
  { id: "claim", n: 7, title: "Claim", body: "The owner claims the demo café without a paper code. A real shop still needs the code and a matching photo." },
  { id: "coupon", n: 8, title: "Coupon", body: "Keep sends a coupon to the shopper who posted. They scratch it in the wallet, and the owner can redeem it at the till." },
];

const STEP_IDS = new Set<string>(EXPLAINERS.map((step) => step.id));

export function explainer(id: StepId): Explainer {
  const found = EXPLAINERS.find((step) => step.id === id);
  return found ?? EXPLAINERS[0];
}

export function tourHref(role: TourRole): string {
  return role === "shopper" ? "/snap?tour=1" : "/owner?tour=1";
}

export function swapTour(tour: Tour): { cafe: CafeId; role: TourRole; enter: "explorer" | "owner"; step: StepId } {
  const cafe: CafeId = tour.cafe === "a" ? "b" : "a";
  const role: TourRole = tour.role === "shopper" ? "owner" : "shopper";
  return { cafe, role, enter: role === "shopper" ? "explorer" : "owner", step: role === "shopper" ? "seed" : "claim" };
}

export function pathStep(pathname: string): StepId | null {
  if (pathname.startsWith("/wallet")) return "coupon";
  if (pathname.startsWith("/owner")) return "claim";
  if (pathname.startsWith("/map")) return "ask";
  if (pathname.includes("/order")) return "order";
  if (pathname.startsWith("/book")) return "book";
  if (pathname.startsWith("/snap")) return "seed";
  return null;
}

/** Judges always see the card. Everyone else sees each step once. */
export function showExplainer(input: { judge: boolean; step: StepId; seen: readonly string[] }): boolean {
  if (input.judge) return true;
  return !input.seen.includes(input.step);
}

export function rememberSeen(seen: readonly string[], step: StepId): string[] {
  if (seen.includes(step)) return [...seen];
  return [...seen, step];
}

export function readTour(): Tour | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOUR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Tour>;
    if (parsed.cafe !== "a" && parsed.cafe !== "b") return null;
    if (parsed.role !== "shopper" && parsed.role !== "owner") return null;
    if (!parsed.step || !STEP_IDS.has(parsed.step)) return null;
    return { cafe: parsed.cafe, role: parsed.role, step: parsed.step };
  } catch {
    return null;
  }
}

export function startJudgeTour(tour: Tour): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOUR_KEY, JSON.stringify(tour));
}

export function readSeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeSeen(seen: readonly string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}
