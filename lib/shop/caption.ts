import type { UsualFact } from "./usual";

export function keptShareCaption(
  lang: "en" | "th",
  shop: string,
  author: string,
  facts: (UsualFact & { crowd?: string | null }) | null,
): string {
  const credit =
    lang === "th" ? "รูปโดย " + author + " ที่ " + shop : "Photo by " + author + " at " + shop;
  const items = (facts?.items ?? [])
    .slice(0, 3)
    .map((item) => {
      if (item.price == null) return item.name;
      return item.currency ? item.name + " " + item.price + " " + item.currency : item.name + " " + item.price;
    })
    .filter(Boolean);
  const crowd =
    facts?.crowd === "busy" ? (lang === "th" ? "คนเยอะ" : "Busy") : facts?.crowd === "queue" ? (lang === "th" ? "มีคิว" : "A queue") : "";
  return [credit, ...items, crowd].filter(Boolean).join(". ");
}
