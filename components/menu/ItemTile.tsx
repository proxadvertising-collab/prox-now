"use client";

import { useEffect, useState } from "react";
import { t } from "../../lib/copy";
import {
  addLine,
  browserStorage,
  copyLang,
  formatPrice,
  itemCopy,
  notifyOrder,
  readOrder,
  setLineQty,
  tilePhoto,
  writeOrder,
} from "../../lib/order/store";

export function ItemTile({
  slug,
  id,
  name,
  nameEn,
  price,
  photo,
  tags = [],
  category = null,
  userLang,
}: {
  slug: string;
  id: string;
  name: string;
  nameEn: string | null;
  price: string | null;
  photo: string | null;
  tags?: string[];
  category?: string | null;
  userLang?: string;
}) {
  const [qty, setQty] = useState(0);
  const [speak, setSpeak] = useState(userLang ?? "en");
  const lang = copyLang(speak);
  const copy = itemCopy({ name, nameEn }, speak);
  const picture = tilePhoto(photo);
  const priceLabel = formatPrice(price);
  const letter = (copy.title.trim().slice(0, 1) || "?").toUpperCase();
  const chips = tags.filter((tag) => tag === "spicy" || tag === "vegan");

  useEffect(() => {
    if (!userLang) setSpeak(navigator.language || "en");
    const sync = () => {
      const state = readOrder(slug, browserStorage());
      setQty(state.lines.find((line) => line.id === id)?.qty ?? 0);
    };
    sync();
    window.addEventListener("prox-order", sync);
    return () => window.removeEventListener("prox-order", sync);
  }, [slug, id, userLang]);

  function persist(nextQty: number) {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(12);
    const current = readOrder(slug, browserStorage());
    const draft = {
      id,
      name,
      nameEn,
      price,
      photo: picture,
      tags: chips,
      category,
    };
    const next = nextQty <= 0 ? setLineQty(current, id, 0) : current.lines.some((line) => line.id === id)
      ? setLineQty(current, id, nextQty)
      : addLine(current, { ...draft, qty: nextQty });
    writeOrder(slug, next, browserStorage());
    notifyOrder();
    setQty(nextQty <= 0 ? 0 : nextQty);
  }

  return (
    <article className="flex items-center gap-3 rounded-2xl border border-accent bg-surface-1 p-3 active:scale-95">
      {picture ? (
        <img src={picture} alt="" className="h-28 w-28 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="grid h-28 w-28 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent/35 to-surface-2 text-3xl font-bold text-fg">
          {letter}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold text-fg">{copy.title}</p>
        {copy.subtitle ? <p className="truncate text-sm text-fg-subtle">{copy.subtitle}</p> : null}
        {priceLabel ? (
          <span className="mt-1 inline-flex rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-ink">{priceLabel}</span>
        ) : null}
        {chips.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {chips.map((tag) => (
              <span key={tag} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                {tag === "vegan" ? t(lang, "order.veg") : t(lang, "order.spicy")}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {qty > 0 ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full border-2 border-accent text-lg font-bold text-accent active:scale-95"
            aria-label={t(lang, "order.less")}
            onClick={() => persist(qty - 1)}
          >
            –
          </button>
          <span className="w-6 text-center text-base font-bold text-fg">{qty}</span>
          <button
            type="button"
            className="grid h-14 w-14 place-items-center rounded-full border-2 border-accent text-2xl font-bold text-accent active:scale-95"
            aria-label={t(lang, "order.more")}
            onClick={() => persist(qty + 1)}
          >
            +
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-accent text-3xl font-bold text-accent active:scale-95"
          aria-label={t(lang, "order.add")}
          onClick={() => persist(1)}
        >
          +
        </button>
      )}
    </article>
  );
}
