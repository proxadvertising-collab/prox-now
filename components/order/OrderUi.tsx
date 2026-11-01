"use client";

import { useEffect, useState } from "react";
import { displayName } from "../../lib/book/display";
import { t } from "../../lib/copy";
import { MoreSheet } from "../shell/MoreSheet";
import {
  browserStorage,
  clearOrder,
  copyLang,
  shopStaffLanguage,
  emptyOrder,
  formatPrice,
  itemCopy,
  notifyOrder,
  orderBarFor,
  orderSummary,
  staffNoteTarget,
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

export function OrderBar({
  count,
  href,
  label,
  caption = null,
}: {
  count: number;
  href: string;
  label: string;
  caption?: string | null;
}) {
  if (count < 1) return null;
  return (
    <div className="fixed inset-x-4 z-40 bottom-[calc(84px+env(safe-area-inset-bottom)+8px)] md:bottom-4">
      <a
        className="flex h-14 w-full flex-col items-center justify-center overflow-hidden whitespace-nowrap rounded-2xl bg-accent px-4 text-center font-bold text-accent-ink no-underline"
        href={href}
      >
        <span className="block max-w-full truncate text-base leading-tight">{label}</span>
        {caption ? <span className="block max-w-full truncate text-[11px] font-semibold leading-none">{caption}</span> : null}
      </a>
    </div>
  );
}

/** Extra space under the book, equal to the order bar plus a gap, only while that bar is showing. */
export function bookBarPadClass(showBar: boolean): string {
  return showBar
    ? "pb-[calc(84px+3.5rem+12px+env(safe-area-inset-bottom))]"
    : "pb-[calc(92px+env(safe-area-inset-bottom))]";
}

export function useOrderSnap(pathname: string): { slug: string; count: number; label: string; caption: string | null } | null {
  const [snap, setSnap] = useState<{ slug: string; count: number; label: string; caption: string | null } | null>(null);
  useEffect(() => {
    const read = () => {
      const language = typeof navigator === "undefined" ? "en" : navigator.language;
      setSnap(orderBarFor(pathname, browserStorage(), copyLang(language)));
    };
    read();
    window.addEventListener("prox-order", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("prox-order", read);
      window.removeEventListener("storage", read);
    };
  }, [pathname]);
  return snap;
}

export type ClearPhase = "idle" | "armed";

/** First tap arms the clear. Second tap clears. A timeout drops back to idle. */
export function nextClearState(
  state: ClearPhase,
  event: "tap" | "timeout" | "close",
): { state: ClearPhase; action: "arm" | "clear" | "idle" } {
  if (event === "timeout" || event === "close") return { state: "idle", action: "idle" };
  if (state === "idle") return { state: "armed", action: "arm" };
  return { state: "idle", action: "clear" };
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
  busy = false,
  failed = false,
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
  busy?: boolean;
  failed?: boolean;
}) {
  const [clearPhase, setClearPhase] = useState<ClearPhase>("idle");
  useEffect(() => {
    if (clearPhase !== "armed" || typeof window === "undefined") return;
    const timer = window.setTimeout(() => setClearPhase(nextClearState("armed", "timeout").state), 4000);
    return () => window.clearTimeout(timer);
  }, [clearPhase]);
  if (staff) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-[#1A120B] p-6 text-[#FFF8F1]">
        <h1 className="text-4xl font-bold leading-tight">{shopName}</h1>
        <div className="mt-8 flex flex-col gap-6">
          {lines.map((line) => {
            const original = displayName(line.name) || line.name;
            const shopper = line.title !== original ? line.title : line.subtitle;
            return (
              <div key={line.id}>
                <p className="text-5xl font-bold leading-tight">{line.qty + " × " + original}</p>
                {shopper ? <p className="mt-1 text-lg text-[#D6C4B4]">{shopper}</p> : null}
              </div>
            );
          })}
        </div>
        {totalLabel ? <p className="mt-8 text-3xl font-bold">{t(lang, "order.total") + " " + totalLabel}</p> : null}
        {translation ? (
          <div className="mt-8 rounded-3xl bg-[#FFF8F1] p-5 text-[#1A120B]">
            <p className="text-sm font-bold">{t(lang, "order.forStaff")}</p>
            <p className="mt-2 text-4xl font-bold leading-tight">{translation}</p>
          </div>
        ) : busy ? (
          <p className="mt-8 text-xl">{t(lang, "order.translating")}</p>
        ) : failed ? (
          <p className="mt-8 rounded-3xl bg-[#FFF8F1] p-5 text-3xl font-bold text-[#1A120B]">{note}</p>
        ) : null}
        <button type="button" className="mt-10 h-16 w-full rounded-2xl bg-[#FFF8F1] text-2xl font-bold text-[#1A120B]" onClick={onDone}>
          {t(lang, "order.done")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex items-center gap-3 rounded-2xl border border-border bg-surface-1 p-3">
        {logoUrl ? <img src={logoUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : null}
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
      {translation ? (
        <div className="rounded-2xl border border-border bg-surface-1 p-3">
          <p className="text-xs font-semibold text-fg-muted">{t(lang, "order.forStaff")}</p>
          <p className="mt-1 text-base text-fg">{translation}</p>
        </div>
      ) : busy ? (
        <p className="text-[11px] text-fg-muted">{t(lang, "order.translating")}</p>
      ) : failed ? (
        <p role="alert" className="text-sm text-fg-muted">
          {t(lang, "order.translateFail")}
        </p>
      ) : null}
      <button type="button" className="h-14 rounded-2xl bg-accent text-lg font-bold text-accent-ink active:scale-95" onClick={onStaff}>
        {t(lang, "order.staff")}
      </button>
      <MoreSheet label="More" onClose={() => setClearPhase(nextClearState(clearPhase, "close").state)}>
        {(close) => (
          <>
            <button type="button" className="h-12 rounded-2xl border border-accent bg-transparent font-bold text-accent active:scale-95" onClick={onTranslate}>
              {t(lang, "order.translate")}
            </button>
            <button
              type="button"
              className="h-12 rounded-2xl text-sm font-semibold text-fg-muted"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                const next = nextClearState(clearPhase, "tap");
                if (next.action === "clear") {
                  onClear?.();
                  setClearPhase("idle");
                  close();
                  return;
                }
                setClearPhase(next.state);
              }}
            >
              {clearPhase === "armed" ? "Tap again to clear" : t(lang, "order.clear")}
            </button>
          </>
        )}
      </MoreSheet>
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
  shopCountry,
}: {
  slug: string;
  shopName: string;
  logoUrl: string | null;
  address: string | null;
  shopCountry: string | null;
}) {
  const [state, setState] = useState<OrderState>(emptyOrder);
  const [lang, setLang] = useState<"en" | "th">("en");
  const [speak, setSpeak] = useState("en");
  const [staff, setStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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
    const to = staffNoteTarget(trimmed, shopCountry);
    if (!trimmed || !to) {
      if (trimmed) commit(setOrderTranslation(readOrder(slug, browserStorage()), trimmed));
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/order/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed, to }),
      });
      const body = response.ok ? ((await response.json().catch(() => null)) as { translation?: unknown } | null) : null;
      if (!body || typeof body.translation !== "string" || !body.translation.trim()) {
        setFailed(true);
        return;
      }
      commit(setOrderTranslation(readOrder(slug, browserStorage()), body.translation));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function openStaff() {
    setStaff(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("staff") !== "1") {
        url.searchParams.set("staff", "1");
        window.history.replaceState(window.history.state, "", url.pathname + url.search);
        window.dispatchEvent(new Event("prox-step"));
      }
    }
    const current = readOrder(slug, browserStorage());
    if (!current.translation.trim() && current.note.trim()) void translate(current.note);
  }

  const summary = orderSummary(state);
  const place = address && address.trim() ? address.trim() : null;
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
      lang={staff ? copyLang(shopStaffLanguage(shopCountry)) : lang}
      staff={staff}
      busy={busy}
      failed={failed}
      onNote={(value) => commit(setOrderNote(state, value))}
      onTranslate={() => void translate(state.note)}
      onQty={(id, qty) => commit(setLineQty(state, id, qty))}
      onClear={() => commit(clearOrder())}
      onStaff={openStaff}
      onDone={() => setStaff(false)}
    />
  );
}
