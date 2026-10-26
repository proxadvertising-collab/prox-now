export type DemoPost = {
  id: string;
  shopSlug: string;
  status: "live";
  expires_at: string;
};

const PLAN: Array<{ shopSlug: string; minutes: number }> = [
  { shopSlug: "mala-mafia", minutes: 105 },
  { shopSlug: "coconut-shake-stand", minutes: 55 },
  { shopSlug: "krua-mae-yen", minutes: 30 },
  { shopSlug: "pak-kapi", minutes: 7 },
];

/** Four live posts. Remaining time is 105, 55, 30, and 7 minutes. */
export function makeDemoPosts(nowMs: number): DemoPost[] {
  return PLAN.map((item) => ({
    id: "demo-" + item.shopSlug,
    shopSlug: item.shopSlug,
    status: "live",
    expires_at: new Date(nowMs + item.minutes * 60_000).toISOString(),
  }));
}
