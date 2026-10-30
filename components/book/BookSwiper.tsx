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
  const behind: number[] = [];

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
      <div className="book-progress" aria-label="Pages">
        {cards.map((_, dot) => (
          <span key={dot} className={"book-progress-seg" + (dot <= safe ? " book-progress-seg-on" : "")}>
            <span />
          </span>
        ))}
      </div>
      <div
        className="book-stack"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setOrigin(null)}
      >
        {behind.map((step) => (
          <div
            key={step}
            className="book-peek"
            aria-hidden="true"
            style={{
              zIndex: 3 - step,
              transform: "translateY(" + step * 8 + "px) scale(" + Number((0.97 ** step).toFixed(4)) + ")",
            }}
          >
            {cards[safe + step]}
          </div>
        ))}
        {cards[safe] ? <div className="book-current">{cards[safe]}</div> : null}
      </div>
      <div className="book-nav">
        <button
          type="button"
          aria-label="Previous page"
          className="book-nav-btn"
          onClick={() => setIndex(swipeStep(safe, count, SWIPE_PX))}
          disabled={safe <= 0}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next page"
          className="book-nav-btn"
          onClick={() => setIndex(swipeStep(safe, count, -SWIPE_PX))}
          disabled={count === 0 || safe >= count - 1}
        >
          ›
        </button>
      </div>
    </div>
  );
}
