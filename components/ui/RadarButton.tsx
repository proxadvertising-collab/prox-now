"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type PointerEvent } from "react";

const SWEEP = "M0 0L0-78A78 78 0 0 0-55.2-55.2Z";
const ARM = "M0 0V-78";
const TICKS = "M0-91v18 M91 0H73 M0 91V73 M-91 0h18";

export function RadarButton({
  label = "Take a photo",
  onClick,
  href,
  className = "",
  style,
  size = 68,
  current = false,
  caption,
}: {
  label?: string;
  onClick?: () => void;
  href?: string;
  className?: string;
  style?: CSSProperties;
  size?: number;
  current?: boolean;
  caption?: string;
}) {
  const filterId = "radar-glow-" + useId().replace(/:/g, "");
  const [fast, setFast] = useState(false);
  const pressed = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    setFast(true);
    window.setTimeout(() => setFast(false), 300);
  };
  const mark = (
    <span
      className="radar-mark inline-flex"
      style={{ transform: fast ? "scale(0.93)" : "none", transition: "transform 150ms ease" }}
    >
      <svg viewBox="-91 -91 182 182" width={size} height={size} aria-hidden="true">
        <style>
          {
            ".sw{transform-origin:0 0;animation:sw 3.6s linear infinite}" +
            ".bl{animation:bl 2s ease-in-out infinite}" +
            ".radar-sweep{width:156px;height:156px;border-radius:999px;background:conic-gradient(from -90deg, color-mix(in srgb, var(--color-accent) 75%, white), transparent 78deg)}" +
            "@keyframes sw{to{transform:rotate(360deg)}}" +
            "@keyframes bl{50%{opacity:.45}}" +
            "@media (prefers-reduced-motion:reduce){.sw,.bl{animation:none}}"
          }
        </style>
        <defs>
          <filter id={filterId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle r="78" fill="none" stroke="var(--color-accent)" strokeWidth="3" opacity="0.35" />
        <circle r="56" fill="none" stroke="var(--color-accent)" strokeWidth="3" opacity="0.6" />
        <circle r="34" fill="none" stroke="var(--color-accent)" strokeWidth="3" opacity="0.9" />
        <path d={TICKS} fill="none" stroke="var(--color-accent)" strokeWidth="3" />
        <g className="sw" style={fast ? { animationDuration: "0.45s" } : undefined}>
          <foreignObject x="-78" y="-78" width="156" height="156">
            <div className="radar-sweep" />
          </foreignObject>
          <path d={SWEEP} fill="none" />
          <path
            d={ARM}
            fill="none"
            stroke="color-mix(in srgb, white 42%, var(--color-accent))"
            strokeWidth="3"
            filter={"url(#" + filterId + ")"}
          />
        </g>
        <circle className="bl" r="7" fill="var(--color-accent)" filter={"url(#" + filterId + ")"} />
      </svg>
    </span>
  );
  const box = "inline-flex flex-col items-center justify-center gap-2 bg-transparent p-0 " + className;
  const words = caption ? <span className="text-label font-semibold text-fg">{caption}</span> : null;
  if (href) {
    return (
      <Link
        href={href}
        aria-label={label}
        aria-current={current ? "page" : undefined}
        className={box}
        style={style}
        onPointerDown={pressed}
      >
        {mark}
        {words}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} className={box} style={style} onClick={onClick} onPointerDown={pressed}>
      {mark}
      {words}
    </button>
  );
}
