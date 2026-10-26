import Link from "next/link";
import { t } from "@/lib/copy";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-display font-extrabold text-fg">Prox Now</h1>
      <p className="mt-3 text-heading text-fg-muted">
        Prox Now makes your street wonder-full
      </p>
      <Link
        href="/map"
        className="mt-8 inline-flex h-14 min-h-11 w-full items-center justify-center rounded-full bg-accent px-6 text-label font-semibold text-accent-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        {t("en", "nav.map")}
      </Link>
    </main>
  );
}
