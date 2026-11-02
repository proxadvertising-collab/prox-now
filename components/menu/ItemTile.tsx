"use client";

import { useEffect, useState } from "react";
import { t } from "../../lib/copy";
import { DEVICE_LANG_KEY, deviceLang, titledItem } from "../../lib/i18n/device";
import { menuBatcher } from "../../lib/i18n/menuBatch";
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

function isDrink(category: string | null): boolean {
  const text = (category ?? "").toLowerCase();
  return text.includes("drink") || text.includes("beverage") || (category ?? "").includes("เครื่องดื่ม");
}

function TileMark({ drink }: { drink: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-fg-muted" aria-hidden="true">
      {drink ? (
        <path
          fill="currentColor"
          d="M7 3h8.5v2.1c.9.4 1.6 1.5 1.4 3.2-.5 3.4-2.8 6-5.6 6.9V19H15v2H8v-2h3.3v-3.8c-2.8-.9-5.1-3.5-5.6-6.9-.2-1.7.5-2.8 1.4-3.2V3H7zm2 2v1.4h5.5V5H9z"
        />
      ) : (
        <path fill="currentColor" d="M4 9h16c-.5 4.4-2.6 7.2-5 8.3L14.2 21H9.8l-.8-3.7C6.6 16.2 4.5 13.4 4 9zm1.8-2h12.4l-.7-2H6.5l-.7 2z" />
      )}
    </svg>
  );
}

export function ItemTile({
  slug,
  id,
  name,
  nameEn,
  price,
  photo,
  tags = [],
  category = null,
  needsCheck = false,
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
  needsCheck?: boolean;
  userLang?: string;
}) {
  const [qty, setQty] = useState(0);
  const [speak, setSpeak] = useState(userLang ?? "en");
  const [translated, setTranslated] = useState<string | null>(null);
  const [langTick, setLangTick] = useState(0);
  const lang = copyLang(speak);
  const copy = itemCopy({ name, nameEn }, speak);
  const shown = translated ? titledItem(name, translated) : copy;
  const picture = tilePhoto(photo);
  const priceLabel = formatPrice(price);
  const chips = tags.filter((tag) => tag === "spicy" || tag === "vegan");
  const drink = isDrink(category);

  useEffect(() => {
    let stop = false;
    const saved = window.localStorage.getItem(DEVICE_LANG_KEY);
    const chosen = userLang || deviceLang(saved, navigator.language);
    if (!userLang) setSpeak(chosen);
    const base = chosen.toLowerCase().split("-")[0] || "en";
    const original = name.trim();
    if (base === "en") setTranslated(null);
    else {
      void menuBatcher()
        .request(original, base)
        .then((text) => {
          if (!stop && text) setTranslated(text);
        });
    }
    const sync = () => {
      const state = readOrder(slug, browserStorage());
      setQty(state.lines.find((line) => line.id === id)?.qty ?? 0);
    };
    sync();
    const onLang = () => setLangTick((value) => value + 1);
    window.addEventListener("prox-order", sync);
    window.addEventListener("prox-lang", onLang);
    return () => {
      stop = true;
      window.removeEventListener("prox-order", sync);
      window.removeEventListener("prox-lang", onLang);
    };
  }, [slug, id, userLang, name, langTick]);

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
    <article className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-border bg-surface-1 p-2 active:scale-95">
      {picture ? (
        <img src={picture} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent/35 to-surface-2">
          <TileMark drink={drink} />
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="line-clamp-1 text-sm font-bold leading-snug text-fg">{shown.title}</p>
        {needsCheck ? <p className="text-[11px] font-semibold text-fg-muted">{t(lang, "book.checkThis")}</p> : null}
        {shown.subtitle ? <p className="truncate text-sm text-fg-subtle">{shown.subtitle}</p> : null}
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
            className="grid h-12 w-12 place-items-center rounded-full border-2 border-accent text-2xl font-bold text-accent active:scale-95"
            aria-label={t(lang, "order.more")}
            onClick={() => persist(qty + 1)}
          >
            +
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-accent text-2xl font-bold text-accent active:scale-95"
          aria-label={t(lang, "order.add")}
          onClick={() => persist(1)}
        >
          +
        </button>
      )}
    </article>
  );
}
