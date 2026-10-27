export type UsualItem = { name: string; price: number | null; currency: string | null };

export type UsualFact = { items?: UsualItem[] | null };

export function usualItems(facts: readonly UsualFact[]): string | null {
  if (facts.length < 3) return null;
  const groups = new Map<string, { name: string; prices: number[]; currency: string | null }>();
  for (const fact of facts) {
    for (const item of fact.items ?? []) {
      const name = item.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const group = groups.get(key) ?? { name, prices: [], currency: null };
      if (typeof item.price === "number" && Number.isFinite(item.price)) group.prices.push(item.price);
      if (!group.currency && item.currency && /^[A-Z]{3}$/.test(item.currency)) group.currency = item.currency;
      groups.set(key, group);
    }
  }
  const parts = [...groups.values()]
    .filter((group) => group.prices.length > 0)
    .sort((a, b) => b.prices.length - a.prices.length)
    .slice(0, 3)
    .map((group) => {
      const sorted = [...group.prices].sort((left, right) => left - right);
      const mid = sorted[Math.floor(sorted.length / 2)] ?? sorted[0];
      return group.currency ? group.name + " " + mid + " " + group.currency : group.name + " " + mid;
    });
  if (parts.length === 0) return null;
  return parts.join(", ");
}
