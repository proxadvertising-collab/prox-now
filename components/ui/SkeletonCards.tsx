export function SkeletonCards() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="h-24 animate-pulse rounded-lg bg-[#FFF4E8]" />
      <div className="h-24 animate-pulse rounded-lg bg-[#FFF4E8]" />
      <div className="h-24 animate-pulse rounded-lg bg-[#FFF4E8]" />
    </div>
  );
}
