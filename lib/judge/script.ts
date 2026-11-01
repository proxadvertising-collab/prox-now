export const TOUR_KEY = "prox-judge-tour";
export const SEEN_KEY = "prox-explain-seen";
export const BOOK_PROGRESS = "Building your book, about a minute";

export type CafeId = "a" | "b";
export type TourRole = "shopper" | "owner";
export type StepId = "seed" | "book" | "ask" | "translate" | "order" | "post" | "claim" | "thanks" | "coupon";

export type Tour = { cafe: CafeId; role: TourRole; step: StepId };

export const DEMO_CAFES: Record<CafeId, { slug: string; name: string; photos: readonly string[] }> = {
  a: {
    slug: "mala-mafia",
    name: "Farm to Go (demo)",
    photos: ["/judge/cafe-a/1-storefront.jpg", "/judge/cafe-a/2-drinks.jpg", "/judge/cafe-a/3-brunch.jpg"],
  },
  b: {
    slug: "coconut-shake-stand",
    name: "Coconut shake stand",
    photos: ["/judge/cafe-b/menu-1.jpg", "/judge/cafe-b/menu-2.jpg", "/judge/cafe-b/menu-3.jpg"],
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
  { id: "thanks", n: 8, title: "Thank them", body: "Judge 1 built your book, so you can thank them with a coupon." },
  { id: "coupon", n: 9, title: "Coupon", body: "Keep sends a coupon to the shopper who posted. They scratch it in the wallet, and the owner can redeem it at the till." },
];

const STEP_IDS = new Set<string>(EXPLAINERS.map((step) => step.id));

const DEMO_SHOP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Judge tour writes the existing demo café in improve mode. No shop match. */
export function judgeSampleSave(tour: Tour | null): { shop: string; mode: "improve" } | null {
  if (!tour) return null;
  return { shop: DEMO_CAFES[tour.cafe].slug, mode: "improve" };
}

/** Real id for an is_demo shop. A slug is not an id, so the book link can be built. */
export function demoShopTarget(
  slug: string,
  row: { id?: unknown; slug?: unknown; name?: unknown } | null,
): { id: string; slug: string; name: string } | null {
  if (!row || typeof row.id !== "string" || !DEMO_SHOP_ID.test(row.id) || row.slug !== slug) return null;
  const cafe = Object.values(DEMO_CAFES).find((item) => item.slug === slug);
  const name = typeof row.name === "string" && row.name.trim() ? row.name : (cafe?.name ?? slug);
  return { id: row.id, slug, name };
}

export function explainer(id: StepId): Explainer {
  const found = EXPLAINERS.find((step) => step.id === id);
  return found ?? EXPLAINERS[0];
}

export function tourHref(role: TourRole): string {
  return role === "shopper" ? "/snap?tour=1&samples=1" : "/owner?tour=1";
}

const STEP_ORDER: readonly StepId[] = EXPLAINERS.map((step) => step.id);

/** Jump forward to a later step. Never move backward. */
export function advanceStep(current: StepId, candidate: StepId): StepId {
  const at = STEP_ORDER.indexOf(current);
  const want = STEP_ORDER.indexOf(candidate);
  if (want > at) return candidate;
  return current;
}

export function swapTour(tour: Tour): { cafe: CafeId; role: TourRole; enter: "explorer" | "owner"; step: StepId } {
  const cafe: CafeId = tour.cafe === "a" ? "b" : "a";
  const role: TourRole = tour.role === "shopper" ? "owner" : "shopper";
  return { cafe, role, enter: role === "shopper" ? "explorer" : "owner", step: role === "shopper" ? "seed" : "claim" };
}

/** A shopper swap after thanks opens the wallet. Earlier steps reseed the camera. */
export function swapShopperHref(step: StepId): "/snap?tour=1&samples=1" | "/wallet" {
  const at = STEP_ORDER.indexOf(step);
  const thanks = STEP_ORDER.indexOf("thanks");
  return at >= thanks ? "/wallet" : "/snap?tour=1&samples=1";
}

export function pathStep(pathname: string): StepId | null {
  const [path, query = ""] = pathname.split("?");
  const params = new URLSearchParams(query);
  if (path.startsWith("/wallet")) return "coupon";
  if (path.startsWith("/owner")) return params.has("thanks") ? "thanks" : "claim";
  if (params.has("post")) return "post";
  if (path.includes("/order")) return params.get("staff") === "1" ? "order" : "translate";
  if (path.startsWith("/map")) return "ask";
  if (path.startsWith("/book")) return "book";
  if (path.startsWith("/snap")) return "seed";
  return null;
}

/** Explainers are judge mode only. A normal visit never gets a card. */
export function showExplainer(input: { judge: boolean; step: StepId; seen: readonly string[] }): boolean {
  return input.judge;
}

export function rememberSeen(seen: readonly string[], step: StepId): string[] {
  if (seen.includes(step)) return [...seen];
  return [...seen, step];
}

/** Judge 2 reached a book-thanks card. Move the tour forward once. */
export function noteBookThanks(): void {
  if (typeof window === "undefined") return;
  const tour = readTour();
  if (!tour) return;
  const step = advanceStep(tour.step, "thanks");
  if (step === tour.step) return;
  startJudgeTour({ ...tour, step });
  window.dispatchEvent(new Event("prox-step"));
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

/** Drop the tour and the seen cards. A real account must not inherit them. */
export function clearJudgeTour(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOUR_KEY);
  window.localStorage.removeItem(SEEN_KEY);
}
