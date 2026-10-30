const block =
  "h-24 animate-shimmer rounded-lg border border-border bg-[linear-gradient(90deg,#1E1611_25%,#2E231B_50%,#1E1611_75%)] bg-[length:200%_100%]";

export function SkeletonCards() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className={block} />
      <div className={block} />
      <div className={block} />
    </div>
  );
}
