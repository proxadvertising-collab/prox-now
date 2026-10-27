"use client";

import { useEffect, useRef } from "react";
import { previewRgba, type NormBox } from "@/lib/snap/faces";

const hit =
  "absolute min-h-11 min-w-11 border-2 border-white bg-black/20 text-caption font-semibold text-white touch-manipulation";

export function FaceChooser({
  src,
  alt,
  boxes,
  shown,
  label,
  onToggle,
}: {
  src: string;
  alt: string;
  boxes: readonly NormBox[];
  shown: readonly number[];
  label: string;
  onToggle: (index: number) => void;
}) {
  return (
    <div className="relative">
      <img src={src} alt={alt} className="h-auto w-full rounded-lg" />
      {boxes.map((box, index) => {
        const on = shown.includes(index);
        return (
          <button
            key={index}
            type="button"
            className={hit + (on ? " border-accent" : "")}
            style={{
              left: box[0] * 100 + "%",
              top: box[1] * 100 + "%",
              width: Math.max((box[2] - box[0]) * 100, 12) + "%",
              height: Math.max((box[3] - box[1]) * 100, 12) + "%",
            }}
            aria-pressed={on}
            aria-label={label}
            onClick={() => onToggle(index)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function PublishPreview({
  src,
  boxes,
  shown,
}: {
  src: string;
  boxes: readonly NormBox[];
  shown: readonly number[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancel = false;
    const image = new Image();
    image.onload = () => {
      if (cancel) return;
      const scale = Math.min(1, 480 / Math.max(image.naturalWidth, image.naturalHeight, 1));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, width, height);
      const frame = ctx.getImageData(0, 0, width, height);
      frame.data.set(previewRgba(frame.data, width, height, boxes, shown));
      ctx.putImageData(frame, 0, 0);
    };
    image.src = src;
    return () => {
      cancel = true;
    };
  }, [src, boxes, shown]);

  return <canvas ref={ref} className="h-auto w-full rounded-lg" />;
}
