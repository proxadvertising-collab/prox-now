"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/copy";

type Card = {
  id: string;
  shopName?: string;
  photoUrl?: string | null;
  authorName?: string;
  daysLeft?: number;
  facts?: { items?: { name?: string; price?: number | null; currency?: string | null }[]; crowd?: string | null } | null;
};

type ShopRow = { shopId: string; name: string; status: string; slug?: string };

const primary =
  "inline-flex min-h-16 w-full items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink disabled:opacity-60";
const danger =
  "inline-flex min-h-16 w-full items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg disabled:opacity-60";

export function OwnerDesk() {
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [liveNow, setLiveNow] = useState<Card[]>([]);
  const [counts, setCounts] = useState({ keptToday: 0, passedToday: 0 });
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [arm, setArm] = useState<string | null>(null);
  const startX = useRef<number | null>(null);
  const card = cards[0];
  const verified = (shops ?? []).some((shop) => shop.status === "verified");

  async function load() {
    const [home, inbox] = await Promise.all([
      fetch("/api/owner/home"),
      fetch("/api/owner/inbox"),
    ]);
    if (home.status === 401 || inbox.status === 401) {
      setError(t("en", "post.signin"));
      setShops([]);
      return;
    }
    const homeBody = (await home.json().catch(() => null)) as { shops?: ShopRow[] } | null;
    const inboxBody = (await inbox.json().catch(() => null)) as {
      cards?: Card[];
      liveNow?: Card[];
      keptToday?: number;
      passedToday?: number;
    } | null;
    setShops(homeBody?.shops ?? []);
    setCards(inboxBody?.cards ?? []);
    setLiveNow(inboxBody?.liveNow ?? []);
    setCounts({ keptToday: inboxBody?.keptToday ?? 0, passedToday: inboxBody?.passedToday ?? 0 });
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

  async function act(kind: "keep" | "pass", id: string) {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const response = await fetch("/api/owner/" + kind, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
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
      await load();
    } catch {
      setError(t("en", "loop.fail"));
    } finally {
      setBusy(false);
    }
  }

  if (shops === null) return <h1 className="text-title font-bold text-fg">{t("en", "loop.owner")}</h1>;

  if (!verified) {
    const pending = (shops ?? []).find((shop) => shop.status === "pending");
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-bold text-fg">{t("en", "loop.owner")}</h1>
        <p className="text-body text-fg">{pending ? t("en", "loop.waiting") : t("en", "loop.claimHint")}</p>
        {error ? <p role="alert" className="text-body text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-bold text-fg">{t("en", "loop.owner")}</h1>
      {note ? <p className="text-body text-fg motion-safe:animate-pulse">{note}</p> : null}
      {error ? <p role="alert" className="text-body text-danger">{error}</p> : null}
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
        <div className="flex flex-col gap-2">
          <p className="text-heading font-bold text-fg">{t("en", "loop.caught")}</p>
          <p className="text-body text-fg-muted">
            {t("en", "loop.today", { kept: String(counts.keptToday), passed: String(counts.passedToday) })}
          </p>
        </div>
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
            if (delta > 0.4) void act("keep", card.id);
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
          <button type="button" className={primary} disabled={busy} onClick={() => void act("keep", card.id)}>
            {t("en", "loop.keep")}
          </button>
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
    </div>
  );
}
