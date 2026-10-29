"use client";

import { Children, useState, type PointerEvent, type ReactNode } from "react";

const SWIPE_PX = 48;

export function swipeStep(index: number, count: number, deltaX: number): number {
  if (count <= 0 || Math.abs(deltaX) < SWIPE_PX) return index;
  if (deltaX < 0) return Math.min(count - 1, index + 1);
  return Math.max(0, index - 1);
}

export function BookSwiper({ children }: { children: ReactNode }) {
  const cards = Children.toArray(children);
  const count = cards.length;
  const [index, setIndex] = useState(0);
  const [origin, setOrigin] = useState<number | null>(null);
  const safe = count === 0 ? 0 : Math.min(Math.max(index, 0), count - 1);
  const upcoming = safe + 1 < count ? cards[safe + 1] : null;

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    setOrigin(event.clientX);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (origin == null) return;
    setIndex(swipeStep(safe, count, event.clientX - origin));
    setOrigin(null);
  }

  return (
    <div className="book-swiper" data-count={count} data-index={safe}>
      <style>{`
        .book-swiper, .book-swiper-stack { touch-action: pan-y; }
        .book-swiper-stack { position: relative; }
        .book-swiper-card { transition: transform 180ms ease; }
        .book-swiper-peek {
          position: absolute;
          z-index: 0;
          top: 12px;
          right: 0;
          left: 16px;
          transform: translate(14px, 12px) scale(0.96);
          pointer-events: none;
        }
        .book-swiper-current { position: relative; z-index: 1; }
        @media (prefers-reduced-motion: reduce) {
          .book-swiper-card { transition: none; }
        }
      `}</style>
      <div
        className="book-swiper-stack"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setOrigin(null)}
      >
        {upcoming ? (
          <div className="book-swiper-card book-swiper-peek" aria-hidden="true">
            {upcoming}
          </div>
        ) : null}
        {cards[safe] ? <div className="book-swiper-card book-swiper-current">{cards[safe]}</div> : null}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Previous page"
          className="min-h-11 min-w-11 rounded-md bg-surface-2 text-title text-fg"
          onClick={() => setIndex(swipeStep(safe, count, SWIPE_PX))}
          disabled={safe <= 0}
        >
          ‹
        </button>
        <div className="flex gap-1" aria-label="Pages">
          {cards.map((_, dot) => (
            <span
              key={dot}
              data-dot={dot === safe ? "current" : "rest"}
              className={"h-2 w-2 rounded-full " + (dot === safe ? "bg-accent" : "bg-surface-2")}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Next page"
          className="min-h-11 min-w-11 rounded-md bg-surface-2 text-title text-fg"
          onClick={() => setIndex(swipeStep(safe, count, -SWIPE_PX))}
          disabled={count === 0 || safe >= count - 1}
        >
          ›
        </button>
      </div>
    </div>
  );
}
