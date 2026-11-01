import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LanguageSwitch } from "@/components/me/LanguageSwitch";
import { BehindSwitch } from "@/components/me/BehindSwitch";
import { MoreSheet } from "@/components/shell/MoreSheet";
import { t } from "@/lib/copy";
import { DEMO_SESSION_COOKIE } from "@/lib/demo/zone";
import { JUDGE_COOKIE } from "@/lib/judge/session";
import { createClient } from "@/lib/supabase/server";

async function signOut(): Promise<void> {
  "use server";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  const jar = await cookies();
  jar.set(JUDGE_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
  jar.set(DEMO_SESSION_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
  redirect("/login");
}

function isDigest(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

async function MeAccount() {
  await connection();
  let email: string | null = null;
  let signedIn = false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    const supabase = await createClient();
    try {
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
      email = data.user?.email ?? null;
    } catch (error) {
      if (isDigest(error)) throw error;
      signedIn = false;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-bold text-fg">{t("en", "nav.you")}</h1>
      {signedIn ? (
        <>
          {email ? (
            <p className="break-all text-body text-fg">{t("en", "auth.signedIn", { email })}</p>
          ) : null}
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-surface-2 px-4 text-base font-semibold text-fg no-underline"
            >
              {t("en", "auth.signOut")}
            </button>
          </form>
        </>
      ) : (
        <Link
          href="/login?next=%2Fme"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-accent px-4 text-base font-semibold text-accent-ink no-underline"
        >
          {t("en", "auth.signIn")}
        </Link>
      )}
      <MoreSheet label="More">
        <LanguageSwitch />
        <BehindSwitch />
      </MoreSheet>
    </div>
  );
}

export default function MePage() {
  return (
    <Suspense fallback={<h1 className="text-title font-bold text-fg">{t("en", "nav.you")}</h1>}>
      <MeAccount />
    </Suspense>
  );
}
