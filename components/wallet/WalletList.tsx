"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { t } from "@/lib/copy";
import { createClient } from "@/lib/supabase/client";
import { activeCouponCount, couponPhase, type WalletCoupon } from "@/lib/wallet/coupons";

type ShownCoupon = WalletCoupon & { offer?: string | null };

function ScratchCard({
  code,
  revealed,
  onReveal,
}: {
  code: string;
  revealed: boolean;
  onReveal: () => void;
}) {
  const foil = useRef<HTMLCanvasElement>(null);
  const qr = useRef<HTMLCanvasElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const canvas = foil.current;
    if (!canvas || revealed) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [revealed]);

  useEffect(() => {
    if (!revealed) return;
    const canvas = qr.current;
    if (!canvas) return;
    let cancel = false;
    void import("qrcode").then((mod) => {
      if (cancel) return;
      return mod.toCanvas(canvas, code, { width: 180, margin: 1 });
    });
    return () => {
      cancel = true;
    };
  }, [revealed, code]);

  function scratch(clientX: number, clientY: number) {
    const canvas = foil.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || done.current) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 22, 0, Math.PI * 2);
    ctx.fill();
    const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    const step = 16;
    for (let index = 3; index < sample.length; index += step) {
      if (sample[index] === 0) clear += 1;
    }
    if (clear / (sample.length / step) > 0.45) {
      done.current = true;
      onReveal();
    }
  }

  return (
    <div className="relative min-h-48 overflow-hidden rounded-lg bg-surface-2">
      {revealed ? (
        <div className="flex flex-col items-center gap-2 p-4">
          <canvas ref={qr} className="rounded-md bg-white" aria-hidden="true" />
          <p className="text-title font-bold tracking-widest text-fg">{code}</p>
        </div>
      ) : (
        <canvas
          ref={foil}
          className="absolute inset-0 h-full w-full touch-none"
          aria-label={t("en", "loop.scratch")}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            scratch(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 0 && event.pointerType === "mouse") return;
            scratch(event.clientX, event.clientY);
          }}
        />
      )}
    </div>
  );
}

export function WalletList() {
  const [coupons, setCoupons] = useState<ShownCoupon[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [fresh, setFresh] = useState<Record<string, boolean>>({});
  const primed = useRef(false);

  useEffect(() => {
    let stopped = false;
    let channel: { unsubscribe: () => void } | null = null;
    const couponsSeen = { current: new Set<string>() };

    async function load() {
      const response = await fetch("/api/wallet/coupons");
      if (stopped) return;
      if (response.status === 401) {
        setSignedOut(true);
        setCoupons([]);
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as { coupons?: ShownCoupon[] };
      const next = Array.isArray(body.coupons) ? body.coupons : [];
      if (primed.current) {
        const arrived: Record<string, boolean> = {};
        for (const coupon of next) {
          if (!couponsSeen.current.has(coupon.id)) arrived[coupon.id] = true;
        }
        if (Object.keys(arrived).length > 0) setFresh(arrived);
      }
      primed.current = true;
      for (const coupon of next) couponsSeen.current.add(coupon.id);
      setCoupons(next);
    }

    void load();

    try {
      const supabase = createClient();
      void supabase.auth.getUser().then(({ data }) => {
        const id = data.user?.id;
        if (!id || stopped) return;
        channel = supabase
          .channel("wallet-coupons")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "coupons", filter: "holder_id=eq." + id },
            () => {
              void load();
            },
          )
          .subscribe();
      });
    } catch {
      channel = null;
    }

    return () => {
      stopped = true;
      channel?.unsubscribe();
    };
  }, []);

  if (coupons === null) {
    return <h1 className="text-title font-bold text-fg">{t("en", "nav.wallet")}</h1>;
  }

  if (signedOut) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-bold text-fg">{t("en", "nav.wallet")}</h1>
        <a className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 font-semibold text-accent-ink" href="/login?next=/wallet">
          {t("en", "auth.signIn")}
        </a>
      </div>
    );
  }

  if (coupons.length === 0) {
    return (
      <>
        <h1 className="text-title font-bold text-fg">{t("en", "nav.wallet")}</h1>
        <EmptyState message={t("en", "empty.wallet")} action={{ href: "/snap", label: t("en", "snap.cta") }} />
      </>
    );
  }

  const now = Date.now();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-bold text-fg">{t("en", "nav.wallet")}</h1>
      <ul className="flex flex-col gap-4">
        {coupons.map((coupon) => {
          const phase = couponPhase(coupon, now);
          const dim = phase !== "active";
          return (
            <li
              key={coupon.id}
              className={
                "flex flex-col gap-2 rounded-lg bg-surface-1 p-4" +
                (dim ? " opacity-50" : "") +
                (fresh[coupon.id] ? " motion-safe:animate-pulse" : "")
              }
            >
              <p className="text-heading font-bold text-fg">{coupon.shopName}</p>
              {phase === "active" ? (
                <>
                  <p className="text-body text-fg">{coupon.offer?.trim() || t("en", "loop.offer")}</p>
                  <p className="text-label text-fg-muted">
                    {t("en", "loop.validUntil", { date: coupon.expiresAt.slice(0, 10) })}
                  </p>
                  <p className="text-label text-fg-muted">{t("en", "loop.scratch")}</p>
                  <ScratchCard
                    code={coupon.code}
                    revealed={Boolean(open[coupon.id])}
                    onReveal={() => setOpen((current) => ({ ...current, [coupon.id]: true }))}
                  />
                </>
              ) : (
                <p className="text-body text-fg">{t("en", phase === "used" ? "loop.used" : "loop.expired")}</p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="sr-only">{activeCouponCount(coupons, now)}</p>
    </div>
  );
}
