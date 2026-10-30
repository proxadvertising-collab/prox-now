"use client";

import { useEffect, useState } from "react";
import { t } from "../../lib/copy";
import {
  browserStorage,
  clearOrder,
  copyLang,
  emptyOrder,
  formatPrice,
  itemCopy,
  notifyOrder,
  orderBarLabel,
  orderSummary,
  readActiveSlug,
  readOrder,
  setLineQty,
  setOrderNote,
  setOrderTranslation,
  tilePhoto,
  writeOrder,
  type OrderState,
} from "../../lib/order/store";

export type OrderSheetLine = {
  id: string;
  name: string;
  title: string;
  subtitle: string | null;
  qty: number;
  priceLabel: string | null;
  photo: string | null;
};

export function OrderBar({ count, href, label }: { count: number; href: string; label: string }) {
  if (count < 1) return null;
  return (
    <a
      className="fixed inset-x-4 z-40 flex h-14 items-center justify-center rounded-2xl bg-accent px-4 text-center text-base font-bold text-accent-ink no-underline bottom-[calc(84px+env(safe-area-inset-bottom)+8px)] md:bottom-4"
      href={href}
    >
      {label}
    </a>
  );
}

export function useOrderSnap(): { slug: string; count: number; label: string } | null {
  const [snap, setSnap] = useState<{ slug: string; count: number; label: string } | null>(null);
  useEffect(() => {
    const read = () => {
      const storage = browserStorage();
      const slug = readActiveSlug(storage);
      if (!slug) {
        setSnap(null);
        return;
      }
      const summary = orderSummary(readOrder(slug, storage));
      if (summary.count < 1) {
        setSnap(null);
        return;
      }
      setSnap({ slug, count: summary.count, label: orderBarLabel(copyLang(navigator.language), summary) });
    };
    read();
    window.addEventListener("prox-order", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("prox-order", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return snap;
}

export function OrderSheet({
  shopName,
  logoUrl,
  place,
  lines,
  note,
  translation,
  totalLabel,
  unpriced,
  lang,
  staff = false,
  onNote,
  onTranslate,
  onQty,
  onClear,
  onStaff,
  onDone,
}: {
  shopName: string;
  logoUrl: string | null;
  place: string | null;
  lines: readonly OrderSheetLine[];
  note: string;
  translation: string;
  totalLabel: string | null;
  unpriced: number;
  lang: "en" | "th";
  staff?: boolean;
  onNote?: (value: string) => void;
  onTranslate?: () => void;
  onQty?: (id: string, qty: number) => void;
  onClear?: () => void;
  onStaff?: () => void;
  onDone?: () => void;
}) {
  if (staff) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-[#FFF8F1] p-6 text-[#1A120B]">
        <h1 className="text-4xl font-bold">{shopName}</h1>
        <div className="mt-6 flex flex-col gap-4">
          {lines.map((line) => (
            <p key={line.id} className="text-3xl font-bold">
              {line.qty + " × " + line.name}
            </p>
          ))}
        </div>
        {translation ? <p className="mt-8 text-2xl">{translation}</p> : null}
        <button type="button" className="mt-10 h-14 rounded-2xl bg-[#1A120B] px-6 text-xl font-bold text-white" onClick={onDone}>
          {t(lang, "order.done")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex items-center gap-3 rounded-2xl border border-border bg-surface-1 p-3">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent/35 to-surface-2 text-xl font-bold text-fg">
            {(shopName.trim().slice(0, 1) || "?").toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-fg">{shopName}</h1>
          {place ? <p className="truncate text-sm text-fg-muted">{place}</p> : null}
        </div>
      </header>
      {lines.length === 0 ? <p className="text-body text-fg-muted">{t(lang, "order.empty")}</p> : null}
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-3 rounded-2xl bg-surface-1 p-3">
            {line.photo ? (
              <img src={line.photo} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg font-bold text-fg">
                {(line.title.trim().slice(0, 1) || "?").toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-fg">{line.title}</p>
              {line.subtitle ? <p className="truncate text-sm text-fg-subtle">{line.subtitle}</p> : null}
              {line.priceLabel ? <p className="text-sm font-semibold text-fg">{line.priceLabel}</p> : null}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-accent text-lg text-accent active:scale-95" aria-label={t(lang, "order.less")} onClick={() => onQty?.(line.id, line.qty - 1)}>
                –
              </button>
              <span className="w-6 text-center font-bold text-fg">{line.qty}</span>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-full border border-accent text-lg text-accent active:scale-95" aria-label={t(lang, "order.more")} onClick={() => onQty?.(line.id, line.qty + 1)}>
                +
              </button>
            </div>
          </li>
        ))}
      </ul>
      {totalLabel ? (
        <p className="text-lg font-bold text-fg">
          {t(lang, "order.total") + " " + totalLabel}
        </p>
      ) : null}
      {unpriced > 0 ? <p className="text-sm text-fg-muted">{t(lang, "order.unpriced", { n: String(unpriced) })}</p> : null}
      <label className="flex flex-col gap-2 text-sm font-semibold text-fg">
        {t(lang, "order.note")}
        <textarea
          className="min-h-24 rounded-2xl border border-border bg-surface-1 p-3 text-base font-normal text-fg"
          value={note}
          placeholder={t(lang, "order.note")}
          onChange={(event) => onNote?.(event.target.value)}
          onBlur={() => onTranslate?.()}
        />
      </label>
      {translation ? <p className="text-base text-fg-muted">{translation}</p> : null}
      <button type="button" className="h-12 rounded-2xl border border-accent font-bold text-accent active:scale-95" onClick={onTranslate}>
        {t(lang, "order.translate")}
      </button>
      <button type="button" className="h-14 rounded-2xl bg-accent font-bold text-accent-ink active:scale-95" onClick={onStaff}>
        {t(lang, "order.staff")}
      </button>
      <button type="button" className="h-12 rounded-2xl text-sm font-semibold text-fg-muted" onClick={onClear}>
        {t(lang, "order.clear")}
      </button>
    </div>
  );
}

function sheetLines(state: OrderState, speak: string): OrderSheetLine[] {
  return state.lines.map((line) => {
    const copy = itemCopy({ name: line.name, nameEn: line.nameEn }, speak);
    const each = formatPrice(line.price);
    const amount = each && line.qty > 0 ? formatPrice((Number(each.slice(1)) || 0) * line.qty) : null;
    return {
      id: line.id,
      name: line.name,
      title: copy.title,
      subtitle: copy.subtitle,
      qty: line.qty,
      priceLabel: amount,
      photo: tilePhoto(line.photo),
    };
  });
}

export function OrderClient({
  slug,
  shopName,
  logoUrl,
  address,
  menuLanguage,
}: {
  slug: string;
  shopName: string;
  logoUrl: string | null;
  address: string | null;
  menuLanguage: string;
}) {
  const [state, setState] = useState<OrderState>(emptyOrder);
  const [lang, setLang] = useState<"en" | "th">("en");
  const [speak, setSpeak] = useState("en");
  const [staff, setStaff] = useState(false);

  useEffect(() => {
    const nextLang = navigator.language || "en";
    setSpeak(nextLang);
    setLang(copyLang(nextLang));
    setState(readOrder(slug, browserStorage()));
  }, [slug]);

  function commit(next: OrderState) {
    setState(next);
    writeOrder(slug, next, browserStorage());
    notifyOrder();
  }

  async function translate(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const response = await fetch("/api/order/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: trimmed, to: menuLanguage || "th" }),
    });
    if (!response.ok) return;
    const body = (await response.json()) as { translation?: unknown };
    if (typeof body.translation !== "string") return;
    commit(setOrderTranslation(readOrder(slug, browserStorage()), body.translation));
  }

  const summary = orderSummary(state);
  const place = address ?? t(lang, "order.near", { pin: shopName });
  return (
    <OrderSheet
      shopName={shopName}
      logoUrl={tilePhoto(logoUrl) ?? (logoUrl && logoUrl.startsWith("/demo/") ? logoUrl : logoUrl && logoUrl.includes("book-cutouts/") ? logoUrl : null)}
      place={place}
      lines={sheetLines(state, speak)}
      note={state.note}
      translation={state.translation}
      totalLabel={summary.count > summary.unpriced ? formatPrice(summary.amount) : null}
      unpriced={summary.unpriced}
      lang={lang}
      staff={staff}
      onNote={(value) => commit(setOrderNote(state, value))}
      onTranslate={() => void translate(state.note)}
      onQty={(id, qty) => commit(setLineQty(state, id, qty))}
      onClear={() => {
        if (typeof window !== "undefined" && !window.confirm(t(lang, "order.clearAsk"))) return;
        commit(clearOrder());
      }}
      onStaff={() => setStaff(true)}
      onDone={() => setStaff(false)}
    />
  );
}
