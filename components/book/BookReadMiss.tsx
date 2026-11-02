import { BOOK_READ_MISS } from "@/lib/book/builder";

/** Same photos, same shop. The parent calls the build again. */
export function BookReadMiss({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 p-6">
      <p className="text-center text-body">{BOOK_READ_MISS}</p>
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface-2 px-4 text-sm font-semibold text-fg"
        onClick={onAgain}
      >
        Try again
      </button>
    </div>
  );
}
