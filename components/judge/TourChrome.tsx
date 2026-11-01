"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  advanceStep,
  clearJudgeTour,
  EXPLAINERS,
  explainer,
  pathStep,
  readSeen,
  readTour,
  rememberSeen,
  showExplainer,
  startJudgeTour,
  swapShopperHref,
  swapTour,
  tourHref,
  writeSeen,
  type StepId,
  type Tour,
} from "@/lib/judge/script";
import { hasJudgeCookie } from "@/lib/judge/session";

export function TourChrome() {
  const pathname = usePathname() ?? "";
  const [tour, setTour] = useState<Tour | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const [located, setLocated] = useState(pathname);
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = barRef.current;
    const root = document.documentElement;
    if (!node) {
      root.style.removeProperty("--tour-bar");
      return;
    }
    const apply = () => {
      const bottom = Math.max(0, Math.ceil(node.getBoundingClientRect().bottom));
      root.style.setProperty("--tour-bar", bottom + "px");
    };
    apply();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(node);
    window.addEventListener("resize", apply);
    window.addEventListener("scroll", apply, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("scroll", apply, true);
      root.style.removeProperty("--tour-bar");
    };
  }, [tour, hidden, located, seen]);

  useEffect(() => {
    function sync() {
      if (!hasJudgeCookie(document.cookie)) {
        clearJudgeTour();
        setTour(null);
        setSeen([]);
        setHidden(true);
        return;
      }
      const here = window.location.pathname + window.location.search;
      setLocated(here);
      setHidden(false);
      const stored = readTour();
      const fromPath = pathStep(here);
      if (stored && fromPath) {
        const step = advanceStep(stored.step, fromPath);
        if (step !== stored.step) {
          const next = { ...stored, step };
          startJudgeTour(next);
          setTour(next);
        } else {
          setTour(stored);
        }
      } else {
        setTour(stored);
      }
      setSeen(readSeen());
    }
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("prox-step", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("prox-step", sync);
    };
  }, [pathname]);

  const step: StepId | null = tour?.step ?? pathStep(located);
  if (!step || hidden) return null;
  if (!showExplainer({ judge: Boolean(tour), step, seen })) return null;
  const card = explainer(step);

  function skip() {
    const next = rememberSeen(seen, step as StepId);
    writeSeen(next);
    setSeen(next);
    setHidden(true);
  }

  async function endDemo() {
    const response = await fetch("/api/judge/exit", { method: "POST" }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { next?: string } | null;
    clearJudgeTour();
    window.location.assign(payload?.next === "/judge?notReset=1" ? "/judge?notReset=1" : "/judge");
  }

  async function swap() {
    if (!tour) return;
    const next = swapTour(tour);
    const response = await fetch("/api/judge/enter?role=" + next.enter, { method: "POST" });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    if (!response.ok || !payload?.ok) return;
    const href = next.role === "shopper" ? swapShopperHref(tour.step) : tourHref(next.role);
    const saved = {
      cafe: next.cafe,
      role: next.role,
      step: href === "/wallet" ? "coupon" : next.step,
    };
    startJudgeTour(saved);
    window.location.assign(href);
  }

  return (
    <div ref={barRef} className="relative z-[60] px-4 pt-3">
      {tour ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-label font-semibold text-fg">Step {card.n} of {EXPLAINERS.length}</p>
          <div className="flex items-center gap-3">
            <button type="button" className="min-h-11 text-label font-semibold text-accent" onClick={() => void swap()}>
              Swap roles
            </button>
            <button type="button" className="min-h-11 text-label font-semibold text-accent" onClick={() => void endDemo()}>
              End demo
            </button>
          </div>
        </div>
      ) : null}
      <article className="rounded-lg border border-border bg-surface-1 p-3">
        <h2 className="text-label font-semibold text-fg">{card.title}</h2>
        <p className="mt-1 text-body text-fg">{card.body}</p>
        {tour ? null : (
          <button type="button" className="mt-2 min-h-11 text-label font-semibold text-accent" onClick={skip}>
            Skip
          </button>
        )}
      </article>
    </div>
  );
}
