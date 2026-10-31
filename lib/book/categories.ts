export type CategoryPage<T> = {
  category: string;
  part: number;
  title: string;
  items: T[];
};

/** Trim and collapse spaces. Empty becomes null. */
export function tidyCategory(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, 80);
}

/**
 * One page per category, in the order each category first appears.
 * The same category merges case- and space-insensitively.
 * A page that overflows is "Coffee", then "Coffee (2)".
 * Items with no category are "More" at the end.
 */
export function pagesByCategory<T extends { category?: string | null }>(
  items: readonly T[],
  size = 5,
): CategoryPage<T>[] {
  const step = size < 1 ? 5 : size;
  const order: string[] = [];
  const groups = new Map<string, { label: string; items: T[] }>();
  const loose: T[] = [];
  for (const item of items) {
    const label = tidyCategory(item.category ?? null);
    if (!label) {
      loose.push(item);
      continue;
    }
    const key = label.toLowerCase();
    const found = groups.get(key);
    if (found) found.items.push(item);
    else {
      order.push(key);
      groups.set(key, { label, items: [item] });
    }
  }
  const pages: CategoryPage<T>[] = [];
  const push = (label: string, list: readonly T[]) => {
    let part = 0;
    for (let index = 0; index < list.length; index += step) {
      part += 1;
      pages.push({
        category: label,
        part,
        title: part === 1 ? label : label + " (" + part + ")",
        items: list.slice(index, index + step),
      });
    }
  };
  for (const key of order) {
    const group = groups.get(key);
    if (group && group.items.length > 0) push(group.label, group.items);
  }
  if (loose.length > 0) push("More", loose);
  return pages;
}
