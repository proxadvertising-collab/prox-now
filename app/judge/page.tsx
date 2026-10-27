import { t } from "@/lib/copy";
import { JudgeEnter } from "./enter-form";

export default function JudgePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-6 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div>
        <h1 className="text-display font-bold text-fg">{t("en", "judge.title")}</h1>
        <p className="mt-2 text-body text-fg-muted">{t("en", "auth.tagline")}</p>
      </div>
      <JudgeEnter />
    </main>
  );
}
