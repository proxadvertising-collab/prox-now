import Link from "next/link";
import { RadarButton } from "@/components/ui/RadarButton";

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
      {action && camera ? <RadarButton href={action.href} caption={action.label} /> : null}
      {action && !camera ? (
        <Link
          href={action.href}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-center text-body font-semibold text-accent-ink no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
