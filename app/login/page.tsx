import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { t } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";
import { loginDest, serverSignedIn, signedInDest } from "./gate";
import { LoginForm } from "./login-form";

type LoginQuery = {
  next?: string;
  error?: string;
};

function isDigest(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

async function readUser(): Promise<{ hasUser: boolean; keep: string | undefined }> {
  const jar = await cookies();
  const keep = jar.get("prox-keep")?.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { hasUser: false, keep };
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return { hasUser: Boolean(data.user), keep };
  } catch (error) {
    if (isDigest(error)) throw error;
    return { hasUser: false, keep };
  }
}

export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginQuery> }) {
  await connection();
  const params = await searchParams;
  const { hasUser, keep } = await readUser();
  const dest = loginDest(serverSignedIn(hasUser, keep), params.next);
  if (dest) redirect(dest);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-6 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div>
        <h1 className="text-display font-bold text-fg">{t("en", "auth.title")}</h1>
        <p className="mt-2 text-body text-fg-muted">{t("en", "auth.tagline")}</p>
      </div>
      <LoginForm dest={signedInDest(params.next)} failed={params.error === "auth"} />
      <a href="/judge" className="text-label font-semibold text-fg-muted no-underline">
        Judges: try the demo
      </a>
    </main>
  );
}
