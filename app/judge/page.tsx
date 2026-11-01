import { Suspense } from "react";
import { t } from "@/lib/copy";
import { JudgeEnter } from "./enter-form";

export async function JudgeNotReset({
  searchParams,
}: {
  searchParams: Promise<{ notReset?: string }>;
}) {
  const params = await searchParams;
  if (params.notReset !== "1") return null;
  return <p role="status" className="text-body text-fg">{t("en", "judge.notReset")}</p>;
}

export default function JudgePage({
  searchParams,
}: {
  searchParams: Promise<{ notReset?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-6 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div>
        <h1 className="text-display font-bold text-fg">{t("en", "judge.title")}</h1>
        <p className="mt-2 text-body text-fg-muted">{t("en", "auth.tagline")}</p>
      </div>
      <Suspense fallback={null}>
        <JudgeNotReset searchParams={searchParams} />
      </Suspense>
      <JudgeEnter />
    </main>
  );
}
