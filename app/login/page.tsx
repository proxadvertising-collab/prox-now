import { Suspense } from "react";
import Link from "next/link";
import { safeNext } from "@/lib/auth/safe-next";
import { t } from "@/lib/copy";
import { LoginForm } from "./login-form";

type LoginQuery = {
  next?: string;
  error?: string;
};

async function LoginContent({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  const params = await searchParams;
  const nextPath = safeNext(params.next);
  const failed = params.error === "auth";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-6 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div>
        <h1 className="text-display font-bold text-fg">{t("en", "auth.title")}</h1>
        <p className="mt-2 text-body text-fg-muted">{t("en", "auth.tagline")}</p>
      </div>
      <LoginForm nextPath={nextPath} failed={failed} />
      <p className="text-label text-fg-muted">{t("en", "auth.why")}</p>
      <Link
        href="/map"
        className="inline-flex min-h-11 items-center text-base font-semibold text-accent no-underline"
      >
        {t("en", "demo.try")}
      </Link>
    </main>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-bg" />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
