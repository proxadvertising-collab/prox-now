"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  advanceStep,
  explainer,
  pathStep,
  readSeen,
  readTour,
  rememberSeen,
  showExplainer,
  startJudgeTour,
  swapTour,
  tourHref,
  writeSeen,
  type StepId,
  type Tour,
} from "@/lib/judge/script";

export function TourChrome() {
  const pathname = usePathname() ?? "";
  const [tour, setTour] = useState<Tour | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const stored = readTour();
    const fromPath = pathStep(pathname);
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
    setHidden(false);
  }, [pathname]);

  const step: StepId | null = tour?.step ?? pathStep(pathname);
  if (!step || hidden) return null;
  if (!showExplainer({ judge: Boolean(tour), step, seen })) return null;
  const card = explainer(step);

  function skip() {
    const next = rememberSeen(seen, step as StepId);
    writeSeen(next);
    setSeen(next);
    setHidden(true);
  }

  async function swap() {
    if (!tour) return;
    const next = swapTour(tour);
    const response = await fetch("/api/judge/enter?role=" + next.enter, { method: "POST" });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    if (!response.ok || !payload?.ok) return;
    const saved = { cafe: next.cafe, role: next.role, step: next.step };
    startJudgeTour(saved);
    const href = next.role === "shopper" ? "/snap?tour=1&samples=1" : tourHref(next.role);
    window.location.assign(href);
  }

  return (
    <div className="px-4 pt-3">
      {tour ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-label font-semibold text-fg">Step {card.n} of 8</p>
          <button type="button" className="min-h-11 text-label font-semibold text-accent" onClick={() => void swap()}>
            Swap roles
          </button>
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
