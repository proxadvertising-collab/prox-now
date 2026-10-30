import Link from "next/link";

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l1.6-2h6.8L17 8h3v11H4V8z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export function EmptyState({
  message,
  action,
  camera = false,
}: {
  message: string;
  action?: { href: string; label: string };
  camera?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-4 py-6">
      {message ? <p className="text-body text-fg-muted">{message}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-center text-body font-semibold text-accent-ink no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {camera ? <CameraIcon /> : null}
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
