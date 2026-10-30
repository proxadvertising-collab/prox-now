"use client";

import { useEffect, useState } from "react";
import { displayName } from "../../lib/book/display";
import { t } from "../../lib/copy";
import { copyLang, lineId } from "../../lib/order/store";
import { ItemTile } from "./ItemTile";

export type MenuBoardItem = {
  name: string;
  nameEn?: string | null;
  price: string | null;
  photo: string | null;
  category?: string | null;
  tags?: string[];
};

function groupsOf(items: readonly MenuBoardItem[]): { category: string | null; items: MenuBoardItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, MenuBoardItem[]>();
  for (const item of items) {
    const key = item.category ?? "";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)?.push(item);
  }
  return order.map((key) => ({ category: key || null, items: map.get(key) ?? [] }));
}

export function MenuBoard({
  slug,
  items,
  sectionId,
}: {
  slug: string;
  items: readonly MenuBoardItem[];
  sectionId?: string;
}) {
  const groups = groupsOf(items);
  const single = groups.length <= 1;
  const [active, setActive] = useState(0);
  const [lang, setLang] = useState<"en" | "th">("en");
  useEffect(() => {
    setLang(copyLang(navigator.language));
  }, []);

  return (
    <div>
      {single ? null : (
      <div className="sticky top-0 z-10 mb-3 flex gap-2 overflow-x-auto bg-[var(--book-ink,#1E1611)] py-2">
        {groups.map((group, index) => (
          <button
            key={(group.category ?? "menu") + "-" + index}
            type="button"
            className={
              "whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold " +
              (index === active ? "bg-accent text-accent-ink" : "bg-surface-2 text-fg")
            }
            aria-current={index === active ? "true" : undefined}
            onClick={() => {
              setActive(index);
              document.getElementById("menu-section-" + index)?.scrollIntoView({ block: "start" });
            }}
          >
            {group.category ? displayName(group.category) : t(lang, "order.menu")}
          </button>
        ))}
      </div>
      )}
      <div className="flex flex-col gap-2">
        {groups.map((group, index) => (
          <section key={(group.category ?? "menu") + "-section-" + index} id={sectionId ?? "menu-section-" + index} className="flex flex-col gap-2">
            {single ? null : (
            <h2 className="text-sm font-bold text-fg-muted">{group.category ? displayName(group.category) : t(lang, "order.menu")}</h2>
            )}
            {group.items.map((item, itemIndex) => (
              <ItemTile
                key={lineId(item.name, group.category) + "-" + itemIndex}
                slug={slug}
                id={lineId(item.name, group.category)}
                name={item.name}
                nameEn={item.nameEn ?? null}
                price={item.price}
                photo={item.photo}
                tags={item.tags}
                category={group.category}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
