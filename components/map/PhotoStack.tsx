"use client";

import { useRef, useSyncExternalStore } from "react";
import { t } from "../../lib/copy";
import {
  clampPhotoIndex,
  photoCounter,
  photoTimeLabel,
  stackScrollBehavior,
  stackStep,
} from "../../lib/map/sheet";
import type { LivePost } from "../../lib/posts/source";

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function reducedMotionNow(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PhotoStack({
  photos,
  now,
  index,
  onIndex,
}: {
  photos: readonly LivePost[];
  now: number;
  index: number;
  onIndex: (index: number) => void;
}) {
  const dragRef = useRef<{ x: number } | null>(null);
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false);
  const photoAt = clampPhotoIndex(index, photos.length);
  const current = photos[photoAt];
  if (!current) return null;

  return (
    <div className="prox-stack relative mb-3" data-reduced={reduced ? "true" : "false"}>
      <div
        className="overflow-hidden rounded-md"
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          dragRef.current = { x: event.clientX };
        }}
        onPointerUp={(event) => {
          const from = dragRef.current;
          dragRef.current = null;
          if (!from) return;
          onIndex(stackStep(photoAt, photos.length, event.clientX - from.x));
        }}
      >
        <div
          className={
            "prox-stack__track flex w-full " +
            (stackScrollBehavior(reduced) === "auto" ? "prox-stack__track--still" : "")
          }
          style={{ transform: "translateX(-" + String(photoAt * 100) + "%)" }}
        >
          {photos.map((photo, photoIndex) => (
            <div key={photo.id} className="w-full shrink-0 grow-0 basis-full">
              {photo.photoUrl ? (
                <img
                  src={photo.photoUrl}
                  alt={photo.shopName}
                  loading={photoIndex === 0 ? "eager" : "lazy"}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="aspect-[4/3] w-full bg-surface-2" />
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-body text-fg">{photoTimeLabel(current, now)}</p>
      {photos.length > 1 ? (
        <>
          <p className="text-center text-label font-semibold text-fg" data-photo-counter>
            {photoCounter(photoAt, photos.length)}
          </p>
          <div className="mt-1 flex items-center justify-center gap-1">
            {photos.map((photo, photoIndex) => (
              <button
                key={photo.id}
                type="button"
                aria-label={photoCounter(photoIndex, photos.length)}
                aria-current={photoIndex === photoAt ? "true" : undefined}
                className="inline-flex min-h-11 min-w-11 items-center justify-center"
                onClick={() => onIndex(photoIndex)}
              >
                <span className={"h-2 w-2 rounded-full " + (photoIndex === photoAt ? "bg-accent" : "bg-border")} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="absolute left-1 top-[28%] inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-surface-1 text-heading font-bold text-fg"
            aria-label={t("en", "sheet.prev")}
            onClick={() => onIndex(clampPhotoIndex(photoAt - 1, photos.length))}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className="absolute right-1 top-[28%] inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-surface-1 text-heading font-bold text-fg"
            aria-label={t("en", "sheet.next")}
            onClick={() => onIndex(clampPhotoIndex(photoAt + 1, photos.length))}
          >
            <span aria-hidden="true">›</span>
          </button>
        </>
      ) : null}
    </div>
  );
}
