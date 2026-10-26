import Link from "next/link";

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-4 py-6">
      <p className="text-body text-fg-muted">{message}</p>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-6 text-center text-body font-semibold text-accent-ink no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
