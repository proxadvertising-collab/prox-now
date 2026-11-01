"use client";

import { useEffect, useState } from "react";
import { BOOK_PROGRESS } from "@/lib/judge/script";

const STEPS = ["Reading photos", "Finding the shop name", "Sorting categories", "Translating"] as const;

/** Timed steps. The last one stays active until the book screen replaces this one. */
export function BuildProgress() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timers = [12000, 28000, 45000].map((delay, index) => window.setTimeout(() => setCurrent(index + 1), delay));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="w-[min(92vw,420px)] rounded-3xl bg-surface-1 p-6 text-fg shadow-card">
      <h1 className="text-2xl font-bold leading-tight">{BOOK_PROGRESS}</h1>
      <ol className="mt-5 flex flex-col gap-3">
        {STEPS.map((label, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={label} className="flex items-center gap-3 text-base font-semibold">
              <span
                className={
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm " +
                  (done ? "bg-fg text-bg" : active ? "bg-accent text-accent-ink" : "bg-surface-3 text-fg-subtle")
                }
                aria-hidden="true"
              >
                {done ? "✓" : String(index + 1)}
              </span>
              <span className={active || done ? "text-fg" : "text-fg-subtle"}>{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
