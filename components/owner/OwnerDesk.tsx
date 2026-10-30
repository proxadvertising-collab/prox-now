"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { t } from "@/lib/copy";
import { readOwnerShops, type OwnerShop } from "@/lib/owner/shops";

type Card = {
  id: string;
  shopName?: string;
  photoUrl?: string | null;
  authorName?: string;
  daysLeft?: number;
  facts?: { items?: { name?: string; price?: number | null; currency?: string | null }[]; crowd?: string | null } | null;
};

const primary =
  "inline-flex min-h-16 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink disabled:opacity-60";
const danger =
  "inline-flex min-h-16 w-full items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg disabled:opacity-60";

export function OwnerDesk({ initialShops = [] }: { initialShops?: OwnerShop[] }) {
  const [shops, setShops] = useState<OwnerShop[]>(initialShops);
  const [cards, setCards] = useState<Card[]>([]);
  const [liveNow, setLiveNow] = useState<Card[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [arm, setArm] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [offerText, setOfferText] = useState("");
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [suggesting, setSuggesting] = useState(false);
  const startX = useRef<number | null>(null);
  const card = cards[0];
  const verified = (shops ?? []).some((shop) => shop.status === "verified");

  async function cancelClaim(shopId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/owner/claim/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      if (!response.ok) {
        setError(t("en", "loop.fail"));
        return;
      }
      await load();
    } catch {
      setError(t("en", "loop.fail"));
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    try {
      const [home, inbox] = await Promise.all([
        fetch("/api/owner/home"),
        fetch("/api/owner/inbox"),
      ]);
      if (home.status === 401 || inbox.status === 401) {
        setError(t("en", "post.signin"));
        setShops([]);
        return;
      }
      const homeBody = (await home.json().catch(() => null)) as unknown;
      const inboxBody = (await inbox.json().catch(() => null)) as {
        cards?: Card[];
        liveNow?: Card[];
        keptToday?: number;
        passedToday?: number;
      } | null;
      setShops(readOwnerShops(homeBody));
      setCards(inboxBody?.cards ?? []);
      setLiveNow(inboxBody?.liveNow ?? []);
    } catch {
      setError(t("en", "loop.fail"));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!arm) return;
    const timer = window.setTimeout(() => setArm(null), 3000);
    return () => window.clearTimeout(timer);
  }, [arm]);

  function buzz() {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(12);
  }

  async function decideNow(id: string) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/owner/demo-end", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(t("en", "loop.fail"));
        return;
      }
      buzz();
      await load();
    } catch {
      setError(t("en", "loop.fail"));
    } finally {
      setBusy(false);
    }
  }

  async function openKeep(id: string) {
    if (busy) return;
    setOfferFor(id);
    setDays(7);
    setOfferText("");
    setSuggesting(true);
    setError("");
    try {
      const response = await fetch("/api/owner/suggest-coupon", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post_id: id }),
      });
      const body = (await response.json().catch(() => null)) as { offer?: unknown } | null;
      const offer = body && typeof body.offer === "string" ? body.offer.trim() : "";
      setOfferText(offer || "10% off your next visit");
    } catch {
      setOfferText("10% off your next visit");
    } finally {
      setSuggesting(false);
    }
  }

  async function act(
    kind: "keep" | "pass",
    id: string,
    extra?: { offer: string | null; days: 1 | 7 | 30 },
  ) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/owner/" + kind, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "keep" ? { id, offer: extra?.offer ?? null, days: extra?.days ?? 7 } : { id }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error === "storage_failed" ? t("en", "loop.passFail") : t("en", "loop.fail"));
        return;
      }
      buzz();
      if (kind === "keep") setNote(t("en", "loop.sent", { name: card?.authorName || "" }));
      else setNote(t("en", "loop.deleted"));
      setArm(null);
      setOfferFor(null);
      await load();
    } catch {
      setError(t("en", "loop.fail"));
    } finally {
      setBusy(false);
    }
  }

  const pending = shops.find((shop) => shop.status === "pending");

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-bold text-fg">{t("en", "loop.owner")}</h1>
      {shops.length === 0 ? (
        <EmptyState message={t("en", "empty.owner")} action={{ href: "/map", label: t("en", "empty.openMap") }} />
      ) : (
        <ul className="flex flex-col gap-2">
          {shops.map((shop) => (
            <li key={shop.shopId} className="rounded-lg bg-surface-1 p-4">
              <p className="text-heading font-bold text-fg">{shop.name}</p>
              {shop.status === "pending" ? (
                <button
                  type="button"
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-fg underline disabled:opacity-60"
                  disabled={busy}
                  onClick={() => void cancelClaim(shop.shopId)}
                >
                  {t("en", "claim.cancel")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!verified && shops.length > 0 ? (
        <p className="text-body text-fg">{pending ? t("en", "loop.waiting") : t("en", "loop.claimHint")}</p>
      ) : null}
      {note ? <p className="text-body text-fg motion-safe:animate-pulse">{note}</p> : null}
      {error ? <p role="alert" className="text-body text-danger">{error}</p> : null}
      {verified ? (
      <>
      {liveNow.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-heading font-bold text-fg">{t("en", "loop.liveNow")}</h2>
          {liveNow.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
              <p className="text-body font-semibold text-fg">{item.shopName}</p>
              <button type="button" className={primary} disabled={busy} onClick={() => void decideNow(item.id)}>
                {t("en", "loop.decide")}
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {!card ? (
        <EmptyState message={t("en", "loop.caught")} action={{ href: "/map", label: t("en", "empty.openMap") }} />
      ) : (
        <article
          className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4"
          onPointerDown={(event) => {
            startX.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (startX.current == null || busy) return;
            const width = event.currentTarget.clientWidth || 1;
            const delta = (event.clientX - startX.current) / width;
            startX.current = null;
            if (delta > 0.4) void openKeep(card.id);
            if (delta < -0.4) void act("pass", card.id);
          }}
        >
          {card.photoUrl ? (
            <img src={card.photoUrl} alt={card.shopName ?? ""} className="aspect-[4/3] w-full rounded-md object-cover" />
          ) : null}
          <p className="text-heading font-bold text-fg">{card.shopName}</p>
          <p className="text-body text-fg">{t("en", "loop.by", { name: card.authorName || "" })}</p>
          <p className="text-label text-fg-muted">{t("en", "loop.days", { n: String(card.daysLeft ?? 0) })}</p>
          {(card.facts?.items ?? []).slice(0, 3).map((item) => (
            <p key={item.name} className="text-body text-fg">
              {item.name}
              {item.price != null ? " " + item.price + (item.currency ? " " + item.currency : "") : ""}
            </p>
          ))}
          {offerFor === card.id ? (
            <div className="flex flex-col gap-2">
              <input
                className="min-h-11 w-full rounded-md bg-surface-2 px-3 text-body text-fg"
                maxLength={120}
                value={offerText}
                placeholder={suggesting ? t("en", "loop.suggesting") : ""}
                onChange={(event) => setOfferText(event.target.value)}
              />
              <p className="text-label text-fg-muted">{t("en", "loop.validFor")}</p>
              <div className="flex gap-2">
                {([1, 7, 30] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      "inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-semibold " +
                      (days === value ? "bg-accent text-accent-ink" : "bg-surface-2 text-fg")
                    }
                    onClick={() => setDays(value)}
                  >
                    {t("en", value === 1 ? "loop.day1" : value === 7 ? "loop.day7" : "loop.day30")}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={primary}
                disabled={busy || suggesting}
                onClick={() => void act("keep", card.id, { offer: offerText.trim() || null, days })}
              >
                {t("en", "loop.give")}
              </button>
              <button
                type="button"
                className={danger}
                disabled={busy}
                onClick={() => void act("keep", card.id, { offer: null, days: 7 })}
              >
                {t("en", "loop.keepPlain")}
              </button>
            </div>
          ) : (
            <button type="button" className={primary} disabled={busy} onClick={() => void openKeep(card.id)}>
              {t("en", "loop.keep")}
            </button>
          )}
          <button
            type="button"
            className={danger}
            disabled={busy}
            onClick={() => {
              if (arm === card.id) void act("pass", card.id);
              else setArm(card.id);
            }}
          >
            {arm === card.id ? t("en", "loop.passAgain") : t("en", "loop.pass")}
          </button>
        </article>
      )}
      <a className="inline-flex min-h-11 items-center text-body font-semibold text-fg" href="/owner/redeem">
        {t("en", "loop.redeem")}
      </a>
      </>
      ) : null}
    </div>
  );
}
