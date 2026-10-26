import { formatRemaining, phaseFor, ringOffset, type Phase } from "@/lib/freshness";

const PHASE_STROKE: Record<Phase, string> = {
  fresh: "var(--color-accent)",
  aging: "var(--color-pin-aging)",
  last: "var(--color-pin-last)",
  expired: "var(--color-fg-subtle)",
};

function unit(count: number, one: string, many: string): string {
  return count + " " + (count === 1 ? one : many);
}

function expiresLabel(remainingMs: number): string {
  if (remainingMs <= 0) return "Expired";
  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  if (hours > 0) {
    const hourText = unit(hours, "hour", "hours");
    if (minutes === 0) return "Expires in " + hourText;
    return "Expires in " + hourText + " " + unit(minutes, "minute", "minutes");
  }
  if (remainingMs >= 600_000) {
    return "Expires in " + unit(minutes, "minute", "minutes");
  }
  return (
    "Expires in " +
    unit(minutes, "minute", "minutes") +
    " " +
    unit(seconds, "second", "seconds")
  );
}

export function CountdownRing({
  remainingMs,
  size,
}: {
  remainingMs: number;
  size: number;
}) {
  const stroke = Math.max(8, Math.round(size * 0.08));
  const radius = (size - stroke) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const offset = ringOffset(circumference, remainingMs);
  const phase = phaseFor(remainingMs);
  const center = size / 2;
  const viewBox = "0 0 " + size + " " + size;
  const spin = "rotate(-90 " + center + " " + center + ")";

  return (
    <div
      role="timer"
      aria-label={expiresLabel(remainingMs)}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={viewBox} aria-hidden="true">
        <g transform={spin}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--color-surface-3)"
            strokeWidth={stroke}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={PHASE_STROKE[phase]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </g>
      </svg>
      <span
        aria-hidden="true"
        className="absolute font-extrabold text-fg"
        style={{
          fontSize: Math.round(size * 0.16),
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatRemaining(remainingMs)}
      </span>
    </div>
  );
}
