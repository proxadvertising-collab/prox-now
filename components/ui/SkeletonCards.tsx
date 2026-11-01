const block =
  "h-24 animate-shimmer rounded-lg border border-border bg-[linear-gradient(90deg,var(--color-surface-1)_25%,var(--color-surface-3)_50%,var(--color-surface-1)_75%)] bg-[length:200%_100%]";

export function SkeletonCards() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className={block} />
      <div className={block} />
      <div className={block} />
    </div>
  );
}
