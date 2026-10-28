"use client";

import { useRef, type ReactNode } from "react";
import { t } from "@/lib/copy";
import { sheetSwipeCloses } from "@/lib/map/sheet";

export function PlaceSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const start = useRef<{ y: number; t: number } | null>(null);

  return (
    <div className="absolute inset-x-3 bottom-16 z-20 flex max-h-[70%] flex-col overflow-hidden rounded-lg bg-surface-1 shadow-sheet">
      <div
        className="relative shrink-0 px-4 pb-2 pt-2"
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          start.current = { y: event.clientY, t: event.timeStamp };
        }}
        onPointerUp={(event) => {
          const from = start.current;
          start.current = null;
          if (!from) return;
          if (sheetSwipeCloses({ deltaY: event.clientY - from.y, elapsedMs: event.timeStamp - from.t, scrolling: false })) {
            onClose();
          }
        }}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
        <button
          type="button"
          className="absolute right-1 top-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-heading font-bold text-fg"
          aria-label={t("en", "sheet.close")}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}
